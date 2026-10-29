'use strict';

(function () {
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
  const DEFAULT_STATE = {
    // Every color of the card; picking a theme in the settings fills these in (KpiSettingsForm.THEMES)
    colors: { ...KpiSettingsForm.THEMES.light.colors },
    // Card corner radius, px
    radius: 10,
    border: true,
    // align: 'left' | 'center' | 'right'; verticalAlign: 'top' | 'middle'
    align: 'left',
    verticalAlign: 'top',
    // text '' = the Value field's name
    title: { show: true, text: '', fontSize: 13 },
    // name: an icon from KpiSettingsForm.ICONS, or 'none'
    icon: { name: 'none' },
    // Uses only rows where this field (e.g. a True/False date-range test on Detail) is True, the same as the
    // radial chart's Visible rows and the combo chart's Visible categories, so one parameter drives them all
    visibility: { field: '' },
    // How rows are combined when the sheet has more than one (a Trend dimension, or a field on Detail):
    // 'auto' (one value repeated on every row is used as it is; otherwise Value and Target add up and the
    // others take the latest row) | 'sum' | 'avg' | 'min' | 'max' | 'first' | 'last'
    aggregation: { value: 'auto', target: 'auto', attainment: 'auto', change: 'auto', marker: 'auto' },
    // fontSize px; note: text beside the value (template, see fillTemplate); colorByStatus: the value in the status color
    value: { fontSize: 30, note: '', colorByStatus: false },
    // Attainment (the Attainment field, or Value ÷ Target) compared with 100%, or with the marker (pace).
    // near: the lowest attainment, as % of the goal, that counts as near
    status: {
      show: true,
      basis: 'target',
      near: 90,
      labels: { on: 'On target', near: 'Near target', below: 'Below target' },
      colors: { on: '#1e8e3e', near: '#f29900', below: '#d93025' }
    },
    // Attainment bar. max: % of the target the full bar stands for; markerField: a fraction on Detail (e.g. share
    // of the year gone) drawn as a line on the bar; caption: text under the bar (template)
    progress: { show: true, max: 100, showPercent: true, markerField: '', caption: '', colorByStatus: true },
    // One per Change field: label after the change (template); format: 'auto' | 'percent' | 'points' | 'number';
    // higherIsBetter: up is green; showSign: + or − before the number as well as the arrow
    changes: [
      { label: 'vs prior year', format: 'auto', higherIsBetter: true, showSign: false },
      { label: 'vs target', format: 'auto', higherIsBetter: true, showSign: false }
    ],
    // Lines of text at the bottom (template; one line per line)
    footer: '',
    // Line of the Value per Trend member, beside the value
    sparkline: { show: true, area: true },
    // format: 'auto' (Tableau's own format) | 'number' | 'currency' | 'percent'
    // units: 'none' | 'auto' | 'thousands' | 'millions' | 'billions'
    number: { format: 'auto', decimals: 1, units: 'none', currencySymbol: '฿ ' },
    percentDecimals: 1,
    // syncAnimation: play the animation together with the other charts on the same dashboard (chart-sync.js)
    display: { animate: true, syncAnimation: true }
  };
  const SETTINGS_KEY = 'kpiCardState';
  const UNITS = { thousands: [1e3, 'K'], millions: [1e6, 'M'], billions: [1e9, 'B'] };
  const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  const compactFormat = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  const inTableau = Boolean(window.tableau?.extensions) && window.parent !== window;

  const cardElement = document.getElementById('card');
  const messageElement = document.getElementById('message');
  const settingsOverlay = document.getElementById('settings-overlay');
  const settingsFormElement = document.getElementById('settings-form');
  const previewSettingsButton = document.getElementById('preview-settings');

  let worksheet = null;
  let rawRows = [];
  // Encoded fields: { value, target, attainment, changes: [], trend }
  let fields = { changes: [] };
  // Combined numbers: { value, target, attainment, marker, gap, changes: [], latest, trend: [{ name, value }] },
  // each number as { value, label } or null
  let kpi = null;
  // Why the next render animates: 'data' (new data), 'local' (settings, or another chart started animating), or
  // null (resize: no animation)
  let animateNext = 'data';
  let state = mergeState({});

  function mergeState (saved) {
    const merged = { ...DEFAULT_STATE, ...saved };
    for (const key of ['colors', 'title', 'icon', 'visibility', 'aggregation', 'value', 'progress', 'sparkline', 'number', 'display']) {
      merged[key] = { ...DEFAULT_STATE[key], ...saved[key] };
    }
    merged.status = {
      ...DEFAULT_STATE.status,
      ...saved.status,
      labels: { ...DEFAULT_STATE.status.labels, ...saved.status?.labels },
      colors: { ...DEFAULT_STATE.status.colors, ...saved.status?.colors }
    };
    merged.changes = DEFAULT_STATE.changes.map((change, index) => ({ ...change, ...saved.changes?.[index] }));
    return merged;
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
    if (typeof dataValue === 'object' && 'value' in dataValue) return dataValue.value;
    return dataValue;
  }

  function getLabel (dataValue) {
    if (dataValue == null) return '';
    if (typeof dataValue === 'object') return dataValue.formattedValue ?? String(dataValue.value ?? '');
    return String(dataValue);
  }

  function getNumber (dataValue) {
    const value = getValue(dataValue);
    if (value == null || value === '' || typeof value === 'boolean') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function showMessage (message) {
    cardElement.hidden = true;
    messageElement.textContent = message;
    messageElement.hidden = false;
  }

  // Formatting

  // tableauLabel is the field's own formatted value, used by the Automatic format when there is one
  function formatValue (value, tableauLabel) {
    const options = state.number;
    if (options.format === 'auto') {
      if (tableauLabel) return tableauLabel;
      return Math.abs(value) >= 1e4 ? compactFormat.format(value) : numberFormat.format(value);
    }
    let units = options.format === 'percent' ? 'none' : options.units;
    if (units === 'auto') {
      const size = Math.abs(value);
      units = size >= 1e9 ? 'billions' : size >= 1e6 ? 'millions' : size >= 1e3 ? 'thousands' : 'none';
    }
    const [divisor, suffix] = UNITS[units] || [1, ''];
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

  function formatPercent (share, signed) {
    const text = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: state.percentDecimals,
      maximumFractionDigits: state.percentDecimals,
      signDisplay: signed ? 'exceptZero' : 'auto'
    }).format(share * 100);
    return `${text}%`;
  }

  function formatNumber (number) {
    return number ? formatValue(number.value, number.label) : '–';
  }

  // A change without its sign (the arrow shows the direction), or with it when showSign is on.
  // 'auto' uses Tableau's own format, else a percent; 'points' shows a difference of two rates (0.012 = 1.2 pts).
  function formatChange (number, options) {
    const { value, label } = number;
    const decimals = { minimumFractionDigits: state.percentDecimals, maximumFractionDigits: state.percentDecimals };
    const size = Math.abs(value);
    let text;
    if (options.format === 'auto' && label) text = label.replace(/^[+\-−]\s*/, '');
    else if (options.format === 'points') text = `${new Intl.NumberFormat(undefined, decimals).format(size * 100)} pts`;
    else if (options.format === 'number') text = formatValue(size, '');
    else text = `${new Intl.NumberFormat(undefined, decimals).format(size * 100)}%`;
    if (!options.showSign || value === 0) return text;
    return `${value < 0 ? '−' : '+'}${text}`;
  }

  // Data

  // Columns that aren't on an encoding, i.e. fields on Detail or Tooltip
  function getUnencodedFields () {
    if (rawRows.length === 0) return [];
    const used = new Set([fields.value, fields.target, fields.attainment, fields.trend, ...fields.changes]
      .filter(Boolean).map(field => field.name));
    return Object.keys(rawRows[0]).filter(name => !used.has(name));
  }

  function hasField (fieldName) {
    return Boolean(fieldName) && rawRows.length > 0 && fieldName in rawRows[0];
  }

  function isTrue (dataValue) {
    const value = getValue(dataValue);
    return value === true || String(value).toLowerCase() === 'true' || getLabel(dataValue).toLowerCase() === 'true';
  }

  // Rows where the visibility field is True, or every row when none is chosen
  function getVisibleRows () {
    const fieldName = state.visibility.field;
    if (!hasField(fieldName)) return rawRows;
    return rawRows.filter(row => isTrue(row[fieldName]));
  }

  // One number from a field's rows: { value, label } or null. additive: 'auto' adds the rows up rather than
  // taking the latest. The label is Tableau's formatted value when the number comes from a single row.
  function combine (rows, fieldName, method, additive) {
    if (!fieldName) return null;
    const cells = rows.map(row => row[fieldName]).filter(cell => getNumber(cell) !== null);
    if (cells.length === 0) return null;
    const numbers = cells.map(getNumber);
    if (method === 'auto') {
      if (numbers.every(number => number === numbers[0])) return { value: numbers[0], label: getLabel(cells[0]) };
      method = additive ? 'sum' : 'last';
    }
    const pick = index => ({ value: numbers[index], label: getLabel(cells[index]) });
    switch (method) {
      case 'first': return pick(0);
      case 'last': return pick(numbers.length - 1);
      case 'min': return pick(numbers.indexOf(Math.min(...numbers)));
      case 'max': return pick(numbers.indexOf(Math.max(...numbers)));
      case 'avg': return { value: numbers.reduce((sum, number) => sum + number, 0) / numbers.length, label: '' };
      default: return { value: numbers.reduce((sum, number) => sum + number, 0), label: '' };
    }
  }

  // Trend members in data order, each with its Value added up
  function getTrend (rows) {
    if (!fields.trend || !fields.value) return [];
    const members = new Map();
    for (const row of rows) {
      const number = getNumber(row[fields.value.name]);
      if (number === null) continue;
      const name = getLabel(row[fields.trend.name]);
      members.set(name, (members.get(name) ?? 0) + number);
    }
    return [...members].map(([name, value]) => ({ name, value }));
  }

  function buildKpi () {
    kpi = null;
    if (!fields.value) return;
    const rows = getVisibleRows();
    const aggregation = state.aggregation;
    const value = combine(rows, fields.value.name, aggregation.value, true);
    const target = combine(rows, fields.target?.name, aggregation.target, true);
    const attainment = fields.attainment
      ? combine(rows, fields.attainment.name, aggregation.attainment, false)
      : value && target?.value > 0 ? { value: value.value / target.value, label: '' } : null;
    const marker = hasField(state.progress.markerField)
      ? combine(rows, state.progress.markerField, aggregation.marker, false)
      : null;
    const trend = getTrend(rows);
    kpi = {
      rows,
      value,
      target,
      attainment,
      marker,
      gap: value && target ? { value: value.value - target.value, label: '' } : null,
      changes: fields.changes.map(field => combine(rows, field.name, aggregation.change, false)),
      latest: trend.length > 0 ? trend[trend.length - 1].name : '',
      trend
    };
  }

  // 'on' | 'near' | 'below', or null without an attainment
  function getStatus () {
    const attainment = kpi.attainment?.value;
    if (attainment == null) return null;
    const goal = state.status.basis === 'marker' && kpi.marker ? kpi.marker.value : 1;
    if (!(goal > 0)) return null;
    const ratio = attainment / goal;
    return ratio >= 1 ? 'on' : ratio >= state.status.near / 100 ? 'near' : 'below';
  }

  // Template text: {value}, {target}, {attainment}, {gap}, {marker}, {latest}, {change1}, {change2}, or any field
  // name in braces, such as {Prior Year Label}. Returns parts: strings, and { strong } for filled-in values.
  function fillTemplate (template) {
    const tokens = {
      value: () => formatNumber(kpi.value),
      target: () => formatNumber(kpi.target),
      attainment: () => kpi.attainment ? formatPercent(kpi.attainment.value) : '–',
      gap: () => kpi.gap ? formatValue(kpi.gap.value, '') : '–',
      marker: () => kpi.marker ? formatPercent(kpi.marker.value) : '–',
      latest: () => kpi.latest,
      change1: () => kpi.changes[0] ? formatChange(kpi.changes[0], { ...state.changes[0], showSign: true }) : '–',
      change2: () => kpi.changes[1] ? formatChange(kpi.changes[1], { ...state.changes[1], showSign: true }) : '–'
    };
    const parts = [];
    let last = 0;
    for (const match of template.matchAll(/\{([^{}]+)\}/g)) {
      const key = match[1].trim();
      let text = null;
      if (tokens[key.toLowerCase()]) text = tokens[key.toLowerCase()]();
      else if (hasField(key)) text = getFieldText(key);
      if (text === null) continue;
      parts.push(template.slice(last, match.index), { strong: text });
      last = match.index + match[0].length;
    }
    parts.push(template.slice(last));
    return parts.filter(part => part !== '');
  }

  // Any field's text for a template: a number combined as for Value, or the distinct texts
  function getFieldText (fieldName) {
    const cells = kpi.rows.map(row => row[fieldName]);
    if (cells.length > 0 && cells.every(cell => getNumber(cell) !== null)) {
      return formatNumber(combine(kpi.rows, fieldName, 'auto', false));
    }
    const texts = [...new Set(cells.map(getLabel).filter(Boolean))];
    return texts.length <= 3 ? texts.join(', ') : `${texts.length} values`;
  }

  function templateElement (className, template) {
    const element = createElement('div', className);
    for (const part of fillTemplate(template)) {
      element.append(typeof part === 'string' ? part : createElement('strong', '', part.strong));
    }
    return element;
  }

  // Rendering

  function hexToRgba (hex, alpha) {
    const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!match) return hex;
    const [r, g, b] = match.slice(1).map(part => parseInt(part, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function applyColors () {
    const colors = state.colors;
    const style = document.body.style;
    style.setProperty('--page', colors.page);
    style.setProperty('--card', colors.card);
    style.setProperty('--border', colors.border);
    style.setProperty('--text', colors.text);
    style.setProperty('--muted', colors.muted);
    style.setProperty('--track', colors.track);
    style.setProperty('--radius', `${state.radius}px`);
  }

  function renderIcon () {
    const icon = KpiSettingsForm.ICONS[state.icon.name];
    if (!icon) return null;
    const wrapper = createElement('div', 'icon');
    wrapper.style.background = hexToRgba(state.colors.accent, 0.12);
    const svg = createSvgElement('svg', {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: state.colors.accent,
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true'
    });
    for (const [name, attributes] of icon.shapes) svg.appendChild(createSvgElement(name, attributes));
    wrapper.appendChild(svg);
    return wrapper;
  }

  function renderStatus (status) {
    if (!state.status.show || !status || !fields.target && !fields.attainment) return null;
    const color = state.status.colors[status];
    const element = createElement('span', 'status');
    element.style.color = color;
    // A dot when on target, a warning triangle when near, a down triangle when below
    const symbol = createElement('span', '', { on: '●', near: '▲', below: '▼' }[status]);
    element.append(symbol, state.status.labels[status]);
    return element;
  }

  function renderSparkline () {
    const points = kpi.trend;
    if (!state.sparkline.show || points.length < 2) return null;
    const width = 140;
    const height = 36;
    const values = points.map(point => point.value);
    const min = Math.min(...values);
    const range = Math.max(...values) - min || 1;
    const xy = points.map((point, index) => [
      2 + index / (points.length - 1) * (width - 6),
      3 + (1 - (point.value - min) / range) * (height - 6)
    ]);
    const path = xy.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    const svg = createSvgElement('svg', { class: 'sparkline', viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none' });
    const color = state.colors.accent;
    if (state.sparkline.area) {
      svg.appendChild(createSvgElement('path', {
        class: 'trend-area',
        d: `${path}L${xy[xy.length - 1][0].toFixed(1)},${height}L${xy[0][0].toFixed(1)},${height}Z`,
        fill: hexToRgba(color, 0.12)
      }));
    }
    svg.appendChild(createSvgElement('path', {
      class: 'trend-line',
      d: path,
      fill: 'none',
      stroke: color,
      'stroke-width': 1.8,
      'stroke-linejoin': 'round',
      'vector-effect': 'non-scaling-stroke',
      pathLength: 100
    }));
    const [x, y] = xy[xy.length - 1];
    svg.appendChild(createSvgElement('circle', { class: 'trend-dot', cx: x, cy: y, r: 2.8, fill: color }));
    const title = createSvgElement('title');
    title.textContent = points.map(point => `${point.name}: ${formatValue(point.value, '')}`).join('\n');
    svg.appendChild(title);
    return svg;
  }

  function renderProgress (status) {
    const progress = state.progress;
    if (!progress.show || !kpi.attainment) return [];
    const max = Math.max(1, progress.max) / 100;
    const color = progress.colorByStatus && status ? state.status.colors[status] : state.colors.accent;
    const row = createElement('div', 'progress');
    const track = createElement('div', 'track');
    const fill = createElement('div', 'fill');
    fill.style.width = `${Math.max(0, Math.min(1, kpi.attainment.value / max)) * 100}%`;
    fill.style.background = color;
    track.appendChild(fill);
    if (kpi.marker) {
      const marker = createElement('div', 'marker');
      marker.style.left = `${Math.max(0, Math.min(1, kpi.marker.value / max)) * 100}%`;
      marker.title = `Marker: ${formatPercent(kpi.marker.value)}`;
      track.appendChild(marker);
    }
    row.appendChild(track);
    if (progress.showPercent) {
      const percent = createElement('span', 'progress-percent', formatPercent(kpi.attainment.value));
      percent.style.color = color;
      row.appendChild(percent);
    }
    const parts = [row];
    if (progress.caption) parts.push(templateElement('line', progress.caption));
    return parts;
  }

  function renderChanges () {
    return kpi.changes.map((change, index) => {
      if (!change) return null;
      const options = state.changes[index];
      const good = change.value === 0 ? null : (change.value > 0) === options.higherIsBetter;
      const color = good === null ? state.colors.muted : good ? state.status.colors.on : state.status.colors.below;
      const line = createElement('div', 'line');
      const number = createElement('span', 'change-value', `${change.value < 0 ? '▼' : change.value > 0 ? '▲' : '■'} ${formatChange(change, options)}`);
      number.style.color = color;
      line.appendChild(number);
      if (options.label) {
        const label = templateElement('', options.label);
        line.append(' ', ...label.childNodes);
      }
      return line;
    }).filter(Boolean);
  }

  function render () {
    applyColors();
    if (!fields.value) {
      showMessage('Add a measure to Value. Optionally add Target, Attainment, Change, and a Trend dimension.');
      return;
    }
    if (!kpi?.value) {
      showMessage(state.visibility.field && hasField(state.visibility.field)
        ? `No rows where ${state.visibility.field} is True.`
        : 'No data to show.');
      return;
    }
    messageElement.hidden = true;

    const status = getStatus();
    const body = createElement('div', 'body');
    const head = createElement('div', 'head');
    if (state.title.show) {
      const title = createElement('div', 'title', state.title.text || fields.value.name);
      title.style.color = state.colors.title;
      title.style.fontSize = `${state.title.fontSize}px`;
      head.appendChild(title);
    }
    const statusElement = renderStatus(status);
    if (statusElement) head.appendChild(statusElement);
    if (head.childElementCount > 0) body.appendChild(head);

    const valueRow = createElement('div', 'value-row');
    const value = createElement('div', 'value', formatNumber(kpi.value));
    value.style.fontSize = `${state.value.fontSize}px`;
    value.style.color = state.value.colorByStatus && status ? state.status.colors[status] : state.colors.value;
    valueRow.appendChild(value);
    if (state.value.note) valueRow.appendChild(templateElement('value-note', state.value.note));
    const sparkline = renderSparkline();
    if (sparkline) valueRow.appendChild(sparkline);
    body.appendChild(valueRow);

    body.append(...renderProgress(status), ...renderChanges());
    for (const line of state.footer.split('\n').filter(text => text.trim())) {
      body.appendChild(templateElement('line', line));
    }

    const icon = renderIcon();
    cardElement.replaceChildren(...[icon, body].filter(Boolean));
    cardElement.className = `align-${state.align}`;
    cardElement.classList.toggle('middle', state.verticalAlign === 'middle');
    cardElement.classList.toggle('no-border', !state.border);
    const animate = Boolean(animateNext) && state.display.animate;
    cardElement.classList.toggle('animate', animate);
    if (animate) {
      // In step with the other charts' shared clock (chart-sync.js); only new data asks them to play along
      const elapsed = state.display.syncAnimation ? ChartSync.begin(animateNext === 'data') : 0;
      cardElement.style.setProperty('--elapsed', `${elapsed}ms`);
    }
    animateNext = null;
    cardElement.hidden = false;
  }

  function update () {
    buildKpi();
    render();
  }

  // Settings: the Tableau "Format Extension" dialog (Marks card), or an in-page panel as a fallback.

  function getSettingsPayload () {
    return {
      state,
      defaultState: mergeState({}),
      fields: {
        value: fields.value?.name || '',
        target: fields.target?.name || '',
        attainment: fields.attainment?.name || '',
        changes: fields.changes.map(field => field.name),
        trend: fields.trend?.name || ''
      },
      detailFields: getUnencodedFields()
    };
  }

  function applySettings (newState) {
    state = mergeState(newState);
    saveState();
    animateNext = 'local';
    update();
  }

  function openSettingsPanel () {
    KpiSettingsForm.build(settingsFormElement, getSettingsPayload(), {
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
      const url = new URL('kpi-settings.html', window.location.href).href;
      const result = await tableau.extensions.ui.displayDialogAsync(url, JSON.stringify(getSettingsPayload()), {
        width: 560,
        height: 800
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

  async function getSummaryRows () {
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

  async function getEncodings () {
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

  function updateFromTableau () {
    // Data changes can arrive faster than a refresh finishes; only the latest refresh is drawn
    let latestRefresh = 0;
    const refresh = async () => {
      const refreshId = ++latestRefresh;
      try {
        const [rows, encodings] = await Promise.all([getSummaryRows(), getEncodings()]);
        if (refreshId !== latestRefresh) return;
        fields = {
          value: encodings.value?.[0],
          target: encodings.target?.[0],
          attainment: encodings.attainment?.[0],
          changes: encodings.change || [],
          trend: encodings.trend?.[0]
        };
        rawRows = rows;
        animateNext = 'data';
        update();
      } catch (error) {
        if (refreshId === latestRefresh) showMessage(`Unable to load Tableau data: ${error.message || error}`);
      }
    };

    worksheet.addEventListener(tableau.TableauEventType.SummaryDataChanged, refresh);
    refresh();
  }

  // Sample year-to-date revenue by month, shown when the page is opened outside Tableau
  function renderPreview () {
    fields = {
      value: { name: 'Revenue YTD' },
      target: { name: 'Target YTD' },
      changes: [{ name: 'Revenue YoY %' }],
      trend: { name: 'Month' }
    };
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
    const revenue = [48.2, 51.0, 49.6, 55.3, 52.1, 56.8, 54.9, 58.6, 52.4];
    rawRows = months.map((month, index) => ({
      Month: { value: month },
      'Revenue YTD': { value: revenue[index] * 1e6 },
      'Target YTD': { value: 55.6e6 },
      'Revenue YoY %': { value: 0.078, formattedValue: '7.8%' },
      'Share of Year': { value: 0.75, formattedValue: '75.0%' }
    }));
    state.title = { ...state.title, text: 'Revenue, year to date' };
    state.icon = { name: 'coins' };
    state.aggregation = { ...state.aggregation, target: 'sum', change: 'last' };
    state.number = { format: 'currency', decimals: 1, units: 'millions', currencySymbol: '฿ ' };
    state.progress = { ...state.progress, markerField: 'Share of Year', caption: 'Target {target} · gap {gap}' };
    state.status = { ...state.status, basis: 'target' };
    previewSettingsButton.hidden = false;
    previewSettingsButton.addEventListener('click', openSettings);
    update();
  }

  // Another chart started animating; play along
  ChartSync.onPartnerStart(() => {
    if (!state.display.animate || !state.display.syncAnimation || !kpi?.value) return;
    animateNext = 'local';
    render();
  });

  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(render);
  });

  if (inTableau) {
    tableau.extensions.initializeAsync({ configure: openSettings })
      .then(() => {
        worksheet = tableau.extensions.worksheetContent?.worksheet;
        if (!worksheet) {
          showMessage('This page is not running inside a Tableau worksheet.');
          return;
        }
        loadState();
        updateFromTableau();
      })
      .catch(error => showMessage(`Unable to initialize the Tableau extension: ${error.message || error}`));
  } else {
    renderPreview();
  }
})();
