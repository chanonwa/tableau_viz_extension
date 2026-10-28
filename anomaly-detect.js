'use strict';

// Summary statistics and anomaly detection for one series of values.
// Every method returns, per point, an expected value and a normal range; points outside the range are anomalies.
window.AnomalyDetect = (function () {
  const GRID = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  // Trend smoothing is kept low so one noisy step doesn't swing the trend
  const TREND_GRID = [0.01, 0.05, 0.1, 0.2, 0.3];
  // Consistency constant: 1.4826 × MAD estimates the standard deviation of normally distributed data
  const MAD_SCALE = 1.4826;
  // Automatic seasonality is used when the pattern explains at least this share of the detrended variation
  const SEASON_STRENGTH = 0.4;
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

  // Least-squares line through [x, y] pairs
  function lineThrough (pairs) {
    const xMean = mean(pairs.map(([x]) => x));
    const yMean = mean(pairs.map(([, y]) => y));
    const denominator = sum(pairs.map(([x]) => (x - xMean) ** 2));
    const slope = denominator > 0 ? sum(pairs.map(([x, y]) => (x - xMean) * (y - yMean))) / denominator : 0;
    return { slope, intercept: yMean - slope * xMean };
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
  // points before it. Values outside the range update the model as if they were on its edge, so a spike
  // barely drags the expected line, while a lasting shift is still followed.
  function runHolt (values, alpha, beta, sigma, k) {
    // Start from a straight line through the first few values, so the early forecasts are sensible
    const start = [];
    values.forEach((value, index) => {
      if (Number.isFinite(value) && start.length < 6) start.push([index, value]);
    });
    const line = lineThrough(start);
    let trend = line.slope;
    // Level just before the first value, so the first forecast is the line's value there
    let level = line.intercept - line.slope;

    const results = [];
    let sse = 0;
    for (const value of values) {
      const forecast = level + trend;
      if (!Number.isFinite(value)) {
        results.push(null);
        level = forecast;
        continue;
      }
      const error = value - forecast;
      sse += error * error;
      const observed = sigma === null ? value : Math.min(forecast + k * sigma, Math.max(forecast - k * sigma, value));
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
      for (const beta of TREND_GRID) {
        const run = runHolt(values, alpha, beta, null, k);
        if (!best || run.sse < best.sse) best = { alpha, beta, sse: run.sse };
      }
    }
    // Residual spread from MAD, so the anomalies don't widen the range that is meant to catch them. The
    // trimmed standard deviation is a floor for when most errors are almost zero and MAD collapses.
    const errors = runHolt(values, best.alpha, best.beta, null, k).results.filter(Boolean).map(item => item.error);
    const trimmed = [...errors].sort((a, b) => Math.abs(a) - Math.abs(b)).slice(0, Math.max(2, Math.ceil(errors.length * 0.9)));
    const sigma = Math.max(robustScale(errors), standardDeviation(trimmed));
    const { results } = runHolt(values, best.alpha, best.beta, sigma, k);
    return results.map(item => item && {
      expected: item.forecast,
      low: item.forecast - k * sigma,
      high: item.forecast + k * sigma,
      scale: sigma
    });
  }

  // Classical additive decomposition. A centred moving average one season long gives the trend; the
  // median detrended value at each season position (for example each month) gives its seasonal index.
  // Strength = 1 − Var(remainder) / Var(detrended), from 0 (no pattern) to 1 (pure pattern).
  function seasonality (values, positions, length) {
    const n = values.length;
    if (!(length > 1) || values.filter(Number.isFinite).length < 2 * length) return null;
    const half = Math.floor(length / 2);
    const even = length % 2 === 0;
    const trend = values.map((_, index) => {
      if (index < half || index >= n - half) return null;
      let total = 0;
      for (let j = -half; j <= half; j++) {
        const neighbour = values[index + j];
        if (!Number.isFinite(neighbour)) return null;
        // An even-length centred average puts half weight on the two end points
        total += even && Math.abs(j) === half ? neighbour / 2 : neighbour;
      }
      return total / length;
    });
    // The centred average stops half a season from each end. Extending it with a line through the
    // nearest season of trend values gives every position a full set of years, so the median per
    // position can outvote a one-off spike.
    const known = trend.map((value, index) => [index, value]).filter(([, value]) => value !== null);
    if (known.length < 2) return null;
    const head = lineThrough(known.slice(0, length));
    const tail = lineThrough(known.slice(-length));
    const detrended = values.map((value, index) => {
      if (!Number.isFinite(value)) return null;
      const line = index < known[0][0] ? head : tail;
      const base = trend[index] ?? line.intercept + line.slope * index;
      return value - base;
    });

    const byPosition = Array.from({ length }, () => []);
    detrended.forEach((value, index) => {
      if (value !== null) byPosition[positions[index]].push(value);
    });
    if (byPosition.some(group => group.length === 0)) return null;
    const raw = byPosition.map(median);
    const center = mean(raw);
    const indices = raw.map(value => value - center);

    const present = [];
    const remainders = [];
    detrended.forEach((value, index) => {
      if (value === null) return;
      present.push(value);
      remainders.push(value - indices[positions[index]]);
    });
    const total = standardDeviation(present) ** 2;
    const strength = total > 0 ? Math.max(0, 1 - standardDeviation(remainders) ** 2 / total) : 0;
    return { length, indices, strength };
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
  // options: { method, sensitivity, threshold, direction, window, minChange (% of expected), isTimeSeries,
  //            seasonality: 'auto' | 'on' | 'off', seasonLength, positions (season position of each value) }
  function detect (values, options) {
    let season = null;
    if (options.isTimeSeries && options.seasonality !== 'off' && options.seasonLength > 1 && options.positions) {
      season = seasonality(values, options.positions, options.seasonLength);
      if (season) season.applied = options.seasonality === 'on' || season.strength >= SEASON_STRENGTH;
    }
    // With seasonality applied, detection runs on seasonally adjusted values and the pattern is added back
    const seasonal = index => season?.applied ? season.indices[options.positions[index]] : 0;
    const adjusted = values.map((value, index) => Number.isFinite(value) ? value - seasonal(index) : value);

    const present = adjusted.filter(Number.isFinite);
    const method = resolveMethod(options.method, options.isTimeSeries, present.length);
    const k = getThreshold(method, options);
    const base = { method, k, label: METHOD_LABELS[method], season };
    if (present.length < 4) {
      return { ...base, points: values.map(() => null), error: 'Needs at least 4 values' };
    }

    let bands;
    if (method === 'rolling') bands = rollingBands(adjusted, k, options.window);
    else if (method === 'smoothing') bands = smoothingBands(adjusted, k);
    else bands = adjusted.map(globalBands(present, method, k));

    const points = values.map((value, index) => {
      const band = bands[index];
      if (!Number.isFinite(value) || !band) return null;
      const effect = seasonal(index);
      const expected = band.expected + effect;
      const low = band.low + effect;
      const high = band.high + effect;
      const deviation = value - expected;
      const score = band.scale > 0 ? deviation / band.scale : 0;
      let direction = null;
      if (value > high && band.scale > 0) direction = 'high';
      if (value < low && band.scale > 0) direction = 'low';
      if (direction && options.direction !== 'both' && options.direction !== direction) direction = null;
      // Statistically unusual but too small to matter
      if (direction && options.minChange > 0 && Math.abs(deviation) < Math.abs(expected) * options.minChange / 100) direction = null;
      return { expected, low, high, scale: band.scale, seasonal: effect, value, deviation, score, anomaly: direction };
    });
    return { ...base, points };
  }

  return { detect, summarize, SEASON_STRENGTH };
})();
