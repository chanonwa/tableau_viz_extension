'use strict';

// Exponential smoothing forecast modelled on Tableau's Forecast Options: trend and season can each be
// none, additive, or multiplicative, and "automatic" picks the candidate model with the lowest AICc.
window.ComboForecast = (function () {
  const GRID = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
  const Z_SCORES = { 90: 1.6449, 95: 1.96, 99: 2.5758 };
  const TYPE_LABELS = { none: 'None', additive: 'Additive', multiplicative: 'Multiplicative' };

  function average (values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function project (level, trend, trendType, steps) {
    if (trendType === 'additive') return level + steps * trend;
    if (trendType === 'multiplicative') return level * trend ** steps;
    return level;
  }

  function applySeason (base, season, seasonType) {
    if (seasonType === 'additive') return base + season;
    if (seasonType === 'multiplicative') return base * season;
    return base;
  }

  function fit (values, model, alpha, beta, gamma) {
    const { trend: trendType, season: seasonType, seasonLength: m } = model;
    const n = values.length;
    const seasonal = seasonType !== 'none';
    let level;
    let trend = 0;
    let season = [];
    let start;

    if (seasonal) {
      const firstMean = average(values.slice(0, m));
      const secondMean = average(values.slice(m, 2 * m));
      level = firstMean;
      if (trendType === 'additive') trend = (secondMean - firstMean) / m;
      if (trendType === 'multiplicative') trend = (secondMean / firstMean) ** (1 / m);
      season = values.slice(0, m).map(value => seasonType === 'additive' ? value - firstMean : value / firstMean);
      start = m;
    } else {
      level = values[0];
      if (trendType === 'additive') trend = values[1] - values[0];
      if (trendType === 'multiplicative') trend = values[1] / values[0];
      start = 1;
    }

    let sse = 0;
    for (let t = start; t < n; t++) {
      const value = values[t];
      const seasonValue = seasonal ? season[t % m] : 0;
      const base = project(level, trend, trendType, 1);
      const error = value - applySeason(base, seasonValue, seasonType);
      sse += error * error;

      const deseasonalized = seasonType === 'additive' ? value - seasonValue
        : seasonType === 'multiplicative' ? value / seasonValue
          : value;
      const previousLevel = level;
      level = alpha * deseasonalized + (1 - alpha) * base;
      if (trendType === 'additive') trend = beta * (level - previousLevel) + (1 - beta) * trend;
      if (trendType === 'multiplicative') trend = beta * (level / previousLevel) + (1 - beta) * trend;
      if (seasonType === 'additive') season[t % m] = gamma * (value - level) + (1 - gamma) * seasonValue;
      if (seasonType === 'multiplicative') season[t % m] = gamma * (value / level) + (1 - gamma) * seasonValue;
    }

    if (![level, trend, sse, ...season].every(Number.isFinite)) return null;
    return { level, trend, season, sse, count: n - start, alpha, beta, gamma };
  }

  function bestFit (values, model) {
    let best = null;
    const betas = model.trend === 'none' ? [0] : GRID;
    const gammas = model.season === 'none' ? [0] : GRID;
    for (const alpha of GRID) {
      for (const beta of betas) {
        for (const gamma of gammas) {
          const result = fit(values, model, alpha, beta, gamma);
          if (result && (!best || result.sse < best.sse)) best = result;
        }
      }
    }
    if (!best || best.count < 1) return null;

    // Smoothing parameters plus initial states
    const parameters = 2 + (model.trend === 'none' ? 0 : 2) + (model.season === 'none' ? 0 : model.seasonLength);
    const denominator = best.count - parameters - 1;
    const aic = best.count * Math.log(Math.max(best.sse, 1e-12) / best.count) + 2 * parameters;
    best.aicc = denominator > 0 ? aic + 2 * parameters * (parameters + 1) / denominator : Infinity;
    return best;
  }

  function getCandidates (values, options) {
    const positive = values.every(value => value > 0);
    const canTrend = values.length >= 3;
    const canSeason = options.seasonLength > 1 && values.length >= 2 * options.seasonLength;
    const allowed = (type, possible) => type === 'none' || (possible && (type === 'additive' || positive));

    if (options.model === 'custom') {
      if (!allowed(options.trend, canTrend) || !allowed(options.season, canSeason)) return [];
      return [{ trend: options.trend, season: options.season }];
    }

    const trends = ['none', 'additive', 'multiplicative'].filter(type => allowed(type, canTrend));
    const seasons = options.model === 'auto' ? ['none', 'additive', 'multiplicative'].filter(type => allowed(type, canSeason)) : ['none'];
    return trends.flatMap(trend => seasons.map(season => ({ trend, season })));
  }

  // values: actual values in time order. options: { model, trend, season, seasonLength, horizon, interval }
  function forecast (values, options) {
    if (values.length < 3) return { error: 'Needs at least 3 values' };
    const candidates = getCandidates(values, options);
    if (candidates.length === 0) {
      return { error: 'Not enough data for this model, or multiplicative with zero or negative values' };
    }

    let best = null;
    for (const candidate of candidates) {
      const model = { ...candidate, seasonLength: options.seasonLength };
      const result = bestFit(values, model);
      if (!result) continue;
      const score = options.model === 'custom' ? 0 : result.aicc;
      if (!best || score < best.score || (score === best.score && result.sse < best.result.sse)) {
        best = { model, result, score };
      }
    }
    if (!best) return { error: 'The model could not be fitted to this data' };

    const { model, result } = best;
    const sigma = Math.sqrt(result.sse / result.count);
    const z = Z_SCORES[options.interval] || Z_SCORES[95];
    const n = values.length;
    let variance = 0;
    const points = [];
    for (let step = 1; step <= options.horizon; step++) {
      const base = project(result.level, result.trend, model.trend, step);
      const seasonValue = model.season === 'none' ? 0 : result.season[(n + step - 1) % model.seasonLength];
      const value = applySeason(base, seasonValue, model.season);
      if (step > 1) {
        const j = step - 1;
        const c = result.alpha * (1 + (model.trend === 'none' ? 0 : result.beta * j)) +
          (model.season !== 'none' && j % model.seasonLength === 0 ? result.gamma : 0);
        variance += c * c;
      }
      const margin = z * sigma * Math.sqrt(1 + variance);
      points.push({ value, low: value - margin, high: value + margin });
    }

    return {
      points,
      description: `${TYPE_LABELS[model.trend]} trend, ${TYPE_LABELS[model.season].toLowerCase()} season`
    };
  }

  return { forecast };
})();
