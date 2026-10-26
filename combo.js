'use strict';

(function () {
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
  const COLORS = [
    '#4e79a7',
    '#f28e2c',
    '#e15759',
    '#76b7b2',
    '#59a14f',
    '#edc949',
    '#af7aa1',
    '#ff9da7',
    '#9c755f',
    '#bab0ab'
  ];
  const LINE_STYLES = {
    solid: '',
    dashed: '8 5',
    dotted: '2 4',
    'dash-dot': '8 4 2 4'
  };
  const DEFAULT_STATE = {
    series: {},
    display: { tooltips: true },
    // Mark labels, like Tableau's Label shelf. numberFormat: 'axis' (follow the value axis),
    // 'tableau' (the field's own format), or 'custom' (format, decimals, units, currencySymbol below).
    labels: {
      show: false,
      // Labels from the field on the Text encoding
      showText: true,
      marks: 'all',
      numberFormat: 'axis',
      format: 'number',
      decimals: 0,
      units: 'none',
      currencySymbol: '$',
      fontSize: 10,
      colorMode: 'auto',
      color: '#3c4043',
      bold: false,
      position: 'outside',
      applyToTooltips: true
    },
    // Field on the Color encoding splits the primary (first) bar measure
    colorGroup: { layout: 'stacked', colors: {} },
    // Mirrors Tableau's Edit Axis options; empty strings mean "Automatic"
    axis: {
      title: '',
      showTitle: true,
      rangeMin: '',
      rangeMax: '',
      includeZero: true,
      reversed: false,
      logarithmic: false,
      ticks: 'auto',
      tickInterval: '',
      gridLines: true,
      format: 'auto',
      decimals: 0,
      units: 'none',
      currencySymbol: '$',
      categoryTitle: '',
      showCategoryTitle: false,
      labelRotation: 'auto'
    },
    forecast: {
      show: false,
      // null = every measure, as in Tableau
      measures: null,
      length: 'auto',
      periods: 6,
      ignoreLast: 0,
      model: 'auto',
      trend: 'additive',
      season: 'none',
      showInterval: true,
      interval: 95
    }
  };
  const SETTINGS_KEY = 'comboChartState';
  const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  const inTableau = Boolean(window.tableau?.extensions) && window.parent !== window;

  const chartElement = document.getElementById('chart');
  const messageElement = document.getElementById('message');
  const seriesListElement = document.getElementById('series-list');
  const colorLegendElement = document.getElementById('color-legend');
  const forecastNoteElement = document.getElementById('forecast-note');
  const tooltipElement = document.getElementById('tooltip');
  const settingsOverlay = document.getElementById('settings-overlay');
  const settingsFormElement = document.getElementById('settings-form');

  let chartRows = [];
  let categoryField;
  let measureFields = [];
  let labelField;
  let colorField;
  let colorMembers = [];
  // Combined row -> { measureName: Map(member -> { value, label }) }
  const rowBreakdowns = new WeakMap();
  let tooltipContent = null;
  let state = mergeState({});

  function mergeState (saved) {
    return {
      series: { ...saved.series },
      display: { tooltips: saved.display?.tooltips ?? DEFAULT_STATE.display.tooltips },
      // Older saved settings kept "show values" under display.valueLabels
      labels: { ...DEFAULT_STATE.labels, show: Boolean(saved.display?.valueLabels), ...saved.labels },
      axis: { ...DEFAULT_STATE.axis, ...saved.axis },
      colorGroup: {
        ...DEFAULT_STATE.colorGroup,
        ...saved.colorGroup,
        colors: { ...saved.colorGroup?.colors }
      },
      forecast: { ...DEFAULT_STATE.forecast, ...saved.forecast }
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
    chartElement.querySelector('svg')?.remove();
    messageElement.textContent = message;
    messageElement.hidden = false;
  }

  function hideMessage () {
    messageElement.hidden = true;
    messageElement.textContent = '';
  }

  function createSvgElement (name, attributes) {
    const element = document.createElementNS(SVG_NAMESPACE, name);
    for (const [key, value] of Object.entries(attributes || {})) {
      element.setAttribute(key, String(value));
    }
    return element;
  }

  function addText (parent, text, attributes) {
    const element = createSvgElement('text', attributes);
    element.textContent = text;
    parent.appendChild(element);
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

  function formatMonth (date) {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  function getCategoryLabel (dataValue) {
    const date = getCategoryDate(dataValue);
    return date ? formatMonth(date) : getLabel(dataValue);
  }

  function sortRowsByDate (rows) {
    if (!categoryField) return rows;
    const dates = rows.map(row => getCategoryDate(row[categoryField.name]));
    if (dates.length === 0 || dates.some(date => date === null)) return rows;
    return rows
      .map((row, index) => ({ row, time: dates[index].getTime() }))
      .sort((a, b) => a.time - b.time)
      .map(item => item.row);
  }

  function getNumericValue (row, field) {
    const value = getValue(row[field.name]);
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  // Per measure, each Color member's value within one category
  function getGroupBreakdown (group) {
    const breakdown = {};
    for (const field of measureFields) {
      const members = new Map();
      for (const row of group) {
        const value = getNumericValue(row, field);
        if (value === null) continue;
        const member = getLabel(row[colorField.name]);
        const existing = members.get(member);
        members.set(member, existing
          ? { value: existing.value + value, label: numberFormat.format(existing.value + value) }
          : { value, label: getLabel(row[field.name]) });
      }
      breakdown[field.name] = members;
    }
    return breakdown;
  }

  function getBreakdown (row, field) {
    return rowBreakdowns.get(row)?.[field.name] || new Map();
  }

  function getMemberColor (member) {
    const index = Math.max(0, colorMembers.indexOf(member));
    return state.colorGroup.colors[member] || COLORS[(measureFields.length + index) % COLORS.length];
  }

  // Fields on Detail or Color split a category into several rows; combine them into one row per category.
  // Measures are added up and other fields list their distinct values.
  function groupRowsByCategory (rows) {
    if (!categoryField) return rows;
    const groups = new Map();
    for (const row of rows) {
      const key = getLabel(row[categoryField.name]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const measureNames = new Set(measureFields.map(field => field.name));
    return [...groups.values()].map(group => {
      const combined = combineRows(group, measureNames);
      if (colorField) rowBreakdowns.set(combined, getGroupBreakdown(group));
      return combined;
    });
  }

  function combineRows (group, measureNames) {
    if (group.length === 1) return group[0];
    const combined = { ...group[0] };
    for (const key of Object.keys(combined)) {
      if (key === categoryField.name) continue;
      if (measureNames.has(key)) {
        const numbers = group.map(row => getNumericValue(row, { name: key })).filter(value => value !== null);
        const total = numbers.reduce((sum, value) => sum + value, 0);
        combined[key] = numbers.length > 0 ? { value: total, formattedValue: numberFormat.format(total) } : null;
      } else {
        const distinct = [...new Set(group.map(row => getLabel(row[key])))];
        const text = distinct.length > 5
          ? `${distinct.slice(0, 5).join(', ')}, … (${distinct.length} values)`
          : distinct.join(', ');
        combined[key] = { value: text, formattedValue: text };
      }
    }
    return combined;
  }

  function hideTooltip () {
    tooltipElement.hidden = true;
    tooltipContent = null;
  }

  // Small sample of a mark for legends and tooltips: a square for bars, a styled line for lines.
  // mark: { mode: 'bar' | 'line', color, lineStyle, forecast }
  function createMarkSwatch (mark) {
    const swatch = createSvgElement('svg', { width: 18, height: 10, 'aria-hidden': 'true' });
    if (mark.mode === 'bar') {
      swatch.appendChild(createSvgElement('rect', {
        x: 4,
        y: 0,
        width: 10,
        height: 10,
        rx: 2,
        fill: mark.color,
        'fill-opacity': mark.forecast ? 0.4 : 1
      }));
      return swatch;
    }
    // Dash patterns are halved so they read at legend size
    const dash = mark.forecast ? '6 4' : LINE_STYLES[mark.lineStyle];
    swatch.appendChild(createSvgElement('line', {
      x1: 1,
      x2: 17,
      y1: 5,
      y2: 5,
      stroke: mark.color,
      'stroke-opacity': mark.forecast ? 0.6 : 1,
      'stroke-width': 2.5,
      'stroke-linecap': 'round',
      'stroke-dasharray': dash ? dash.split(' ').map(length => length / 2).join(' ') : 'none'
    }));
    return swatch;
  }

  function seriesMark (field) {
    const { mode, color, lineStyle } = getSeries(field);
    return { mode, color, lineStyle };
  }

  function showTooltip (event, content) {
    if (tooltipContent !== content) {
      tooltipContent = content;
      const title = document.createElement('div');
      title.className = 'tooltip-title';
      title.textContent = content.title;
      const rows = content.rows.map(item => {
        const row = document.createElement('div');
        row.className = 'tooltip-row';
        if (item.mark) {
          const swatch = createMarkSwatch(item.mark);
          swatch.classList.add('tooltip-swatch');
          row.appendChild(swatch);
        }
        const name = document.createElement('span');
        name.className = 'tooltip-name';
        name.textContent = item.name;
        const value = document.createElement('span');
        value.className = 'tooltip-value';
        value.textContent = item.value || '—';
        row.append(name, value);
        return row;
      });
      tooltipElement.replaceChildren(title, ...rows);
      tooltipElement.hidden = false;
    }

    const bounds = chartElement.getBoundingClientRect();
    let left = event.clientX - bounds.left + 14;
    let top = event.clientY - bounds.top + 14;
    if (left + tooltipElement.offsetWidth > bounds.width) {
      left = event.clientX - bounds.left - tooltipElement.offsetWidth - 14;
    }
    if (top + tooltipElement.offsetHeight > bounds.height) {
      top = bounds.height - tooltipElement.offsetHeight;
    }
    tooltipElement.style.left = `${Math.max(0, left)}px`;
    tooltipElement.style.top = `${Math.max(0, top)}px`;
  }

  function getDefaultSeries (index) {
    return { mode: index === 0 ? 'bar' : 'line', lineStyle: 'solid', color: COLORS[index % COLORS.length] };
  }

  function getSeries (field) {
    const index = Math.max(0, measureFields.findIndex(measure => measure.name === field.name));
    return { ...getDefaultSeries(index), ...state.series[field.name] };
  }

  // Settings: the Tableau "Format Extension" dialog (Marks card), or an in-chart panel as a fallback.
  function getSettingsPayload () {
    return {
      state,
      defaultState: mergeState({}),
      textFieldName: labelField?.name ?? null,
      measures: measureFields.map((field, index) => {
        const defaults = getDefaultSeries(index);
        return { name: field.name, ...getSeries(field), defaultMode: defaults.mode, defaultColor: defaults.color };
      }),
      color: colorField && colorMembers.length > 0
        ? {
            fieldName: colorField.name,
            members: colorMembers.map((member, index) => ({
              name: member,
              color: getMemberColor(member),
              defaultColor: COLORS[(measureFields.length + index) % COLORS.length]
            }))
          }
        : null
    };
  }

  function applySettings (newState) {
    state = mergeState(newState);
    saveState();
    render();
  }

  function openSettingsPanel () {
    ComboSettingsForm.build(settingsFormElement, getSettingsPayload(), {
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
      const url = new URL('settings.html', window.location.href).href;
      const result = await tableau.extensions.ui.displayDialogAsync(url, JSON.stringify(getSettingsPayload()), {
        width: 620,
        height: 760
      });
      if (result) applySettings(JSON.parse(result));
    } catch (error) {
      if (error?.errorCode === tableau.ErrorCodes.DialogClosedByUser) return;
      console.warn('Settings dialog unavailable, using the in-chart panel', error);
      openSettingsPanel();
    }
  }

  function parseNumber (text) {
    if (text == null || String(text).trim() === '') return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  // options: { format: 'auto' | 'number' | 'currency' | 'percent', decimals, units, currencySymbol }
  function formatNumber (value, options) {
    if (options.format === 'auto') return numberFormat.format(value);
    const [divisor, suffix] = {
      thousands: [1e3, 'K'],
      millions: [1e6, 'M'],
      billions: [1e9, 'B']
    }[options.format === 'percent' ? 'none' : options.units] || [1, ''];
    const scaled = options.format === 'percent' ? value * 100 : value / divisor;
    const text = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: options.decimals,
      maximumFractionDigits: options.decimals
    }).format(Math.abs(scaled));
    const sign = scaled < 0 && text.replace(/[0.,\s]/g, '') !== '' ? '-' : '';
    if (options.format === 'percent') return `${sign}${text}%`;
    if (options.format === 'currency') return `${sign}${options.currencySymbol}${text}${suffix}`;
    return `${sign}${text}${suffix}`;
  }

  function formatAxisNumber (value) {
    return formatNumber(value, state.axis);
  }

  // Formats a mark label. tableauLabel is the field's own formatted value from Tableau, when there is one.
  function formatLabel (value, tableauLabel) {
    const labels = state.labels;
    if (value === null || value === undefined) return tableauLabel || '';
    if (labels.numberFormat === 'custom') return formatNumber(value, labels);
    if (labels.numberFormat === 'axis' && state.axis.format !== 'auto') return formatAxisNumber(value);
    return tableauLabel || numberFormat.format(value);
  }

  function formatTooltipValue (value, tableauLabel) {
    return state.labels.applyToTooltips ? formatLabel(value, tableauLabel) : (tableauLabel || numberFormat.format(value));
  }

  function niceStep (rawStep) {
    if (!(rawStep > 0)) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const fraction = rawStep / magnitude;
    return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude;
  }

  // Works out the value axis range and tick positions from the data and the axis settings.
  function getValueScale (values) {
    const axis = state.axis;
    const fixedMin = parseNumber(axis.rangeMin);
    const fixedMax = parseNumber(axis.rangeMax);

    if (axis.logarithmic) {
      const positives = values.filter(value => value > 0);
      if (positives.length === 0) return null;
      const min = fixedMin > 0 ? fixedMin : 10 ** Math.floor(Math.log10(Math.min(...positives)));
      let max = fixedMax > 0 ? fixedMax : 10 ** Math.ceil(Math.log10(Math.max(...positives)));
      if (max <= min) max = min * 10;
      const ticks = [];
      if (axis.ticks !== 'none') {
        const decades = Math.log10(max / min);
        const multiples = decades <= 2 ? [1, 2, 5] : [1];
        for (let power = Math.floor(Math.log10(min)); power <= Math.ceil(Math.log10(max)); power++) {
          for (const multiple of multiples) {
            const tick = Number((multiple * 10 ** power).toPrecision(12));
            if (tick >= min && tick <= max) ticks.push(tick);
          }
        }
      }
      return { min, max, log: true, ticks, baseline: min };
    }

    let low = axis.includeZero ? Math.min(0, ...values) : Math.min(...values);
    let high = axis.includeZero ? Math.max(0, ...values) : Math.max(...values);
    if (fixedMin !== null) low = fixedMin;
    if (fixedMax !== null) high = fixedMax;
    if (high <= low) high = low + (Math.abs(low) * 0.1 || 1);

    const fixedInterval = parseNumber(axis.tickInterval);
    const interval = axis.ticks === 'fixed' && fixedInterval > 0 ? fixedInterval : niceStep((high - low) / 5);
    const min = fixedMin !== null ? fixedMin : Math.floor(low / interval) * interval;
    let max = fixedMax !== null ? fixedMax : Math.ceil(high / interval) * interval;
    if (max <= min) max = min + interval;

    const ticks = [];
    if (axis.ticks !== 'none' && (max - min) / interval <= 100) {
      const first = Math.ceil(min / interval - 1e-9);
      for (let index = first; index * interval <= max + interval * 1e-9; index++) {
        ticks.push(Number((index * interval).toPrecision(12)));
      }
    }
    return { min, max, log: false, ticks, baseline: Math.min(Math.max(0, min), max) };
  }

  function getDateInfo () {
    if (!categoryField || chartRows.length < 3) return null;
    const dates = chartRows.map(row => getCategoryDate(row[categoryField.name]));
    if (dates.some(date => date === null)) return null;
    const monthIndex = date => date.getUTCFullYear() * 12 + date.getUTCMonth();
    const step = monthIndex(dates[dates.length - 1]) - monthIndex(dates[dates.length - 2]);
    return step > 0 ? { dates, step } : null;
  }

  function getForecast () {
    const settings = state.forecast;
    forecastNoteElement.textContent = '';
    if (!settings.show) return null;

    const dateInfo = getDateInfo();
    if (!dateInfo) {
      forecastNoteElement.textContent = 'Forecast needs a month, quarter, or year date on Category with at least 3 points.';
      return null;
    }

    const seasonLength = dateInfo.step === 1 ? 12 : dateInfo.step === 3 ? 4 : 0;
    const periods = settings.length === 'auto' ? (seasonLength || 3) : settings.periods;
    const ignoreLast = Math.max(0, Math.min(settings.ignoreLast, chartRows.length - 3));
    const fields = measureFields.filter(field => settings.measures === null || settings.measures.includes(field.name));
    const errors = [];

    const series = fields.map(field => {
      const values = chartRows
        .slice(0, chartRows.length - ignoreLast)
        .map(row => getNumericValue(row, field))
        .filter(value => value !== null);
      const result = ComboForecast.forecast(values, {
        model: settings.model,
        trend: settings.trend,
        season: settings.season,
        seasonLength,
        horizon: ignoreLast + periods,
        interval: settings.interval
      });
      if (result.error) {
        errors.push(`${field.name}: ${result.error}`);
        return null;
      }
      // Forecasts for ignored periods sit under actual data, so only the future periods are drawn.
      return { field, description: result.description, points: result.points.slice(ignoreLast) };
    }).filter(Boolean);

    if (errors.length > 0) forecastNoteElement.textContent = `No forecast for ${errors.join('; ')}.`;
    if (series.length === 0) return null;

    const last = dateInfo.dates[dateInfo.dates.length - 1];
    const labels = Array.from({ length: periods }, (_, index) =>
      formatMonth(new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + dateInfo.step * (index + 1), 1)))
    );
    return { labels, series };
  }

  function renderColorLegend () {
    colorLegendElement.replaceChildren();
    if (!colorField || colorMembers.length === 0) return;
    const primaryBar = measureFields.find(field => getSeries(field).mode === 'bar');

    const title = document.createElement('span');
    title.className = 'legend-title';
    title.textContent = primaryBar ? `${colorField.name} (${primaryBar.name})` : colorField.name;
    colorLegendElement.appendChild(title);
    if (!primaryBar) {
      const note = document.createElement('span');
      note.textContent = 'Color applies to bars; set a measure to Bar to use it.';
      colorLegendElement.appendChild(note);
      return;
    }
    for (const member of colorMembers) {
      const item = document.createElement('span');
      item.className = 'legend-item';
      const swatch = document.createElement('span');
      swatch.className = 'legend-swatch';
      swatch.style.backgroundColor = getMemberColor(member);
      item.append(swatch, member);
      colorLegendElement.appendChild(item);
    }
  }

  // Read-only measure legend; mark type and line style are changed in Format Extension.
  function renderControls () {
    renderColorLegend();
    seriesListElement.replaceChildren();

    measureFields.forEach(field => {
      const { mode, lineStyle, color } = getSeries(field);
      const item = document.createElement('span');
      item.className = 'legend-item';
      item.title = `${field.name}: ${mode === 'bar' ? 'Bar' : `${lineStyle} line`}. Change it in Format Extension.`;

      item.append(createMarkSwatch({ mode, color, lineStyle }), field.name);
      seriesListElement.appendChild(item);
    });
  }

  function render () {
    renderControls();
    forecastNoteElement.textContent = '';

    if (!categoryField) {
      showMessage('Add one discrete field to Category and one or more measures to Measures.');
      return;
    }
    if (measureFields.length === 0) {
      showMessage('Add one or more numeric measures to Measures.');
      return;
    }
    if (chartRows.length === 0) {
      showMessage('No data is available for the selected fields.');
      return;
    }

    const categories = chartRows.map(row => getCategoryLabel(row[categoryField.name]));
    const values = chartRows.flatMap(row =>
      measureFields.map(field => getNumericValue(row, field)).filter(value => value !== null)
    );
    if (values.length === 0) {
      showMessage('The selected measures do not contain numeric values.');
      return;
    }

    hideMessage();
    hideTooltip();
    chartElement.querySelector('svg')?.remove();

    const showTooltips = state.display.tooltips;
    const labelSettings = state.labels;
    const showValueLabels = labelSettings.show;
    const showTextLabels = Boolean(labelField) && labelSettings.showText;
    const labelFontSize = labelSettings.fontSize;

    // Which marks of one series get a label: all, the min and max, or the most recent.
    const labelFilter = seriesValues => {
      if (labelSettings.marks === 'all') return () => true;
      const valid = seriesValues.map((value, index) => ({ value, index })).filter(item => item.value !== null && item.value !== undefined);
      if (valid.length === 0) return () => false;
      if (labelSettings.marks === 'recent') return index => index === valid[valid.length - 1].index;
      const min = valid.reduce((best, item) => item.value < best.value ? item : best);
      const max = valid.reduce((best, item) => item.value > best.value ? item : best);
      return index => index === min.index || index === max.index;
    };

    const addLabel = (parent, text, x, yPosition, markColor, className = 'value-label') => {
      const fill = labelSettings.colorMode === 'mark' && markColor ? markColor
        : labelSettings.colorMode === 'custom' ? labelSettings.color
          : className === 'text-label' ? '#202124' : '#3c4043';
      const weight = labelSettings.bold || className === 'text-label' ? 600 : 400;
      return addText(parent, text, {
        x,
        y: yPosition,
        'text-anchor': 'middle',
        style: `font-size:${labelFontSize}px;fill:${fill};font-weight:${weight}`
      });
    };

    // Label position on a bar running from startY (baseline side) to endY (value side)
    const barLabelY = (startY, endY) => {
      const upward = endY <= startY;
      if (labelSettings.position === 'center') return (startY + endY) / 2 + labelFontSize / 3;
      if (labelSettings.position === 'inside') return upward ? endY + labelFontSize + 2 : endY - 4;
      return upward ? endY - 4 : endY + labelFontSize + 2;
    };

    const forecast = getForecast();
    const showInterval = state.forecast.showInterval;
    const forecastValues = forecast
      ? forecast.series.flatMap(item => item.points.flatMap(point => showInterval ? [point.low, point.high] : [point.value]))
      : [];

    // The Color encoding splits the first bar measure into stacked or side-by-side member bars.
    const barFields = measureFields.filter(field => getSeries(field).mode === 'bar');
    const primaryBar = colorField && colorMembers.length > 0 ? barFields[0] || null : null;
    const sideBySide = Boolean(primaryBar) && state.colorGroup.layout === 'side-by-side';
    const stackTotals = row => {
      const memberValues = [...getBreakdown(row, primaryBar).values()].map(item => item.value);
      return {
        positive: memberValues.filter(value => value > 0).reduce((sum, value) => sum + value, 0),
        negative: memberValues.filter(value => value < 0).reduce((sum, value) => sum + value, 0)
      };
    };
    const colorValues = !primaryBar ? [] : chartRows.flatMap(row => {
      if (sideBySide) return [...getBreakdown(row, primaryBar).values()].map(item => item.value);
      const totals = stackTotals(row);
      return [totals.positive, totals.negative];
    });

    const axis = state.axis;
    const scale = getValueScale([...values, ...forecastValues, ...colorValues]);
    if (!scale) {
      showMessage('A logarithmic axis needs at least one value greater than zero.');
      return;
    }
    const tickLabels = scale.ticks.map(formatAxisNumber);
    const labels = [...categories, ...(forecast ? forecast.labels : [])];
    const valueTitle = axis.showTitle
      ? (axis.title.trim() || measureFields.map(field => field.name).join(', ')).slice(0, 80)
      : '';
    const categoryTitle = axis.showCategoryTitle ? (axis.categoryTitle.trim() || categoryField.name) : '';
    const angle = axis.labelRotation === 'auto' ? 0 : Number(axis.labelRotation);
    const longestLabel = Math.max(...labels.map(label => label.length));

    const width = Math.max(320, chartElement.clientWidth - 16);
    const height = Math.max(220, chartElement.clientHeight - 8);
    const labelDepth = angle === 0 ? 24 : Math.min(height * 0.35, 16 + longestLabel * 6 * (angle === 45 ? 0.72 : 1));
    const margin = {
      top: showTextLabels || showValueLabels ? 32 : 16,
      right: 18,
      bottom: 16 + labelDepth + (categoryTitle ? 20 : 0),
      left: Math.max(40, 14 + Math.max(0, ...tickLabels.map(label => label.length)) * 6.5 + (valueTitle ? 22 : 0))
    };
    const plotWidth = Math.max(1, width - margin.left - margin.right);
    const plotHeight = Math.max(1, height - margin.top - margin.bottom);
    const logMin = scale.log ? Math.log10(scale.min) : 0;
    const logSpan = scale.log ? Math.log10(scale.max) - logMin : 0;
    const y = value => {
      const unit = scale.log
        ? (Math.log10(value > 0 ? value : scale.min / 1000) - logMin) / logSpan
        : (value - scale.min) / (scale.max - scale.min);
      return margin.top + (axis.reversed ? unit : 1 - unit) * plotHeight;
    };
    const zeroY = y(scale.baseline);
    const groupWidth = plotWidth / labels.length;
    const xCenter = index => margin.left + groupWidth * (index + 0.5);
    const svg = createSvgElement('svg', {
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': 'Combo chart of multiple measures'
    });

    // Marks are clipped to the plot so a fixed axis range cuts them off as Tableau does.
    const clipId = 'plot-clip';
    const clipPath = createSvgElement('clipPath', { id: clipId });
    clipPath.appendChild(createSvgElement('rect', {
      x: margin.left,
      y: margin.top - 24,
      width: plotWidth,
      height: plotHeight + 24
    }));
    const defs = createSvgElement('defs');
    defs.appendChild(clipPath);
    svg.appendChild(defs);
    const plot = createSvgElement('g', { 'clip-path': `url(#${clipId})` });

    if (forecast) {
      const forecastX = margin.left + groupWidth * categories.length;
      svg.appendChild(createSvgElement('rect', {
        x: forecastX,
        y: margin.top,
        width: width - margin.right - forecastX,
        height: plotHeight,
        class: 'forecast-area'
      }));
      addText(svg, 'Forecast', {
        x: forecastX + 6,
        y: margin.top + 12,
        class: 'axis-label'
      });
    }

    scale.ticks.forEach((value, index) => {
      const yPosition = y(value);
      if (axis.gridLines) {
        svg.appendChild(createSvgElement('line', {
          x1: margin.left,
          x2: width - margin.right,
          y1: yPosition,
          y2: yPosition,
          class: 'grid-line'
        }));
      }
      addText(svg, tickLabels[index], {
        x: margin.left - 8,
        y: yPosition + 4,
        'text-anchor': 'end',
        class: 'tick-label'
      });
    });

    svg.appendChild(createSvgElement('line', {
      x1: margin.left,
      x2: width - margin.right,
      y1: zeroY,
      y2: zeroY,
      class: 'axis-line'
    }));

    // Each bar measure takes one width unit; a side-by-side Color measure takes one unit per member.
    const barUnits = barFields.map(field => field === primaryBar && sideBySide ? colorMembers.length : 1);
    const totalUnits = barUnits.reduce((sum, units) => sum + units, 0);
    const unitOffsets = barUnits.map((_, index) => barUnits.slice(0, index).reduce((sum, units) => sum + units, 0));
    const barWidth = Math.min(36, groupWidth * 0.72 / Math.max(1, totalUnits));
    const barX = (slotIndex, barIndex, subIndex = 0) =>
      xCenter(slotIndex) - barWidth * totalUnits / 2 + (unitOffsets[barIndex] + subIndex) * barWidth;
    const barSpan = barIndex => barUnits[barIndex] * barWidth;

    const shouldLabel = new Map(measureFields.map(field =>
      [field.name, labelFilter(chartRows.map(row => getNumericValue(row, field)))]
    ));
    const shouldLabelMember = new Map(primaryBar
      ? colorMembers.map(member => [member, labelFilter(chartRows.map(row => getBreakdown(row, primaryBar).get(member)?.value ?? null))])
      : []);

    const drawColorBars = (row, categoryIndex, barIndex) => {
      const breakdown = getBreakdown(row, primaryBar);
      let positive = 0;
      let negative = 0;
      colorMembers.forEach((member, subIndex) => {
        const item = breakdown.get(member);
        if (!item || (!sideBySide && item.value === 0)) return;
        let from = 0;
        let to = item.value;
        if (!sideBySide) {
          from = item.value >= 0 ? positive : negative;
          to = from + item.value;
          if (item.value >= 0) positive = to; else negative = to;
        }
        const fromY = from === 0 ? zeroY : y(from);
        const toY = y(to);
        const left = barX(categoryIndex, barIndex, sideBySide ? subIndex : 0);
        const width = sideBySide ? barWidth : barSpan(barIndex);
        plot.appendChild(createSvgElement('rect', {
          x: left + 1,
          y: Math.min(fromY, toY),
          width: Math.max(1, width - 2),
          height: Math.max(1, Math.abs(fromY - toY)),
          fill: getMemberColor(member),
          stroke: sideBySide ? 'none' : '#fff',
          'stroke-width': 0.5
        }));
        if (showValueLabels && sideBySide && shouldLabelMember.get(member)(categoryIndex)) {
          addLabel(plot, formatLabel(item.value, item.label), left + width / 2, barLabelY(fromY, toY), getMemberColor(member));
        }
      });
      // Stacked bars get one label for the total
      if (showValueLabels && !sideBySide && shouldLabel.get(primaryBar.name)(categoryIndex)) {
        const endY = positive !== 0 ? y(positive) : negative !== 0 ? y(negative) : zeroY;
        addLabel(
          plot,
          formatLabel(getNumericValue(row, primaryBar), getLabel(row[primaryBar.name])),
          barX(categoryIndex, barIndex) + barSpan(barIndex) / 2,
          barLabelY(zeroY, endY),
          getSeries(primaryBar).color
        );
      }
    };

    chartRows.forEach((row, categoryIndex) => {
      barFields.forEach((field, barIndex) => {
        if (field === primaryBar) {
          drawColorBars(row, categoryIndex, barIndex);
          return;
        }
        const value = getNumericValue(row, field);
        if (value === null) return;
        const yValue = y(value);
        plot.appendChild(createSvgElement('rect', {
          x: barX(categoryIndex, barIndex) + 1,
          y: Math.min(zeroY, yValue),
          width: Math.max(1, barWidth - 2),
          height: Math.max(1, Math.abs(zeroY - yValue)),
          fill: getSeries(field).color,
          rx: 1
        }));
        if (showValueLabels && shouldLabel.get(field.name)(categoryIndex)) {
          addLabel(
            plot,
            formatLabel(value, getLabel(row[field.name])),
            barX(categoryIndex, barIndex) + barWidth / 2,
            barLabelY(zeroY, yValue),
            getSeries(field).color
          );
        }
      });
    });

    const linePoints = new Map();
    measureFields.forEach(field => {
      const { mode, lineStyle, color } = getSeries(field);
      if (mode !== 'line') return;
      const points = chartRows
        .map((row, categoryIndex) => {
          const value = getNumericValue(row, field);
          return value === null ? null : { x: xCenter(categoryIndex), y: y(value), value, categoryIndex };
        })
        .filter(point => point !== null);
      linePoints.set(field.name, points);
      if (points.length === 0) return;

      const path = createSvgElement('path', {
        d: points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '),
        fill: 'none',
        stroke: color,
        'stroke-width': 2.5,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        'aria-label': `${field.name} ${lineStyle} line`
      });
      const dashArray = LINE_STYLES[lineStyle];
      if (dashArray) path.setAttribute('stroke-dasharray', dashArray);
      plot.appendChild(path);

      points.forEach(point => {
        plot.appendChild(createSvgElement('circle', {
          cx: point.x,
          cy: point.y,
          r: 3.5,
          fill: color,
          stroke: '#fff',
          'stroke-width': 1.5
        }));
        if (showValueLabels && shouldLabel.get(field.name)(point.categoryIndex)) {
          addLabel(plot, formatLabel(point.value, getLabel(chartRows[point.categoryIndex][field.name])), point.x, point.y - 8, color);
        }
      });
    });

    // Forecast marks use the measure's own mark type in a lighter shade, as Tableau does.
    // Min/max and most-recent labels apply to actual data only
    const labelForecast = showValueLabels && labelSettings.marks === 'all';
    if (forecast) {
      forecast.series.forEach(({ field, points }) => {
        const { mode, color } = getSeries(field);
        const slots = points.map((point, index) => ({ ...point, slot: categories.length + index }));

        if (mode === 'bar') {
          const barIndex = barFields.indexOf(field);
          const span = barSpan(barIndex);
          slots.forEach(point => {
            const left = barX(point.slot, barIndex);
            const center = left + span / 2;
            const yValue = y(point.value);
            plot.appendChild(createSvgElement('rect', {
              x: left + 1,
              y: Math.min(zeroY, yValue),
              width: Math.max(1, span - 2),
              height: Math.max(1, Math.abs(zeroY - yValue)),
              fill: color,
              'fill-opacity': 0.4,
              rx: 1
            }));
            if (showInterval) {
              const capWidth = Math.min(8, barWidth / 3);
              plot.appendChild(createSvgElement('path', {
                d: `M ${center} ${y(point.high)} L ${center} ${y(point.low)} ` +
                  `M ${center - capWidth} ${y(point.high)} L ${center + capWidth} ${y(point.high)} ` +
                  `M ${center - capWidth} ${y(point.low)} L ${center + capWidth} ${y(point.low)}`,
                stroke: color,
                'stroke-width': 1.5,
                fill: 'none'
              }));
            }
            if (labelForecast) {
              addLabel(plot, formatLabel(point.value), center, showInterval ? Math.min(y(point.high), y(point.low)) - 4 : barLabelY(zeroY, yValue), color);
            }
          });
          return;
        }

        const actual = linePoints.get(field.name) || [];
        const anchor = actual[actual.length - 1];
        const start = anchor ? `M ${anchor.x} ${anchor.y} ` : '';
        const route = slots.map((point, index) => `${!anchor && index === 0 ? 'M' : 'L'} ${xCenter(point.slot)} ${y(point.value)}`).join(' ');
        if (showInterval) {
          const upper = slots.map(point => `L ${xCenter(point.slot)} ${y(point.high)}`);
          const lower = slots.slice().reverse().map(point => `L ${xCenter(point.slot)} ${y(point.low)}`);
          const first = anchor || { x: xCenter(slots[0].slot), y: y(slots[0].value) };
          plot.appendChild(createSvgElement('path', {
            d: `M ${first.x} ${first.y} ${upper.join(' ')} ${lower.join(' ')} Z`,
            fill: color,
            'fill-opacity': 0.15,
            stroke: 'none'
          }));
        }
        plot.appendChild(createSvgElement('path', {
          d: start + route,
          fill: 'none',
          stroke: color,
          'stroke-opacity': 0.6,
          'stroke-width': 2.5,
          'stroke-dasharray': '6 4',
          'stroke-linecap': 'round',
          'aria-label': `${field.name} forecast`
        }));
        slots.forEach(point => {
          plot.appendChild(createSvgElement('circle', {
            cx: xCenter(point.slot),
            cy: y(point.value),
            r: 3.5,
            fill: '#fff',
            stroke: color,
            'stroke-width': 2
          }));
          if (labelForecast) {
            addLabel(plot, formatLabel(point.value), xCenter(point.slot), y(point.value) - 8, color);
          }
        });
      });
    }

    if (showTextLabels) {
      chartRows.forEach((row, categoryIndex) => {
        const rowValues = measureFields.map(field => getNumericValue(row, field)).filter(value => value !== null);
        const top = Math.min(zeroY, ...rowValues.map(y));
        // A numeric Text field follows the label number format too
        const textValue = getValue(row[labelField.name]);
        const text = typeof textValue === 'number' ? formatLabel(textValue, getLabel(row[labelField.name])) : getLabel(row[labelField.name]);
        addLabel(plot, text, xCenter(categoryIndex), Math.max(12, top - (showValueLabels ? labelFontSize + 8 : 6)), null, 'text-label');
      });
    }

    svg.appendChild(plot);

    // Horizontal labels are thinned out so long month names do not overlap; rotated labels fit more.
    const labelSpacing = angle === 0 ? 96 : angle === 45 ? 20 : 14;
    const labelStep = Math.ceil(labels.length / Math.max(1, Math.floor(plotWidth / labelSpacing)));
    const labelY = height - margin.bottom + 18;
    labels.forEach((label, index) => {
      if (index % labelStep !== 0) return;
      const x = xCenter(index);
      addText(svg, label, angle === 0
        ? { x, y: labelY, 'text-anchor': 'middle', class: 'tick-label' }
        : { x, y: labelY - 6, 'text-anchor': 'end', transform: `rotate(-${angle} ${x} ${labelY - 6})`, class: 'tick-label' });
    });

    if (categoryTitle) {
      addText(svg, categoryTitle, {
        x: margin.left + plotWidth / 2,
        y: height - 6,
        'text-anchor': 'middle',
        class: 'axis-label'
      });
    }

    // Double-click an axis to edit it, like Tableau's Edit Axis
    for (const area of [
      { x: 0, y: margin.top, width: margin.left, height: plotHeight },
      { x: margin.left, y: margin.top + plotHeight, width: plotWidth, height: margin.bottom }
    ]) {
      const target = createSvgElement('rect', { ...area, fill: 'transparent', cursor: 'pointer' });
      const title = createSvgElement('title');
      title.textContent = 'Double-click to edit axis';
      target.appendChild(title);
      target.addEventListener('dblclick', openSettings);
      svg.appendChild(target);
    }

    if (showTooltips) {
      const measureNames = new Set(measureFields.map(field => field.name));
      const extraFieldNames = Object.keys(chartRows[0]).filter(name =>
        name !== categoryField.name && name !== labelField?.name && name !== colorField?.name && !measureNames.has(name)
      );
      const getTooltipContent = index => {
        if (index >= chartRows.length) {
          const forecastIndex = index - chartRows.length;
          return {
            title: `${forecast.labels[forecastIndex]} (forecast)`,
            rows: forecast.series.flatMap(({ field, points, description }) => [
              { name: field.name, value: formatTooltipValue(points[forecastIndex].value), mark: { ...seriesMark(field), forecast: true } },
              ...(showInterval ? [{
                name: `${state.forecast.interval}% prediction interval`,
                value: `${formatTooltipValue(points[forecastIndex].low)} – ${formatTooltipValue(points[forecastIndex].high)}`
              }] : []),
              { name: 'Model', value: description }
            ])
          };
        }
        const row = chartRows[index];
        return {
          title: categories[index],
          rows: [
            ...measureFields.flatMap(field => [
              { name: field.name, value: formatTooltipValue(getNumericValue(row, field), getLabel(row[field.name])), mark: field === primaryBar ? null : seriesMark(field) },
              ...(field === primaryBar
                ? colorMembers
                  .filter(member => getBreakdown(row, field).has(member))
                  .map(member => ({ name: member, value: formatTooltipValue(getBreakdown(row, field).get(member).value, getBreakdown(row, field).get(member).label), mark: { mode: 'bar', color: getMemberColor(member) } }))
                : [])
            ]),
            ...(labelField ? [{ name: labelField.name, value: getLabel(row[labelField.name]) }] : []),
            ...extraFieldNames.map(name => ({ name, value: getLabel(row[name]) }))
          ]
        };
      };

      // Transparent hover columns on top of the marks, one per category
      labels.forEach((label, index) => {
        const content = getTooltipContent(index);
        const target = createSvgElement('rect', {
          x: margin.left + groupWidth * index,
          y: margin.top,
          width: groupWidth,
          height: plotHeight,
          class: 'hover-target'
        });
        target.addEventListener('mousemove', event => showTooltip(event, content));
        target.addEventListener('mouseleave', hideTooltip);
        svg.appendChild(target);
      });
    }

    if (valueTitle) {
      addText(svg, valueTitle, {
        x: 14,
        y: margin.top + plotHeight / 2,
        transform: `rotate(-90 14 ${margin.top + plotHeight / 2})`,
        'text-anchor': 'middle',
        class: 'axis-label'
      });
    }

    chartElement.appendChild(svg);
  }

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

  // Members are sorted alphabetically, as in Tableau's default color legend
  function setColorMembers (rows) {
    colorMembers = colorField
      ? [...new Set(rows.map(row => getLabel(row[colorField.name])))]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      : [];
  }

  function updateFromTableau (worksheet) {
    const refresh = async () => {
      try {
        const [rows, encodings] = await Promise.all([
          getSummaryRows(worksheet),
          getEncodings(worksheet)
        ]);
        categoryField = encodings.category?.[0];
        measureFields = encodings.measures || [];
        labelField = encodings.label?.[0];
        colorField = encodings.colorgroup?.[0];
        setColorMembers(rows);
        chartRows = sortRowsByDate(groupRowsByCategory(rows));
        render();
      } catch (error) {
        showMessage(`Unable to load Tableau data: ${error.message || error}`);
      }
    };

    worksheet.addEventListener(tableau.TableauEventType.SummaryDataChanged, refresh);
    refresh();
  }

  function renderPreview () {
    categoryField = { name: 'Month' };
    measureFields = [
      { name: 'Sales' },
      { name: 'Profit' },
      { name: 'Orders' },
      { name: 'Target' }
    ];
    labelField = undefined;
    colorField = { name: 'Region' };
    // Each month is split across regions so the Color grouping can be previewed
    const regions = [['East', 0.4], ['West', 0.35], ['North', 0.25]];
    const rows = Array.from({ length: 24 }, (_, index) => {
      const season = Math.sin(index / 12 * 2 * Math.PI);
      const month = String(index % 12 + 1).padStart(2, '0');
      return regions.map(([region, share]) => ({
        Month: { value: `${2025 + Math.floor(index / 12)}-${month}-01` },
        Region: { value: region },
        Sales: { value: Math.round((90 + index * 2.5 + season * 18) * share) },
        Profit: { value: Math.round((35 + index * 1.1 + season * 8) * share) },
        Orders: { value: Math.round((60 + index * 1.2 + season * 10) * share) },
        Target: { value: Math.round((75 + index * 2) * share) }
      }));
    }).flat();
    setColorMembers(rows);
    chartRows = sortRowsByDate(groupRowsByCategory(rows));
    state.forecast.show = true;
    render();
  }

  window.addEventListener('resize', render);

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
