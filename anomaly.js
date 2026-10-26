'use strict';

(function () {
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
  const DEFAULT_STATE = {
    // 'auto' | 'smoothing' | 'rolling' | 'iqr' | 'zscore'
    method: 'auto',
    // 'low' | 'medium' | 'high' | 'custom' (uses threshold)
    sensitivity: 'medium',
    threshold: 3,
    // 'both' | 'high' | 'low'
    direction: 'both',
    // Rolling median window, in points
    window: 7,
    // Ignore anomalies whose deviation is under this % of the expected value
    minChange: 0,
    // 'auto' | 'on' | 'off'
    seasonality: 'auto',
    // How rows for the same category combine: 'sum' | 'average' | 'min' | 'max'
    aggregation: 'sum',
    showSegments: true,
    // null = every measure
    measures: null,
    display: { band: true, expected: true, stats: true, explanation: true, season: true, list: true, tooltips: true }
  };
  const SETTINGS_KEY = 'anomalyState';
  const MAX_LIST_ROWS = 100;
  const MAX_SEGMENTS = 100;
  const AGGREGATIONS = {
    sum: values => values.reduce((total, value) => total + value, 0),
    average: values => values.reduce((total, value) => total + value, 0) / values.length,
    min: values => Math.min(...values),
    max: values => Math.max(...values)
  };
  const METHOD_EXPLANATIONS = {
    smoothing: 'Each point is compared with a trend forecast (exponential smoothing) built from the points before it',
    rolling: 'Each point is compared with the median of its neighbouring points',
    iqr: 'Each point is compared with the middle half of all values (interquartile range)',
    zscore: 'Each point is compared with the average of all values'
  };
  const SPREAD_NAMES = {
    smoothing: 'robust standard deviations of the forecast errors',
    rolling: 'robust standard deviations of the neighbours',
    iqr: 'interquartile ranges beyond the quartiles',
    zscore: 'standard deviations'
  };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  const compactFormat = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  const percentFormat = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
  const inTableau = Boolean(window.tableau?.extensions) && window.parent !== window;

  const panelsElement = document.getElementById('panels');
  const messageElement = document.getElementById('message');
  const summaryElement = document.getElementById('summary');
  const breadcrumbElement = document.getElementById('breadcrumb');
  const tooltipElement = document.getElementById('tooltip');
  const settingsOverlay = document.getElementById('settings-overlay');
  const settingsFormElement = document.getElementById('settings-form');
  const previewSettingsButton = document.getElementById('preview-settings');

  let allRows = [];
  // Categories shared by every series, in order: { key, label, date }
  let categories = [];
  let categoryIndex = new Map();
  // Season length and each category's position in the season, for date categories: { length, unit, positions, labels }
  let seasonInfo = null;
  let categoryField;
  let measureFields = [];
  // Fields on the Breakdown encoding, in drill order, and the members drilled into so far
  let breakdownFields = [];
  let drillPath = [];
  // Analysis for the current drill level, recalculated when the data, settings, or drill level change
  let view = null;
  let state = mergeState({});

  function mergeState (saved) {
    return {
      ...DEFAULT_STATE,
      ...saved,
      display: { ...DEFAULT_STATE.display, ...saved.display }
    };
  }

  function loadState () {
    try {
      const saved = tableau.extensions.settings.get(SETTINGS_KEY);
      if (saved) state = mergeState(JSON.parse(saved));
    } catch (error) {
      console.warn('Unable to load saved settings', error);
    }
  }

  // Saved settings travel with the workbook.
  async function saveState () {
    if (!inTableau) return;
    try {
      tableau.extensions.settings.set(SETTINGS_KEY, JSON.stringify(state));
      await tableau.extensions.settings.saveAsync();
    } catch (error) {
      console.warn('Unable to save settings', error);
    }
  }

  function showMessage (message) {
    hideTooltip();
    view = null;
    panelsElement.replaceChildren(messageElement);
    summaryElement.textContent = '';
    breadcrumbElement.replaceChildren();
    messageElement.textContent = message;
    messageElement.hidden = false;
  }

  function createSvgElement (name, attributes) {
    const element = document.createElementNS(SVG_NAMESPACE, name);
    for (const [key, value] of Object.entries(attributes || {})) {
      element.setAttribute(key, String(value));
    }
    return element;
  }

  function createElement (tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function getValue (dataValue) {
    if (dataValue == null) return null;
    if (typeof dataValue === 'object' && 'value' in dataValue) {
      return dataValue.value;
    }
    return dataValue;
  }

  function getLabel (dataValue) {
    if (dataValue == null) return '';
    if (typeof dataValue === 'object') {
      return dataValue.formattedValue ?? String(dataValue.value ?? '');
    }
    return String(dataValue);
  }

  function getCategoryDate (dataValue) {
    const value = getValue(dataValue);
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
    }
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
      if (!Number.isNaN(date.getTime())) return date;
    }
    // Discrete month-year values such as "May 2026"
    const match = /^([A-Za-z]+)\s+(\d{4})$/.exec(getLabel(dataValue).trim());
    if (match) {
      const date = new Date(`${match[1]} 1, ${match[2]} UTC`);
      if (!Number.isNaN(date.getTime())) return date;
    }
    return null;
  }

  function getNumber (dataValue) {
    const value = getValue(dataValue);
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  // Data

  function buildCategories (rows) {
    const byKey = new Map();
    for (const row of rows) {
      const key = getLabel(row[categoryField.name]);
      if (!byKey.has(key)) byKey.set(key, { key, label: key, date: getCategoryDate(row[categoryField.name]) });
    }
    const result = [...byKey.values()];
    if (result.length > 0 && result.every(category => category.date)) {
      result.sort((a, b) => a.date - b.date);
      const monthly = result.every(category => category.date.getUTCDate() === 1);
      for (const category of result) {
        category.label = category.date.toLocaleDateString('en-US', {
          month: monthly ? 'long' : 'short', day: monthly ? undefined : 'numeric', year: 'numeric', timeZone: 'UTC'
        });
      }
    } else {
      for (const category of result) category.date = null;
    }
    return result;
  }

  // The season follows the date level, from the typical gap between dates
  function getSeasonInfo () {
    if (!isTimeSeries() || categories.length < 3) return null;
    const gaps = categories.slice(1).map((category, index) => (category.date - categories[index].date) / 864e5).sort((a, b) => a - b);
    const gap = gaps[Math.floor(gaps.length / 2)];
    const dates = categories.map(category => category.date);
    if (gap >= 28 && gap <= 31) {
      return { length: 12, unit: 'month', positions: dates.map(date => date.getUTCMonth()), labels: MONTHS };
    }
    if (gap >= 89 && gap <= 92) {
      return { length: 4, unit: 'quarter', positions: dates.map(date => Math.floor(date.getUTCMonth() / 3)), labels: ['Q1', 'Q2', 'Q3', 'Q4'] };
    }
    if (gap === 7) {
      const week = date => Math.min(51, Math.floor((date - Date.UTC(date.getUTCFullYear(), 0, 1)) / (7 * 864e5)));
      return { length: 52, unit: 'week', positions: dates.map(week), labels: Array.from({ length: 52 }, (_, index) => `W${index + 1}`) };
    }
    if (gap === 1) {
      return { length: 7, unit: 'day', positions: dates.map(date => date.getUTCDay()), labels: WEEKDAYS };
    }
    return null;
  }

  function setData (rows) {
    allRows = rows;
    categories = categoryField ? buildCategories(rows) : [];
    categoryIndex = new Map(categories.map((category, index) => [category.key, index]));
    seasonInfo = getSeasonInfo();
    // Keep the drill path only while its members still exist
    drillPath = drillPath.slice(0, breakdownFields.length);
    while (drillPath.length > 0 && getRowsAtPath().length === 0) drillPath.pop();
  }

  function isTimeSeries () {
    return categories.length > 0 && categories.every(category => category.date);
  }

  function getMember (row, level) {
    return getLabel(row[breakdownFields[level].name]);
  }

  function getRowsAtPath (path = drillPath) {
    return allRows.filter(row => path.every((member, level) => getMember(row, level) === member));
  }

  // One cell per category: { value, label }. Rows for the same category are combined with the chosen aggregation.
  function getSeries (rows, field) {
    const groups = categories.map(() => []);
    for (const row of rows) {
      const value = getNumber(row[field.name]);
      if (value !== null) groups[categoryIndex.get(getLabel(row[categoryField.name]))].push({ value, row });
    }
    const combine = AGGREGATIONS[state.aggregation] || AGGREGATIONS.sum;
    return groups.map(group => group.length === 0
      ? { value: null, label: '' }
      : {
          value: combine(group.map(item => item.value)),
          // Tableau's own formatting is only right when no rows were combined
          label: group.length === 1 ? getLabel(group[0].row[field.name]) : ''
        });
  }

  function getSelectedMeasures () {
    if (!state.measures) return measureFields;
    const selected = measureFields.filter(field => state.measures.includes(field.name));
    return selected.length > 0 ? selected : measureFields;
  }

  function analyse (rows) {
    const options = {
      method: state.method,
      sensitivity: state.sensitivity,
      threshold: state.threshold,
      direction: state.direction,
      window: state.window,
      minChange: state.minChange,
      isTimeSeries: isTimeSeries(),
      seasonality: state.seasonality,
      seasonLength: seasonInfo?.length,
      positions: seasonInfo?.positions
    };
    return getSelectedMeasures().map(field => {
      const cells = getSeries(rows, field);
      const values = cells.map(cell => cell.value);
      const detection = AnomalyDetect.detect(values, options);
      return {
        field,
        cells,
        detection,
        stats: AnomalyDetect.summarize(values),
        found: detection.points.filter(result => result?.anomaly).length
      };
    });
  }

  // For each anomaly in the current total, the Breakdown member whose own deviation from expected
  // pushed hardest in the same direction.
  function findContributors (analyses, segments) {
    analyses.forEach((analysis, measureIndex) => {
      analysis.contributors = analysis.detection.points.map((result, index) => {
        if (!result?.anomaly || !segments) return null;
        let best = null;
        for (const segment of segments.items) {
          const deviation = segment.analyses[measureIndex].detection.points[index]?.deviation;
          if (!Number.isFinite(deviation) || Math.sign(deviation) !== Math.sign(result.deviation)) continue;
          if (!best || Math.abs(deviation) > Math.abs(best.deviation)) best = { member: segment.member, deviation };
        }
        if (best && state.aggregation === 'sum' && result.deviation !== 0) best.share = best.deviation / result.deviation;
        return best;
      });
    });
  }

  function computeView () {
    const rows = getRowsAtPath();
    const level = drillPath.length;
    const analyses = analyse(rows);

    let segments = null;
    if (level < breakdownFields.length) {
      const members = [...new Set(rows.map(row => getMember(row, level)))]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      segments = {
        field: breakdownFields[level],
        count: members.length,
        items: members.slice(0, MAX_SEGMENTS).map(member => {
          const memberAnalyses = analyse(rows.filter(row => getMember(row, level) === member));
          return {
            member,
            path: [...drillPath, member],
            analyses: memberAnalyses,
            total: memberAnalyses.reduce((sum, analysis) => sum + analysis.found, 0)
          };
        })
      };
    }
    findContributors(analyses, segments);

    const anomalies = [];
    const collect = (items, segment, path) => items.forEach(analysis => {
      analysis.detection.points.forEach((result, index) => {
        if (result?.anomaly) anomalies.push({ analysis, index, result, segment, path });
      });
    });
    collect(analyses, drillPath.join(' › ') || 'All', null);
    for (const item of segments?.items || []) collect(item.analyses, item.path.join(' › '), item.path);
    anomalies.sort((a, b) => Math.abs(b.result.score) - Math.abs(a.result.score));

    return { analyses, segments, anomalies };
  }

  function update () {
    if (!categoryField || measureFields.length === 0) {
      showMessage('Add a field to Category and one or more measures to Measures.');
      return;
    }
    if (categories.length === 0) {
      showMessage('No data to analyse.');
      return;
    }
    view = computeView();
    render();
  }

  function drillTo (path) {
    drillPath = path;
    update();
  }

  // Text

  function formatValue (value, label) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return label || numberFormat.format(value);
  }

  function formatSigned (value) {
    return `${value >= 0 ? '+' : '−'}${numberFormat.format(Math.abs(value))}`;
  }

  function relativeTo (deviation, expected) {
    return expected ? ` (${percentFormat.format(deviation / Math.abs(expected))})` : '';
  }

  function seasonStrengthWord (strength) {
    if (strength >= 0.6) return 'Strong';
    if (strength >= AnomalyDetect.SEASON_STRENGTH) return 'Moderate';
    if (strength >= 0.2) return 'Weak';
    return 'No clear';
  }

  function explainAnomaly (analysis, index) {
    const result = analysis.detection.points[index];
    const cell = analysis.cells[index];
    const direction = result.anomaly === 'high' ? 'above' : 'below';
    const parts = [
      `${formatValue(result.value, cell.label)} is ${numberFormat.format(Math.abs(result.deviation))}` +
        `${relativeTo(Math.abs(result.deviation), result.expected)} ${direction} the expected ${formatValue(result.expected)}, ` +
        `outside the normal range ${formatValue(result.low)} to ${formatValue(result.high)} ` +
        `(score ${formatSigned(result.score)}, threshold ${analysis.detection.k}).`
    ];
    if (analysis.detection.season?.applied && result.seasonal !== 0 && seasonInfo) {
      const position = seasonInfo.labels[seasonInfo.positions[index]];
      parts.push(`The expected value already includes the usual ${position} effect of ${formatSigned(result.seasonal)}.`);
    }
    const contributor = analysis.contributors?.[index];
    if (contributor) {
      const share = contributor.share ? `, ${percentFormat.format(contributor.share).replace('+', '')} of the deviation` : '';
      parts.push(`Biggest contributor: ${contributor.member} (${formatSigned(contributor.deviation)}${share}).`);
    }
    return parts.join(' ');
  }

  function explainSeries (analysis) {
    const { field, cells, detection, stats } = analysis;
    const sentences = [];
    const present = cells.map((cell, index) => ({ cell, index })).filter(item => Number.isFinite(item.cell.value));
    const labelAt = index => categories[index].label;

    // Trend
    if (isTimeSeries() && present.length >= 3) {
      const first = present[0];
      const last = present[present.length - 1];
      const verb = stats.slope > 0 ? 'rose' : stats.slope < 0 ? 'fell' : 'stayed flat';
      const change = stats.change !== null && stats.slope !== 0 ? ` ${percentFormat.format(Math.abs(stats.change)).replace('+', '')}` : '';
      sentences.push(`${field.name} ${verb}${change} from ${labelAt(first.index)} to ${labelAt(last.index)}, ` +
        `a trend of ${formatSigned(stats.slope)} per ${seasonInfo?.unit || 'period'}.`);
    } else {
      sentences.push(`Across ${stats.count} ${categoryField.name} values, ${field.name} averages ${formatValue(stats.mean)}.`);
    }
    const minIndex = present.reduce((best, item) => item.cell.value < best.cell.value ? item : best).index;
    const maxIndex = present.reduce((best, item) => item.cell.value > best.cell.value ? item : best).index;
    sentences.push(`It ranges from ${formatValue(stats.min)} (${labelAt(minIndex)}) to ${formatValue(stats.max)} (${labelAt(maxIndex)}); ` +
      `the middle half of values is between ${formatValue(stats.q1)} and ${formatValue(stats.q3)}` +
      (stats.mean ? `, and values typically vary by ${percentFormat.format(stats.std / Math.abs(stats.mean)).replace('+', '')} of the mean.` : '.'));

    // Seasonality
    const season = detection.season;
    if (season && seasonInfo) {
      const strength = `${seasonStrengthWord(season.strength)} ${seasonInfo.length}-${seasonInfo.unit} seasonality ` +
        `(strength ${season.strength.toFixed(2)})`;
      const peak = season.indices.indexOf(Math.max(...season.indices));
      const trough = season.indices.indexOf(Math.min(...season.indices));
      const effect = position => `${formatSigned(season.indices[position])}${relativeTo(season.indices[position], stats.mean)}`;
      if (season.applied) {
        sentences.push(`${strength}: usually highest in ${seasonInfo.labels[peak]} (${effect(peak)} vs. trend) and lowest in ` +
          `${seasonInfo.labels[trough]} (${effect(trough)}). Expected values include this pattern, so regular seasonal highs and lows are not flagged.`);
      } else {
        sentences.push(`${strength}, so it was not used for the expected values.`);
      }
    } else if (seasonInfo && state.seasonality !== 'off') {
      sentences.push(`Not enough data to measure ${seasonInfo.length}-${seasonInfo.unit} seasonality: it needs at least two full cycles.`);
    }

    // Anomalies
    if (detection.error) {
      sentences.push(`${detection.error}, so anomalies were not scored.`);
    } else if (analysis.found === 0) {
      sentences.push('No values fall outside the normal range.');
    } else {
      const top = detection.points
        .map((result, index) => ({ result, index }))
        .filter(item => item.result?.anomaly)
        .sort((a, b) => Math.abs(b.result.score) - Math.abs(a.result.score))
        .slice(0, 3)
        .map(({ result, index }) => {
          const contributor = analysis.contributors?.[index];
          return `a ${result.anomaly === 'high' ? 'spike' : 'dip'} in ${labelAt(index)} ` +
            `(${formatValue(result.value)}, ${formatSigned(result.deviation)}${relativeTo(result.deviation, result.expected)} vs. expected` +
            `${contributor ? `, mostly ${contributor.member}` : ''})`;
        });
      const more = analysis.found > top.length ? `, and ${analysis.found - top.length} more` : '';
      sentences.push(`${analysis.found} ${analysis.found === 1 ? 'anomaly' : 'anomalies'}: ${top.join('; ')}${more}.`);
    }

    // Method
    sentences.push(`How: ${METHOD_EXPLANATIONS[detection.method]}${season?.applied ? ' after removing seasonality' : ''}; ` +
      `values more than ${detection.k} ${SPREAD_NAMES[detection.method]} away are flagged.`);
    return sentences;
  }

  // Tooltip

  function hideTooltip () {
    tooltipElement.hidden = true;
  }

  function showTooltip (event, title, rows, note) {
    const children = [createElement('div', 'tooltip-title', title), ...rows.map(([name, value]) => {
      const row = createElement('div', 'tooltip-row');
      row.append(createElement('span', 'tooltip-name', name), createElement('span', 'tooltip-value', value));
      return row;
    })];
    if (note) children.push(createElement('div', 'tooltip-note', note));
    tooltipElement.replaceChildren(...children);
    tooltipElement.hidden = false;

    let left = event.clientX + 14;
    let top = event.clientY + 14;
    if (left + tooltipElement.offsetWidth > window.innerWidth) left = event.clientX - tooltipElement.offsetWidth - 14;
    if (top + tooltipElement.offsetHeight > window.innerHeight) top = window.innerHeight - tooltipElement.offsetHeight - 4;
    tooltipElement.style.left = `${Math.max(0, left)}px`;
    tooltipElement.style.top = `${Math.max(0, top)}px`;
  }

  function describeAnomaly (result) {
    if (result.anomaly === 'high') return 'Spike (above range)';
    if (result.anomaly === 'low') return 'Dip (below range)';
    return 'Normal';
  }

  // Scale and ticks

  function niceStep (rawStep) {
    if (!(rawStep > 0)) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const fraction = rawStep / magnitude;
    return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude;
  }

  function getScale (values, tickCount) {
    let low = Math.min(...values);
    let high = Math.max(...values);
    if (high <= low) {
      const pad = Math.abs(low) * 0.1 || 1;
      low -= pad;
      high += pad;
    }
    const step = niceStep((high - low) / tickCount);
    const min = Math.floor(low / step) * step;
    const max = Math.ceil(high / step) * step;
    const ticks = [];
    for (let tick = min; tick <= max + step * 1e-9; tick += step) ticks.push(Number(tick.toPrecision(12)));
    return { min, max, ticks };
  }

  // Splits an array of { x, y } (or null) into unbroken runs
  function segmentRuns (items) {
    const runs = [];
    let current = [];
    for (const item of items) {
      if (item) current.push(item);
      else if (current.length > 0) {
        runs.push(current);
        current = [];
      }
    }
    if (current.length > 0) runs.push(current);
    return runs;
  }

  function linePath (run) {
    return run.map((item, index) => `${index === 0 ? 'M' : 'L'}${item.x.toFixed(1)},${item.y.toFixed(1)}`).join('');
  }

  // Rendering

  function renderChart (container, analysis) {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width < 50 || height < 50) return;

    const { field, cells, detection } = analysis;
    const display = state.display;
    const results = detection.points;
    const scaleValues = [];
    results.forEach((result, index) => {
      if (Number.isFinite(cells[index].value)) scaleValues.push(cells[index].value);
      if (result && display.band) scaleValues.push(result.low, result.high);
      if (result && display.expected) scaleValues.push(result.expected);
    });
    if (scaleValues.length === 0) return;

    const scale = getScale(scaleValues, Math.max(2, Math.floor(height / 45)));
    const tickLabels = scale.ticks.map(tick => compactFormat.format(tick));
    const margin = {
      top: 6,
      right: 8,
      bottom: 22,
      left: Math.max(...tickLabels.map(label => label.length)) * 6.5 + 10
    };
    const plotWidth = Math.max(10, width - margin.left - margin.right);
    const plotHeight = Math.max(10, height - margin.top - margin.bottom);
    const step = plotWidth / categories.length;
    const xAt = index => margin.left + (index + 0.5) * step;
    const yAt = value => margin.top + plotHeight - (value - scale.min) / (scale.max - scale.min) * plotHeight;

    const svg = createSvgElement('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `${field.name} with anomalies` });

    scale.ticks.forEach((tick, index) => {
      const y = yAt(tick);
      svg.appendChild(createSvgElement('line', { class: 'grid-line', x1: margin.left, x2: margin.left + plotWidth, y1: y, y2: y }));
      const label = createSvgElement('text', { class: 'tick-label', x: margin.left - 6, y: y + 4, 'text-anchor': 'end' });
      label.textContent = tickLabels[index];
      svg.appendChild(label);
    });
    svg.appendChild(createSvgElement('line', {
      class: 'axis-line', x1: margin.left, x2: margin.left + plotWidth, y1: margin.top + plotHeight, y2: margin.top + plotHeight
    }));

    // Category labels, thinned out so they don't overlap
    const longest = Math.max(...categories.map(category => category.label.length));
    const every = Math.max(1, Math.ceil((Math.min(longest, 18) * 6.5 + 12) / step));
    categories.forEach((category, index) => {
      if (index % every !== 0) return;
      const label = createSvgElement('text', { class: 'tick-label', x: xAt(index), y: height - 6, 'text-anchor': 'middle' });
      label.textContent = category.label.length > 18 ? `${category.label.slice(0, 17)}…` : category.label;
      svg.appendChild(label);
    });

    if (display.band) {
      for (const run of segmentRuns(results.map((result, index) => result && { index, result }))) {
        // A lone point gets a band one step wide so it still shows
        const xs = run.length === 1
          ? [xAt(run[0].index) - step / 2, xAt(run[0].index) + step / 2]
          : run.map(({ index }) => xAt(index));
        const items = run.length === 1 ? [run[0], run[0]] : run;
        const top = items.map(({ result }, i) => [xs[i], yAt(result.high)]);
        const bottom = items.map(({ result }, i) => [xs[i], yAt(result.low)]).reverse();
        const pointsText = [...top, ...bottom].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
        svg.appendChild(createSvgElement('polygon', { class: 'band', points: pointsText }));
      }
    }

    if (display.expected) {
      for (const run of segmentRuns(results.map((result, index) => result && { x: xAt(index), y: yAt(result.expected) }))) {
        if (run.length > 1) svg.appendChild(createSvgElement('path', { class: 'expected-line', d: linePath(run) }));
      }
    }

    const valuePoints = cells.map((cell, index) => Number.isFinite(cell.value) ? { x: xAt(index), y: yAt(cell.value) } : null);
    for (const run of segmentRuns(valuePoints)) {
      if (run.length > 1) svg.appendChild(createSvgElement('path', { class: 'value-line', d: linePath(run) }));
    }
    if (step >= 6) {
      valuePoints.forEach(item => {
        if (item) svg.appendChild(createSvgElement('circle', { class: 'value-dot', cx: item.x, cy: item.y, r: 2 }));
      });
    }
    results.forEach((result, index) => {
      if (!result?.anomaly) return;
      svg.appendChild(createSvgElement('circle', {
        class: `anomaly-${result.anomaly}`, cx: xAt(index), cy: yAt(result.value), r: 5
      }));
    });

    if (display.tooltips) {
      const seasonApplied = detection.season?.applied && seasonInfo;
      categories.forEach((category, index) => {
        const target = createSvgElement('rect', {
          class: 'hover-target', x: margin.left + index * step, y: margin.top, width: step, height: plotHeight
        });
        const cell = cells[index];
        const result = results[index];
        const rows = [[field.name, formatValue(cell.value, cell.label)]];
        if (result) {
          rows.push(
            ['Expected', formatValue(result.expected)],
            ['Normal range', `${formatValue(result.low)} – ${formatValue(result.high)}`]
          );
          if (seasonApplied) rows.push([`Seasonal effect (${seasonInfo.labels[seasonInfo.positions[index]]})`, formatSigned(result.seasonal)]);
          rows.push(
            ['Deviation', formatSigned(result.deviation)],
            ['Score', formatSigned(Number(result.score.toFixed(2)))],
            ['Status', describeAnomaly(result)]
          );
        } else if (Number.isFinite(cell.value)) {
          rows.push(['Status', 'Not scored (not enough history)']);
        }
        const note = result?.anomaly ? explainAnomaly(analysis, index) : '';
        target.addEventListener('mousemove', event => showTooltip(event, category.label || '(no category)', rows, note));
        target.addEventListener('mouseleave', hideTooltip);
        svg.appendChild(target);
      });
    }

    container.replaceChildren(svg);
  }

  // Bars of the seasonal index for each season position: how far above or below the trend it usually is
  function renderSeasonProfile (container, analysis) {
    const season = analysis.detection.season;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!season || width < 50) return;

    const margin = { top: 4, bottom: 14 };
    const extent = Math.max(...season.indices.map(Math.abs)) || 1;
    const step = width / season.length;
    const middle = margin.top + (height - margin.top - margin.bottom) / 2;
    const half = (height - margin.top - margin.bottom) / 2;
    const svg = createSvgElement('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `${analysis.field.name} seasonal pattern` });
    svg.appendChild(createSvgElement('line', { class: 'axis-line', x1: 0, x2: width, y1: middle, y2: middle }));
    const every = Math.max(1, Math.ceil(28 / step));
    season.indices.forEach((value, position) => {
      const barHeight = Math.abs(value) / extent * half;
      const bar = createSvgElement('rect', {
        class: value >= 0 ? 'season-up' : 'season-down',
        x: position * step + step * 0.15,
        y: value >= 0 ? middle - barHeight : middle,
        width: step * 0.7,
        height: Math.max(0.5, barHeight)
      });
      const title = createSvgElement('title');
      title.textContent = `${seasonInfo.labels[position]}: ${formatSigned(value)}${relativeTo(value, analysis.stats.mean)} vs. trend`;
      bar.appendChild(title);
      svg.appendChild(bar);
      if (position % every === 0) {
        const label = createSvgElement('text', { class: 'tick-label', x: (position + 0.5) * step, y: height - 2, 'text-anchor': 'middle' });
        label.textContent = seasonInfo.labels[position];
        svg.appendChild(label);
      }
    });
    container.replaceChildren(svg);
  }

  function renderStats (analysis) {
    const { stats, found, detection } = analysis;
    const element = createElement('div', 'stats');
    const items = [
      ['Points', numberFormat.format(stats.count)],
      ['Mean', formatValue(stats.mean)],
      ['Median', formatValue(stats.median)],
      ['Std dev', formatValue(stats.std)],
      ['Min', formatValue(stats.min)],
      ['Max', formatValue(stats.max)]
    ];
    if (state.aggregation === 'sum') items.push(['Total', formatValue(stats.sum)]);
    if (isTimeSeries() && stats.change !== null) items.push(['First → last', percentFormat.format(stats.change)]);
    if (detection.season && seasonInfo) {
      items.push(['Seasonality', `${seasonStrengthWord(detection.season.strength).replace('No clear', 'None')} (${detection.season.strength.toFixed(2)})`]);
    }
    if (stats.missing > 0) items.push(['Missing', numberFormat.format(stats.missing)]);
    items.push(['Anomaly rate', percentFormat.format(stats.count ? found / stats.count : 0).replace('+', '')]);
    for (const [name, value] of items) {
      const item = createElement('span');
      item.append(createElement('span', 'stat-name', `${name} `), createElement('span', 'stat-value', value));
      element.appendChild(item);
    }
    return element;
  }

  function renderPanel (analysis) {
    const { field, detection, found } = analysis;
    const scope = drillPath.length > 0 ? ` · ${drillPath.join(' › ')}` : '';
    const panel = createElement('section', 'panel');
    const head = createElement('div', 'panel-head');
    head.append(
      createElement('span', 'panel-title', `${field.name}${scope}`),
      createElement('span', `badge${found > 0 ? ' alert' : ''}`, `${found} ${found === 1 ? 'anomaly' : 'anomalies'}`),
      createElement('span', 'panel-method', `${detection.label}, k = ${detection.k}${detection.season?.applied ? ', seasonally adjusted' : ''}`)
    );
    panel.appendChild(head);
    if (state.display.stats && analysis.stats) panel.appendChild(renderStats(analysis));
    if (state.display.explanation && analysis.stats) {
      const list = createElement('ul', 'explanation');
      for (const sentence of explainSeries(analysis)) list.appendChild(createElement('li', '', sentence));
      panel.appendChild(list);
    }
    const chart = createElement('div', 'panel-chart');
    panel.appendChild(chart);
    let profile = null;
    if (state.display.season && detection.season && seasonInfo) {
      panel.appendChild(createElement('div', 'profile-title', `Seasonal pattern: typical ${seasonInfo.unit} effect vs. trend`));
      profile = createElement('div', 'season-profile');
      panel.appendChild(profile);
    }
    return { panel, draw: () => {
      renderChart(chart, analysis);
      if (profile) renderSeasonProfile(profile, analysis);
    } };
  }

  function makeDrillable (row, path) {
    row.classList.add('drillable');
    row.tabIndex = 0;
    row.title = `Drill into ${path.join(' › ')}`;
    row.addEventListener('click', () => drillTo(path));
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        drillTo(path);
      }
    });
  }

  function renderSegments (segments) {
    const section = createElement('section', 'table-section');
    const truncated = segments.count > segments.items.length ? ` (first ${segments.items.length} of ${segments.count})` : '';
    section.appendChild(createElement('h2', '', `Breakdown by ${segments.field.name}${truncated}`));
    section.appendChild(createElement('p', 'table-hint', 'Anomalies found in each member\'s own series, most first. Click a row to drill down.'));

    const measures = getSelectedMeasures();
    const table = createElement('table');
    const head = createElement('tr');
    head.appendChild(createElement('th', '', segments.field.name));
    for (const field of measures) head.appendChild(createElement('th', 'number', field.name));
    head.appendChild(createElement('th', 'number', 'Total'));
    table.appendChild(head);

    const items = [...segments.items].sort((a, b) => b.total - a.total || a.member.localeCompare(b.member, undefined, { numeric: true }));
    for (const item of items) {
      const row = createElement('tr');
      row.appendChild(createElement('td', '', `${item.member} ›`));
      for (const analysis of item.analyses) {
        const cell = createElement('td', 'number');
        cell.appendChild(createElement('span', `badge${analysis.found > 0 ? ' alert' : ''}`, String(analysis.found)));
        row.appendChild(cell);
      }
      row.appendChild(createElement('td', 'number strong', String(item.total)));
      makeDrillable(row, item.path);
      table.appendChild(row);
    }
    section.appendChild(table);
    return section;
  }

  function renderList (anomalies) {
    const section = createElement('section', 'table-section');
    section.appendChild(createElement('h2', '', anomalies.length > MAX_LIST_ROWS
      ? `Anomalies (top ${MAX_LIST_ROWS} of ${anomalies.length}, largest first)`
      : `Anomalies (${anomalies.length}, largest first)`));

    if (anomalies.length === 0) {
      section.appendChild(createElement('p', 'table-hint', 'No anomalies at this sensitivity.'));
      return section;
    }

    const showSegment = breakdownFields.length > 0;
    const table = createElement('table');
    const head = createElement('tr');
    const columns = [[categoryField?.name || 'Category']];
    if (showSegment) columns.push(['Segment']);
    columns.push(['Measure'], ['Value', true], ['Expected', true], ['Score', true], ['Type'], ['Why']);
    for (const [text, numeric] of columns) head.appendChild(createElement('th', numeric ? 'number' : '', text));
    table.appendChild(head);

    for (const item of anomalies.slice(0, MAX_LIST_ROWS)) {
      const { analysis, index, result } = item;
      const row = createElement('tr');
      row.appendChild(createElement('td', 'nowrap', categories[index].label));
      if (showSegment) row.appendChild(createElement('td', 'nowrap', item.segment));
      row.append(
        createElement('td', 'nowrap', analysis.field.name),
        createElement('td', 'number', formatValue(result.value, analysis.cells[index].label)),
        createElement('td', 'number', formatValue(result.expected)),
        createElement('td', 'number', formatSigned(Number(result.score.toFixed(2)))),
        createElement('td', `type-${result.anomaly}`, result.anomaly === 'high' ? 'Spike' : 'Dip'),
        createElement('td', 'why', explainAnomaly(analysis, index))
      );
      if (item.path) makeDrillable(row, item.path);
      table.appendChild(row);
    }
    section.appendChild(table);
    return section;
  }

  function renderBreadcrumb () {
    if (breakdownFields.length === 0) {
      breadcrumbElement.replaceChildren();
      return;
    }
    const crumbs = [createElement('span', 'crumb-label', `${breakdownFields.map(field => field.name).join(' › ')}:`)];
    const levels = ['All', ...drillPath];
    levels.forEach((name, level) => {
      if (level > 0) crumbs.push(createElement('span', 'crumb-separator', '›'));
      if (level === levels.length - 1) {
        crumbs.push(createElement('span', 'crumb-current', name));
      } else {
        const button = createElement('button', 'crumb', name);
        button.type = 'button';
        button.addEventListener('click', () => drillTo(drillPath.slice(0, level)));
        crumbs.push(button);
      }
    });
    breadcrumbElement.replaceChildren(...crumbs);
  }

  function render () {
    hideTooltip();
    if (!view) return;
    messageElement.hidden = true;

    const panels = view.analyses.map(renderPanel);
    const children = [messageElement, ...panels.map(item => item.panel)];
    if (view.segments && state.showSegments) children.push(renderSegments(view.segments));
    if (state.display.list) children.push(renderList(view.anomalies));
    panelsElement.replaceChildren(...children);
    // Charts are sized from their containers, so draw them after the panels are laid out
    for (const item of panels) item.draw();
    renderBreadcrumb();

    const methods = [...new Set(view.analyses.map(analysis => analysis.detection.label))].join(', ');
    const sensitivity = state.sensitivity === 'custom' ? 'custom threshold' : `${state.sensitivity} sensitivity`;
    const total = view.analyses.reduce((sum, analysis) => sum + analysis.found, 0);
    const segmentTotal = view.segments ? view.anomalies.length - total : 0;
    summaryElement.textContent = `${methods} · ${sensitivity} · ${total} ${total === 1 ? 'anomaly' : 'anomalies'} in ${categories.length} points` +
      (view.segments ? ` · ${segmentTotal} more within ${view.segments.field.name} members` : '');
  }

  // Settings: the Tableau "Format Extension" dialog (Marks card), or an in-page panel as a fallback.

  function getSettingsPayload () {
    return { state, defaultState: mergeState({}), measures: measureFields.map(field => field.name) };
  }

  function applySettings (newState) {
    state = mergeState(newState);
    saveState();
    update();
  }

  function openSettingsPanel () {
    AnomalySettingsForm.build(settingsFormElement, getSettingsPayload(), {
      onSave: newState => {
        settingsOverlay.hidden = true;
        applySettings(newState);
      },
      onCancel: () => { settingsOverlay.hidden = true; }
    });
    settingsOverlay.hidden = false;
  }

  async function openSettings () {
    if (!inTableau) {
      openSettingsPanel();
      return;
    }
    try {
      const url = new URL('anomaly-settings.html', window.location.href).href;
      const result = await tableau.extensions.ui.displayDialogAsync(url, JSON.stringify(getSettingsPayload()), {
        width: 560,
        height: 760
      });
      if (result) applySettings(JSON.parse(result));
    } catch (error) {
      if (error?.errorCode === tableau.ErrorCodes.DialogClosedByUser) return;
      console.warn('Settings dialog unavailable, using the in-page panel', error);
      openSettingsPanel();
    }
  }

  // Tableau data

  function convertPageToRows (page) {
    return page.data.map(values => {
      const row = {};
      page.columns.forEach(column => {
        row[column.fieldName] = values[column.index];
      });
      return row;
    });
  }

  async function getSummaryRows (worksheet) {
    const reader = await worksheet.getSummaryDataReaderAsync(undefined, { ignoreSelection: true });
    const rows = [];
    try {
      for (let pageIndex = 0; pageIndex < reader.pageCount; pageIndex++) {
        rows.push(...convertPageToRows(await reader.getPageAsync(pageIndex)));
      }
    } finally {
      await reader.releaseAsync();
    }
    return rows;
  }

  async function getEncodings (worksheet) {
    const specification = await worksheet.getVisualSpecificationAsync();
    const index = specification.activeMarksSpecificationIndex;
    if (index < 0) return {};

    const encodings = {};
    for (const encoding of specification.marksSpecifications[index].encodings) {
      if (!encodings[encoding.id]) encodings[encoding.id] = [];
      encodings[encoding.id].push(encoding.field);
    }
    return encodings;
  }

  function updateFromTableau (worksheet) {
    const refresh = async () => {
      try {
        const [rows, encodings] = await Promise.all([
          getSummaryRows(worksheet),
          getEncodings(worksheet)
        ]);
        const breakdownNames = (encodings.breakdown || []).map(field => field.name).join('\n');
        if (breakdownNames !== breakdownFields.map(field => field.name).join('\n')) drillPath = [];
        categoryField = encodings.category?.[0];
        measureFields = encodings.measures || [];
        breakdownFields = encodings.breakdown || [];
        setData(rows);
        update();
      } catch (error) {
        showMessage(`Unable to load Tableau data: ${error.message || error}`);
      }
    };

    worksheet.addEventListener(tableau.TableauEventType.SummaryDataChanged, refresh);
    refresh();
  }

  // Sample data with seasonality, a Region › Channel breakdown, and a few planted anomalies,
  // shown when the page is opened outside Tableau
  function renderPreview () {
    categoryField = { name: 'Month' };
    measureFields = [{ name: 'Sales' }, { name: 'Orders' }, { name: 'Returns' }];
    breakdownFields = [{ name: 'Region' }, { name: 'Channel' }];
    const regions = [['East', 0.45], ['West', 0.35], ['Central', 0.2]];
    const channels = [['Online', 0.6], ['Store', 0.4]];
    // [measure, region, channel, month index, multiplier]
    const planted = [
      ['Sales', 'West', 'Online', 14, 2.6],
      ['Sales', 'East', 'Store', 27, 0.25],
      ['Orders', 'Central', 'Store', 20, 4],
      ['Returns', 'East', 'Online', 9, 3.2],
      ['Returns', 'West', 'Store', 31, 3.5]
    ];
    // Repeatable pseudo-random noise between −0.5 and 0.5
    const noiseAt = seed => {
      const x = Math.sin(seed) * 43758.5453;
      return x - Math.floor(x) - 0.5;
    };
    const rows = [];
    for (let index = 0; index < 36; index++) {
      const season = Math.sin(index / 12 * 2 * Math.PI);
      const month = String(index % 12 + 1).padStart(2, '0');
      for (const [region, regionShare] of regions) {
        for (const [channel, channelShare] of channels) {
          const share = regionShare * channelShare;
          const noise = noiseAt(index * 7.13 + share * 997);
          const value = (name, base) => {
            const spike = planted.find(([measure, r, c, i]) => measure === name && r === region && c === channel && i === index);
            return { value: Math.round(base * share * (spike ? spike[4] : 1)) };
          };
          rows.push({
            Month: { value: `${2023 + Math.floor(index / 12)}-${month}-01` },
            Region: { value: region },
            Channel: { value: channel },
            Sales: value('Sales', 1200 + index * 30 + season * 300 + noise * 60),
            Orders: value('Orders', 800 + index * 12 + season * 100 + noise * 40),
            Returns: value('Returns', 120 + season * 15 + noise * 12)
          });
        }
      }
    }
    setData(rows);
    previewSettingsButton.hidden = false;
    previewSettingsButton.addEventListener('click', openSettings);
    update();
  }

  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(render);
  });

  if (inTableau) {
    tableau.extensions.initializeAsync({ configure: openSettings })
      .then(() => {
        const worksheet = tableau.extensions.worksheetContent?.worksheet;
        if (!worksheet) {
          showMessage('This page is not running inside a Tableau worksheet.');
          return;
        }
        loadState();
        updateFromTableau(worksheet);
      })
      .catch(error => showMessage(`Unable to initialize the Tableau extension: ${error.message || error}`));
  } else {
    renderPreview();
  }
})();
