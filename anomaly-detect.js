'use strict';

// Summary statistics and anomaly detection for one series of values.
// Every method returns, per point, an expected value and a normal range; points outside the range are anomalies.
window.AnomalyDetect = (function () {
  const GRID = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  // Consistency constant: 1.4826 × MAD estimates the standard deviation of normally distributed data
  const MAD_SCALE = 1.4826;
  const METHOD_LABELS = {
    zscore: 'Z-score',
    iqr: 'Interquartile range',
    rolling: 'Rolling median',
    smoothing: 'Trend model'
  };
  // Threshold per method for each sensitivity. Higher sensitivity = narrower range = more anomalies.
  const THRESHOLDS = {
    zscore: { low: 3, medium: 2.5, high: 2 },
    iqr: { low: 3, medium: 1.5, high: 1 },
    rolling: { low: 4, medium: 3, high: 2.5 },
    smoothing: { low: 4, medium: 3, high: 2.5 }
  };

  function sum (values) {
    return values.reduce((total, value) => total + value, 0);
  }

  function mean (values) {
    return sum(values) / values.length;
  }

  // Linear interpolation between closest ranks, as in Tableau's PERCENTILE
  function quantile (sorted, p) {
    if (sorted.length === 0) return NaN;
    const position = (sorted.length - 1) * p;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  }

  function median (values) {
    return quantile([...values].sort((a, b) => a - b), 0.5);
  }

  function standardDeviation (values) {
    if (values.length < 2) return 0;
    const average = mean(values);
    return Math.sqrt(sum(values.map(value => (value - average) ** 2)) / (values.length - 1));
  }

  function robustScale (values) {
    const center = median(values);
    return MAD_SCALE * median(values.map(value => Math.abs(value - center)));
  }

  // Least-squares slope per point, used for the trend in the summary
  function slope (values) {
    const n = values.length;
    if (n < 2) return 0;
    const xMean = (n - 1) / 2;
    const yMean = mean(values);
    let numerator = 0;
    let denominator = 0;
    values.forEach((value, index) => {
      numerator += (index - xMean) * (value - yMean);
      denominator += (index - xMean) ** 2;
    });
    return numerator / denominator;
  }

  function summarize (values) {
    const present = values.filter(Number.isFinite);
    if (present.length === 0) return null;
    const sorted = [...present].sort((a, b) => a - b);
    const first = present[0];
    const last = present[present.length - 1];
    return {
      count: present.length,
      missing: values.length - present.length,
      sum: sum(present),
      mean: mean(present),
      median: quantile(sorted, 0.5),
      std: standardDeviation(present),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      q1: quantile(sorted, 0.25),
      q3: quantile(sorted, 0.75),
      slope: slope(present),
      change: first !== 0 ? (last - first) / Math.abs(first) : null
    };
  }

  function globalBands (present, method, k) {
    if (method === 'zscore') {
      const center = mean(present);
      const spread = standardDeviation(present);
      return () => ({ expected: center, low: center - k * spread, high: center + k * spread, scale: spread });
    }
    const sorted = [...present].sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const center = quantile(sorted, 0.5);
    return () => ({ expected: center, low: q1 - k * iqr, high: q3 + k * iqr, scale: iqr });
  }

  // Median and MAD of the neighbouring points (the point itself is left out so it can't hide its own spike)
  function rollingBands (values, k, window) {
    const half = Math.max(1, Math.floor(window / 2));
    return values.map((_, index) => {
      const neighbours = [];
      for (let j = index - half; j <= index + half; j++) {
        if (j !== index && j >= 0 && j < values.length && Number.isFinite(values[j])) neighbours.push(values[j]);
      }
      if (neighbours.length < 2) return null;
      const center = median(neighbours);
      const spread = robustScale(neighbours);
      return { expected: center, low: center - k * spread, high: center + k * spread, scale: spread };
    });
  }

  // Holt's linear exponential smoothing. Each point is compared with the one-step-ahead forecast from the
  // points before it. Anomalies update the model with the forecast instead of the value, so a spike
  // doesn't drag the expected line after it.
  function runHolt (values, alpha, beta, sigma, k) {
    const results = [];
    let level = null;
    let trend = 0;
    let sse = 0;
    let seen = 0;
    for (const value of values) {
      if (!Number.isFinite(value)) {
        results.push(null);
        if (level !== null) level += trend;
        continue;
      }
      // The first two values only set the starting level and trend
      seen++;
      if (seen <= 2) {
        if (seen === 2) trend = value - level;
        level = value;
        results.push(null);
        continue;
      }
      const forecast = level + trend;
      const error = value - forecast;
      sse += error * error;
      const outlier = sigma !== null && Math.abs(error) > k * sigma;
      const observed = outlier ? forecast : value;
      const previousLevel = level;
      level = alpha * observed + (1 - alpha) * forecast;
      trend = beta * (level - previousLevel) + (1 - beta) * trend;
      results.push({ forecast, error });
    }
    return { results, sse };
  }

  function smoothingBands (values, k) {
    let best = null;
    for (const alpha of GRID) {
      for (const beta of GRID) {
        const run = runHolt(values, alpha, beta, null, k);
        if (!best || run.sse < best.sse) best = { alpha, beta, sse: run.sse };
      }
    }
    // Residual spread from MAD, so the anomalies don't widen the range that is meant to catch them
    const errors = runHolt(values, best.alpha, best.beta, null, k).results.filter(Boolean).map(item => item.error);
    const sigma = robustScale(errors) || standardDeviation(errors);
    const { results } = runHolt(values, best.alpha, best.beta, sigma, k);
    return results.map(item => item && {
      expected: item.forecast,
      low: item.forecast - k * sigma,
      high: item.forecast + k * sigma,
      scale: sigma
    });
  }

  function resolveMethod (method, isTimeSeries, count) {
    if (method !== 'auto') return method;
    return isTimeSeries && count >= 8 ? 'smoothing' : 'iqr';
  }

  function getThreshold (method, options) {
    if (options.sensitivity === 'custom' && options.threshold > 0) return options.threshold;
    return THRESHOLDS[method][options.sensitivity] ?? THRESHOLDS[method].medium;
  }

  // values: numbers in category order (null for missing).
  // options: { method, sensitivity, threshold, direction, window, isTimeSeries }
  function detect (values, options) {
    const present = values.filter(Number.isFinite);
    const method = resolveMethod(options.method, options.isTimeSeries, present.length);
    const k = getThreshold(method, options);
    if (present.length < 4) {
      return { method, k, label: METHOD_LABELS[method], points: values.map(() => null), error: 'Needs at least 4 values' };
    }

    let bands;
    if (method === 'rolling') bands = rollingBands(values, k, options.window);
    else if (method === 'smoothing') bands = smoothingBands(values, k);
    else bands = values.map(globalBands(present, method, k));

    const points = values.map((value, index) => {
      const band = bands[index];
      if (!Number.isFinite(value) || !band) return null;
      const deviation = value - band.expected;
      const score = band.scale > 0 ? deviation / band.scale : 0;
      let direction = null;
      if (value > band.high && band.scale > 0) direction = 'high';
      if (value < band.low && band.scale > 0) direction = 'low';
      if (direction && options.direction !== 'both' && options.direction !== direction) direction = null;
      return { ...band, value, deviation, score, anomaly: direction };
    });
    return { method, k, label: METHOD_LABELS[method], points };
  }

  return { detect, summarize, METHOD_LABELS, THRESHOLDS };
})();
