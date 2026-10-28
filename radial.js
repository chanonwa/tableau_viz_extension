'use strict';

(function () {
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
  const DEFAULT_STATE = {
    // 'donut' | 'pie' | 'radial' (one ring per member)
    chartType: 'donut',
    // Hole size, % of the outer radius (donut and radial bars)
    innerRadius: 60,
    // Degrees clockwise from 12 o'clock
    startAngle: 0,
    // Donut and pie: degrees the whole chart spans (360 = full circle, 180 = half donut)
    arc: 360,
    // Radial bars: angle of the longest bar
    sweep: 270,
    // 'clockwise' | 'counterclockwise'
    direction: 'clockwise',
    // Gap between slices or rings, px, drawn in gapColor ('' = the background color)
    gap: 2,
    gapColor: '',
    // Rounded slice corners and radial bar ends, px
    cornerRadius: 0,
    // How far a hovered or selected slice moves out, px
    explode: 6,
    // 'value-desc' | 'value-asc' | 'name' | 'data'
    sort: 'value-desc',
    // Show the largest N members and combine the rest into one slice (0 = all)
    topN: 0,
    otherLabel: 'Other',
    // Uses only rows where this field (e.g. a True/False date-range test on Detail) is True, the same as the
    // combo chart's Visible categories, so one parameter can drive both charts.
    visibility: { field: '' },
    palette: 'ocean',
    // member -> color
    colors: {},
    // Slice opacity, %
    opacity: 100,
    background: '#ffffff',
    title: { show: false, text: '', color: '#1d5fa8', fontSize: 17 },
    // content: 'total' | 'kpi' (first field on the Center encoding) | 'caption' (caption only)
    // The second Center field is shown under the caption as a comparison, green when positive and red when negative.
    center: {
      show: true,
      content: 'total',
      caption: 'Total',
      // Show the hovered slice's value, name, and percent in the center
      hoverDetail: true,
      // px; 0 = fit the hole
      valueSize: 0,
      valueColor: '#202124',
      captionColor: '#5f6368',
      showComparison: true,
      upColor: '#1e8e3e',
      downColor: '#d93025'
    },
    // content: 'percent' | 'value' | 'both' | 'name' | 'name-percent'; position: 'outside' | 'inside'
    // colorMode: 'auto' (gray outside, contrasting inside) | 'slice' (the slice color, outside only) | 'custom'
    labels: {
      show: true,
      content: 'percent',
      position: 'outside',
      minPercent: 3,
      fontSize: 12,
      bold: true,
      colorMode: 'auto',
      color: '#5f6368',
      leaderLines: false,
      distance: 8
    },
    // position: 'bottom' | 'top' | 'right' | 'left' | 'none'
    legend: { position: 'bottom', showPercent: true, showValue: true, fontSize: 13, header: false, totalRow: false },
    // format: 'auto' (Tableau's own format) | 'number' | 'currency' | 'percent'
    // units: 'none' | 'auto' | 'thousands' | 'millions' | 'billions'
    number: { format: 'auto', decimals: 1, units: 'none', currencySymbol: '฿ ' },
    percentDecimals: 0,
    // style: 'extension' (lists value, percent, and Tooltip fields) | 'tableau' (Tableau's own tooltip)
    tooltip: { style: 'extension', showPercent: true },
    // hoverEffect: 'dim' | 'explode' | 'both' | 'none'
    // select: clicking a slice or legend row selects its marks in Tableau, for dashboard actions
    display: { tooltips: true, hoverEffect: 'both', select: true, track: true, animate: true }
  };
  const SETTINGS_KEY = 'radialChartState';
  const UNITS = { thousands: [1e3, 'K'], millions: [1e6, 'M'], billions: [1e9, 'B'] };
  const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  const compactFormat = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  const inTableau = Boolean(window.tableau?.extensions) && window.parent !== window;

  const titleElement = document.getElementById('title');
  const layoutElement = document.getElementById('layout');
  const chartElement = document.getElementById('chart');
  const legendElement = document.getElementById('legend');
  const messageElement = document.getElementById('message');
  const tooltipElement = document.getElementById('tooltip');
  const settingsOverlay = document.getElementById('settings-overlay');
  const settingsFormElement = document.getElementById('settings-form');
  const previewSettingsButton = document.getElementById('preview-settings');

  let worksheet = null;
  let rawRows = [];
  // Row -> its mark's tuple id, for selecting and hovering marks in Tableau
  let rowTuples = new WeakMap();
  let categoryField;
  let valueField;
  let centerFields = [];
  // Slices in display order: { name, value, label, percent, color, isOther, tupleIds, extras: [[name, text]] }
  let items = [];
  let total = 0;
  let skipped = 0;
  // Center KPI and comparison: { value, label } or null
  let centerKpi = null;
  let centerComparison = null;
  let hoverIndex = null;
  // Names of the members selected by clicking
  const selected = new Set();
  // The next render animates the slices in (after new data, not after a hover or resize)
  let animateNext = true;
  // Updates the center text for the hovered slice (null clears)
  let setCenterDetail = () => {};
  let lastHoverCall = 0;
  let state = mergeState({});

  function mergeState (saved) {
    const merged = { ...DEFAULT_STATE, ...saved, colors: { ...saved.colors } };
    for (const key of ['visibility', 'title', 'center', 'labels', 'legend', 'number', 'tooltip', 'display']) {
      merged[key] = { ...DEFAULT_STATE[key], ...saved[key] };
    }
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
    hideTooltip();
    chartElement.replaceChildren(messageElement);
    legendElement.replaceChildren();
    messageElement.textContent = message;
    messageElement.hidden = false;
  }

  // Formatting

  // tableauLabel is the field's own formatted value, used by the Automatic format when there is one
  function formatValue (value, tableauLabel, compact) {
    const options = state.number;
    if (options.format === 'auto') {
      if (tableauLabel) return tableauLabel;
      return compact && Math.abs(value) >= 1e4 ? compactFormat.format(value) : numberFormat.format(value);
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

  function formatPercent (share) {
    return `${new Intl.NumberFormat(undefined, {
      minimumFractionDigits: state.percentDecimals,
      maximumFractionDigits: state.percentDecimals
    }).format(share * 100)}%`;
  }

  function getLabelText (item) {
    const percent = formatPercent(item.percent);
    const value = formatValue(item.value, item.label);
    switch (state.labels.content) {
      case 'value': return value;
      case 'both': return `${percent} · ${value}`;
      case 'name': return item.name;
      case 'name-percent': return `${item.name} ${percent}`;
      default: return percent;
    }
  }

  // Dark text on light fills, white text on dark fills
  function getContrastColor (hex) {
    const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!match) return '#202124';
    const [r, g, b] = match.slice(1).map(part => parseInt(part, 16) / 255);
    return 0.299 * r + 0.587 * g + 0.114 * b > 0.6 ? '#202124' : '#ffffff';
  }

  // Data

  // Columns that aren't on an encoding, i.e. fields on Tooltip or Detail
  function getUnencodedFields () {
    if (rawRows.length === 0) return [];
    const used = new Set([categoryField?.name, valueField?.name, ...centerFields.map(field => field.name)]);
    return Object.keys(rawRows[0]).filter(name => !used.has(name));
  }

  // Fields listed in the tooltip: the unencoded ones, apart from the visibility field
  function getExtraFields () {
    return getUnencodedFields().filter(name => name !== state.visibility.field);
  }

  function isTrue (dataValue) {
    const value = getValue(dataValue);
    return value === true || String(value).toLowerCase() === 'true' || getLabel(dataValue).toLowerCase() === 'true';
  }

  // Rows where the visibility field is True, or every row when none is chosen
  function getVisibleRows () {
    const fieldName = state.visibility.field;
    if (!fieldName || rawRows.length === 0 || !(fieldName in rawRows[0])) return rawRows;
    return rawRows.filter(row => isTrue(row[fieldName]));
  }

  // Combines several rows' values of one tooltip field: numbers add up, text lists the distinct values
  function combineExtra (cells) {
    if (cells.length === 1) return getLabel(cells[0]);
    const numbers = cells.map(getNumber);
    if (numbers.every(number => number !== null)) return numberFormat.format(numbers.reduce((sum, number) => sum + number, 0));
    const texts = [...new Set(cells.map(getLabel))];
    return texts.length <= 3 ? texts.join(', ') : `${texts.length} values`;
  }

  // A Center field arrives once per member row. A value repeated on every row (TOTAL(), WINDOW_SUM(), or a FIXED
  // calculation) is used as it is; otherwise the rows are added up.
  function getCenterValue (field, rows) {
    if (!field) return null;
    const cells = rows.map(row => row[field.name]).filter(cell => getNumber(cell) !== null);
    if (cells.length === 0) return null;
    const numbers = cells.map(getNumber);
    if (numbers.every(number => number === numbers[0])) return { value: numbers[0], label: getLabel(cells[0]) };
    return { value: numbers.reduce((sum, number) => sum + number, 0), label: '' };
  }

  // Fields on Detail split a member into several rows; combine them into one item per member.
  function buildItems () {
    items = [];
    total = 0;
    skipped = 0;
    const visibleRows = getVisibleRows();
    centerKpi = getCenterValue(centerFields[0], visibleRows);
    centerComparison = getCenterValue(centerFields[1], visibleRows);
    if (!categoryField || !valueField) return;

    const extraFields = getExtraFields();
    const groups = new Map();
    for (const row of visibleRows) {
      const name = getLabel(row[categoryField.name]);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(row);
    }

    let members = [];
    for (const [name, rows] of groups) {
      const numbers = rows.map(row => getNumber(row[valueField.name])).filter(number => number !== null);
      if (numbers.length === 0) continue;
      const value = numbers.reduce((sum, number) => sum + number, 0);
      // Slices can't show negative or zero values
      if (!(value > 0)) {
        skipped++;
        continue;
      }
      members.push({
        name,
        value,
        label: rows.length === 1 ? getLabel(rows[0][valueField.name]) : '',
        extras: extraFields.map(field => [field, combineExtra(rows.map(row => row[field]))]),
        tupleIds: rows.map(row => rowTuples.get(row)).filter(Boolean),
        order: members.length
      });
    }

    const sorters = {
      'value-desc': (a, b) => b.value - a.value,
      'value-asc': (a, b) => a.value - b.value,
      name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
      data: (a, b) => a.order - b.order
    };
    members.sort(sorters[state.sort] || sorters['value-desc']);

    if (state.topN > 0 && members.length > state.topN + 1) {
      // The largest members stay, whatever the sort; the rest become one slice at the end
      const largest = new Set([...members].sort(sorters['value-desc']).slice(0, state.topN));
      const rest = members.filter(member => !largest.has(member));
      members = members.filter(member => largest.has(member));
      members.push({
        name: state.otherLabel || 'Other',
        value: rest.reduce((sum, member) => sum + member.value, 0),
        label: '',
        extras: [['Includes', rest.length <= 5 ? rest.map(member => member.name).join(', ') : `${rest.length} members`]],
        tupleIds: rest.flatMap(member => member.tupleIds),
        isOther: true
      });
    }

    total = members.reduce((sum, member) => sum + member.value, 0);
    items = members.map((member, index) => ({
      ...member,
      percent: member.value / total,
      color: RadialSettingsForm.colorFor(state, member.name, index, member.isOther)
    }));
    for (const name of [...selected]) {
      if (!items.some(item => item.name === name)) selected.delete(name);
    }
  }

  // Tooltip

  function hideTooltip () {
    tooltipElement.hidden = true;
  }

  function showTooltip (event, item) {
    const title = createElement('div', 'tooltip-title');
    const swatch = createElement('span', 'legend-dot');
    swatch.style.background = item.color;
    title.append(swatch, item.name);
    const lines = [[valueField.name, formatValue(item.value, item.label)]];
    if (state.tooltip.showPercent) lines.push(['% of total', formatPercent(item.percent)]);
    const rows = [...lines, ...item.extras].map(([name, value]) => {
      const row = createElement('div', 'tooltip-row');
      row.append(createElement('span', 'tooltip-name', name), createElement('span', 'tooltip-value', value));
      return row;
    });
    tooltipElement.replaceChildren(title, ...rows);
    tooltipElement.hidden = false;

    let left = event.clientX + 14;
    let top = event.clientY + 14;
    if (left + tooltipElement.offsetWidth > window.innerWidth) left = event.clientX - tooltipElement.offsetWidth - 14;
    if (top + tooltipElement.offsetHeight > window.innerHeight) top = window.innerHeight - tooltipElement.offsetHeight - 4;
    tooltipElement.style.left = `${Math.max(0, left)}px`;
    tooltipElement.style.top = `${Math.max(0, top)}px`;
  }

  // Tableau's own tooltip works for a member drawn from a single mark; others use the extension's tooltip.
  function useTableauTooltip (item) {
    return inTableau && state.tooltip.style === 'tableau' && item.tupleIds.length === 1;
  }

  function hoverInTableau (tupleId, event) {
    if (!worksheet?.hoverTupleAsync) return;
    const context = event ? { tooltipAnchorPoint: { x: event.clientX, y: event.clientY }, shouldShowTooltip: true } : undefined;
    worksheet.hoverTupleAsync(tupleId, context).catch(error => console.warn('Unable to hover the mark', error));
  }

  // Hover and selection

  function getSliceOffset (node) {
    const index = Number(node.dataset.index);
    const active = (hoverIndex === index && ['explode', 'both'].includes(state.display.hoverEffect)) ||
      selected.has(items[index]?.name);
    if (!active || !node.dataset.angle) return '';
    const angle = Number(node.dataset.angle);
    return `translate(${(Math.sin(angle) * state.explode).toFixed(1)}px, ${(-Math.cos(angle) * state.explode).toFixed(1)}px)`;
  }

  // Dims and moves out slices and legend rows for the hovered and selected members
  function applyEmphasis () {
    const dimOnHover = hoverIndex !== null && ['dim', 'both'].includes(state.display.hoverEffect);
    for (const node of document.querySelectorAll('[data-index]')) {
      const index = Number(node.dataset.index);
      const name = items[index]?.name;
      const dimmed = (dimOnHover && index !== hoverIndex) || (selected.size > 0 && !selected.has(name) && index !== hoverIndex);
      node.classList.toggle('dimmed', dimmed);
      node.classList.toggle('selected', selected.has(name));
      if (node.classList.contains('slice')) node.style.transform = getSliceOffset(node);
    }
  }

  function setHover (index, event) {
    hoverIndex = index;
    applyEmphasis();
    setCenterDetail(index === null ? null : items[index]);
    if (index === null) {
      hideTooltip();
      if (inTableau && state.tooltip.style === 'tableau') hoverInTableau(0);
    }
  }

  function moveHover (index, event) {
    const item = items[index];
    if (!state.display.tooltips) return;
    if (useTableauTooltip(item)) {
      // Tableau's tooltip follows the pointer; limit how often it is asked to move
      if (event.timeStamp - lastHoverCall > 120) {
        lastHoverCall = event.timeStamp;
        hoverInTableau(item.tupleIds[0], event);
      }
    } else {
      showTooltip(event, item);
    }
  }

  // Click selects the member's marks in Tableau; Ctrl/Cmd+click adds to or removes from the selection
  function toggleSelect (index, event) {
    if (!state.display.select) return;
    event.stopPropagation();
    const name = items[index].name;
    const additive = event.ctrlKey || event.metaKey;
    if (additive) {
      if (selected.has(name)) selected.delete(name);
      else selected.add(name);
    } else if (selected.size === 1 && selected.has(name)) {
      selected.clear();
    } else {
      selected.clear();
      selected.add(name);
    }
    applyEmphasis();
    selectInTableau();
  }

  function clearSelection () {
    if (selected.size === 0) return;
    selected.clear();
    applyEmphasis();
    selectInTableau();
  }

  function selectInTableau () {
    if (!worksheet?.selectTuplesAsync) return;
    const tupleIds = items.filter(item => selected.has(item.name)).flatMap(item => item.tupleIds);
    worksheet.selectTuplesAsync(tupleIds, tableau.SelectOptions.Simple)
      .catch(error => console.warn('Unable to select marks in Tableau', error));
  }

  function addInteractions (node, index) {
    node.dataset.index = index;
    node.addEventListener('mouseenter', event => setHover(index, event));
    node.addEventListener('mousemove', event => moveHover(index, event));
    node.addEventListener('mouseleave', () => setHover(null));
    node.addEventListener('click', event => toggleSelect(index, event));
    if (state.display.select) node.classList.add('clickable');
  }

  // Geometry: angles are radians clockwise from 12 o'clock

  function pointAt (cx, cy, radius, angle) {
    return [cx + radius * Math.sin(angle), cy - radius * Math.cos(angle)];
  }

  function arcPath (cx, cy, outer, inner, start, end) {
    // A full circle can't be drawn as one arc
    const stop = Math.min(end, start + Math.PI * 2 - 1e-4);
    const large = stop - start > Math.PI ? 1 : 0;
    const [x0, y0] = pointAt(cx, cy, outer, start);
    const [x1, y1] = pointAt(cx, cy, outer, stop);
    const outerArc = `M${x0},${y0}A${outer},${outer} 0 ${large} 1 ${x1},${y1}`;
    if (inner <= 0) return `${outerArc}L${cx},${cy}Z`;
    const [x2, y2] = pointAt(cx, cy, inner, stop);
    const [x3, y3] = pointAt(cx, cy, inner, start);
    return `${outerArc}L${x2},${y2}A${inner},${inner} 0 ${large} 0 ${x3},${y3}Z`;
  }

  // A slice as a path. Rounded corners are drawn by shrinking the shape and stroking it in its own color with
  // round joins; gaps are drawn as a stroke in the gap color.
  function slicePath (cx, cy, outer, inner, start, end, color, gap = state.gap) {
    const corner = Math.min(state.cornerRadius, (outer - inner) / 2 - 0.5);
    if (corner <= 0) {
      return createSvgElement('path', {
        d: arcPath(cx, cy, outer, inner, start, end),
        fill: color,
        stroke: state.gapColor || state.background,
        'stroke-width': gap,
        'stroke-linejoin': 'round'
      });
    }
    const inset = corner + gap / 2;
    const middle = Math.max(1, (outer + inner) / 2);
    const angleInset = Math.min(inset / middle, (end - start) / 2 - 1e-3);
    return createSvgElement('path', {
      d: arcPath(cx, cy, outer - corner, inner > 0 ? inner + corner : Math.min(corner, outer / 3), start + angleInset, end - angleInset),
      fill: color,
      stroke: color,
      'stroke-width': corner * 2,
      'stroke-linejoin': 'round'
    });
  }

  // Center and radius that fit an arc from start to start + span in the box, leaving pad around it
  function fitArc (width, height, padX, padY, start, span, innerRatio) {
    const points = [[0, 0]];
    const steps = Math.max(2, Math.ceil(span / (Math.PI / 90)));
    for (let step = 0; step <= steps; step++) {
      const angle = start + span * step / steps;
      points.push([Math.sin(angle), -Math.cos(angle)]);
      if (innerRatio > 0) points.push([Math.sin(angle) * innerRatio, -Math.cos(angle) * innerRatio]);
    }
    // The center only bounds a pie or a ring that isn't closed
    if (innerRatio > 0 && span >= Math.PI * 2 - 1e-6) points.shift();
    const xs = points.map(point => point[0]);
    const ys = points.map(point => point[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const outer = Math.max(10, Math.min((width - 2 * padX) / (maxX - minX || 1), (height - 2 * padY) / (maxY - minY || 1)));
    return { outer, cx: width / 2 - (minX + maxX) / 2 * outer, cy: height / 2 - (minY + maxY) / 2 * outer };
  }

  function addText (parent, className, x, y, text, attributes) {
    const node = createSvgElement('text', { class: className, x, y, 'dominant-baseline': 'central', ...attributes });
    node.textContent = text;
    parent.appendChild(node);
    return node;
  }

  function fitFont (text, room, largest) {
    return Math.max(9, Math.min(largest, room / (0.6 * Math.max(3, text.length))));
  }

  // Total or KPI, caption, and comparison in the hole; the hovered slice replaces them while hovered
  function drawCenter (svg, cx, cy, inner) {
    setCenterDetail = () => {};
    const center = state.center;
    if (!center.show || inner < 24) return;
    const room = inner * 1.6;
    const kpi = center.content === 'kpi' ? centerKpi : null;
    const mainText = center.content === 'caption' ? '' : kpi ? formatValue(kpi.value, kpi.label, true) : formatValue(total, '', true);
    const valueSize = center.valueSize > 0 ? center.valueSize : fitFont(mainText || 'Total', room, inner * 0.36);
    const captionSize = Math.max(10, valueSize * 0.42);

    let comparisonText = '';
    let comparisonColor = center.upColor;
    if (center.showComparison && centerComparison) {
      const { value, label } = centerComparison;
      const text = label || formatValue(value, '', true);
      comparisonColor = value < 0 ? center.downColor : center.upColor;
      comparisonText = /^[▲▼+\-−]/.test(text.trim()) ? text : `${value < 0 ? '▼' : '▲'} ${text}`;
    }

    const lines = [];
    if (mainText) lines.push({ className: 'center-value', text: mainText, size: valueSize, color: center.valueColor });
    if (center.caption) lines.push({ className: 'center-caption', text: center.caption, size: Math.min(captionSize, fitFont(center.caption, room, captionSize)), color: center.captionColor });
    if (comparisonText) lines.push({ className: 'center-comparison', text: comparisonText, size: captionSize, color: comparisonColor });
    if (lines.length === 0) return;

    const group = createSvgElement('g', { class: 'center' });
    const nodes = [];
    const layout = list => {
      const height = list.reduce((sum, line) => sum + line.size * 1.15, 0);
      let y = cy - height / 2;
      group.replaceChildren();
      nodes.length = 0;
      for (const line of list) {
        const node = addText(group, line.className, cx, y + line.size * 0.575, line.text, {
          'text-anchor': 'middle', 'font-size': line.size.toFixed(1), fill: line.color
        });
        nodes.push(node);
        y += line.size * 1.15;
      }
    };
    layout(lines);
    svg.appendChild(group);

    if (center.hoverDetail) {
      setCenterDetail = item => {
        if (!item) {
          layout(lines);
          return;
        }
        const value = formatValue(item.value, item.label, true);
        const caption = `${item.name} · ${formatPercent(item.percent)}`;
        layout([
          { className: 'center-value', text: value, size: Math.min(valueSize, fitFont(value, room, valueSize)), color: center.valueColor },
          { className: 'center-caption', text: caption, size: Math.min(captionSize, fitFont(caption, room, captionSize)), color: item.color }
        ]);
      };
    }
  }

  function getLabelColor (item, outside) {
    const labels = state.labels;
    if (labels.colorMode === 'custom') return labels.color;
    if (labels.colorMode === 'slice' && outside) return item.color;
    return outside ? '#5f6368' : getContrastColor(item.color);
  }

  // Angles of each slice, honoring the arc and direction: [{ start, end, middle }] with start < end
  function getSliceAngles (span) {
    const sign = state.direction === 'counterclockwise' ? -1 : 1;
    const origin = state.startAngle * Math.PI / 180;
    let cumulative = 0;
    return items.map(item => {
      const a = origin + sign * cumulative;
      cumulative += item.percent * span;
      const b = origin + sign * cumulative;
      return { start: Math.min(a, b), end: Math.max(a, b), middle: (a + b) / 2 };
    });
  }

  function drawPie (svg, slices, labelLayer, width, height) {
    const labels = state.labels;
    const fontSize = labels.fontSize;
    const outside = labels.show && labels.position === 'outside';
    const texts = items.map(item => labels.show && item.percent * 100 >= labels.minPercent ? getLabelText(item) : '');
    const longest = Math.max(0, ...texts.map(text => text.length));
    const room = labels.distance + (labels.leaderLines ? 10 : 0);
    const padX = outside && longest > 0 ? longest * fontSize * 0.6 + room + 6 : state.explode + 2;
    const padY = outside && longest > 0 ? fontSize + room + 4 : state.explode + 2;
    const span = Math.max(30, Math.min(360, state.arc)) * Math.PI / 180;
    const innerRatio = state.chartType === 'pie' ? 0 : state.innerRadius / 100;
    const angles = getSliceAngles(span);
    const sign = state.direction === 'counterclockwise' ? -1 : 1;
    const origin = state.startAngle * Math.PI / 180;
    const { outer, cx, cy } = fitArc(width, height, padX, padY, Math.min(origin, origin + sign * span), span, innerRatio);
    const inner = outer * innerRatio;

    items.forEach((item, index) => {
      const { start, end, middle } = angles[index];
      const slice = slicePath(cx, cy, outer, inner, start, end, item.color);
      slice.classList.add('slice');
      slice.setAttribute('fill-opacity', state.opacity / 100);
      slice.dataset.angle = middle;
      addInteractions(slice, index);
      slices.appendChild(slice);

      if (!texts[index]) return;
      const color = getLabelColor(item, outside);
      const weight = labels.bold ? 600 : 400;
      if (outside) {
        const labelRadius = outer + labels.distance + (labels.leaderLines ? 10 : 0) + fontSize * 0.4;
        if (labels.leaderLines) {
          const [x1, y1] = pointAt(cx, cy, outer + 2, middle);
          const [x2, y2] = pointAt(cx, cy, labelRadius - fontSize * 0.4 - 2, middle);
          labelLayer.appendChild(createSvgElement('line', { class: 'leader-line', x1, y1, x2, y2, stroke: item.color }));
        }
        const [x, y] = pointAt(cx, cy, labelRadius, middle);
        const side = Math.sin(middle);
        const label = addText(labelLayer, 'slice-label', x, y, texts[index], {
          'text-anchor': side > 0.2 ? 'start' : side < -0.2 ? 'end' : 'middle',
          'font-size': fontSize,
          'font-weight': weight,
          fill: color
        });
        label.dataset.index = index;
      } else {
        const [x, y] = pointAt(cx, cy, inner > 0 ? (outer + inner) / 2 : outer * 0.62, middle);
        const label = addText(labelLayer, 'slice-label', x, y, texts[index], {
          'text-anchor': 'middle', 'font-size': fontSize, 'font-weight': weight, fill: color, 'pointer-events': 'none'
        });
        label.dataset.index = index;
      }
    });

    const textY = state.arc <= 200 ? cy - inner * 0.3 : cy;
    if (inner > 0) drawCenter(labelLayer, cx, textY, inner);
    return { cx, cy, outer, start: origin, sign };
  }

  // One ring per member, outermost first; the longest bar spans the chosen angle
  function drawRadial (svg, slices, labelLayer, width, height) {
    const outer = Math.max(10, Math.min(width, height) / 2 - 4);
    const inner = outer * state.innerRadius / 100;
    const cx = width / 2;
    const cy = height / 2;
    const band = (outer - inner) / items.length;
    const thickness = Math.max(1, band - state.gap);
    const sign = state.direction === 'counterclockwise' ? -1 : 1;
    const origin = state.startAngle * Math.PI / 180;
    const sweep = state.sweep * Math.PI / 180;
    const max = Math.max(...items.map(item => item.value));
    const labels = state.labels;
    const fontSize = Math.min(labels.fontSize, thickness * 0.85);

    items.forEach((item, index) => {
      const ringOuter = outer - index * band;
      const ringInner = ringOuter - thickness;
      const end = origin + sign * item.value / max * sweep;
      if (state.display.track) {
        const trackEnd = origin + sign * sweep;
        // Rings are already separated by their band, so they need no gap stroke
        const track = slicePath(cx, cy, ringOuter, ringInner, Math.min(origin, trackEnd), Math.max(origin, trackEnd), '#f1f3f4', 0);
        track.classList.add('track');
        slices.appendChild(track);
      }
      const bar = slicePath(cx, cy, ringOuter, ringInner, Math.min(origin, end), Math.max(origin, end), item.color, 0);
      bar.classList.add('slice');
      bar.setAttribute('fill-opacity', state.opacity / 100);
      addInteractions(bar, index);
      slices.appendChild(bar);

      // Name and label sit just before the start of the ring
      if (fontSize >= 7) {
        const [x, y] = pointAt(cx, cy, (ringOuter + ringInner) / 2, origin);
        const text = labels.show && item.percent * 100 >= labels.minPercent && !labels.content.startsWith('name')
          ? `${item.name}  ${getLabelText(item)}`
          : item.name;
        const label = addText(labelLayer, 'ring-label', x - sign * 6, y, text, {
          'text-anchor': sign > 0 ? 'end' : 'start',
          'font-size': fontSize.toFixed(1),
          'font-weight': labels.bold ? 600 : 400,
          fill: labels.colorMode === 'custom' ? labels.color : labels.colorMode === 'slice' ? item.color : '#3c4043'
        });
        label.dataset.index = index;
      }
    });

    drawCenter(labelLayer, cx, cy, inner);
    return { cx, cy, outer, start: origin, sign };
  }

  // Sweeps the slices in from the start angle with a masked circle
  function addReveal (svg, slices, geometry) {
    const { cx, cy, outer, start, sign } = geometry;
    const radius = outer / 2 + 10;
    const defs = createSvgElement('defs');
    const mask = createSvgElement('mask', { id: 'reveal-mask', maskUnits: 'userSpaceOnUse' });
    const circle = createSvgElement('circle', {
      class: sign > 0 ? 'reveal' : 'reveal reverse',
      cx,
      cy,
      r: radius,
      fill: 'none',
      stroke: '#fff',
      'stroke-width': outer + 20 + state.explode * 2,
      pathLength: 100,
      'stroke-dasharray': '100 100',
      transform: `rotate(${(start * 180 / Math.PI - 90).toFixed(2)} ${cx} ${cy})`
    });
    mask.appendChild(circle);
    defs.appendChild(mask);
    svg.insertBefore(defs, svg.firstChild);
    slices.setAttribute('mask', 'url(#reveal-mask)');
  }

  function renderLegend () {
    const legend = state.legend;
    legendElement.hidden = legend.position === 'none';
    if (legendElement.hidden) return;
    const columns = ['auto', 'minmax(0, 1fr)'];
    if (legend.showPercent) columns.push('auto');
    if (legend.showValue) columns.push('auto');
    legendElement.style.gridTemplateColumns = columns.join(' ');
    legendElement.style.fontSize = `${legend.fontSize}px`;

    const makeRow = (className, cells) => {
      const row = createElement('div', className);
      row.append(...cells);
      return row;
    };
    const rows = [];
    if (legend.header) {
      const cells = [createElement('span'), createElement('span', 'legend-name', categoryField.name)];
      if (legend.showPercent) cells.push(createElement('span', 'legend-number', '%'));
      if (legend.showValue) cells.push(createElement('span', 'legend-number', valueField.name));
      rows.push(makeRow('legend-row legend-head', cells));
    }
    items.forEach((item, index) => {
      const dot = createElement('span', 'legend-dot');
      dot.style.background = item.color;
      const cells = [dot, createElement('span', 'legend-name', item.name)];
      if (legend.showPercent) cells.push(createElement('span', 'legend-number', formatPercent(item.percent)));
      if (legend.showValue) cells.push(createElement('span', 'legend-number', formatValue(item.value, item.label)));
      const row = makeRow('legend-row', cells);
      addInteractions(row, index);
      rows.push(row);
    });
    if (legend.totalRow) {
      const cells = [createElement('span'), createElement('span', 'legend-name', 'Total')];
      if (legend.showPercent) cells.push(createElement('span', 'legend-number', formatPercent(1)));
      if (legend.showValue) cells.push(createElement('span', 'legend-number', formatValue(total, '')));
      rows.push(makeRow('legend-row legend-total', cells));
    }
    legendElement.replaceChildren(...rows);
  }

  function render () {
    hideTooltip();
    hoverIndex = null;
    document.body.style.background = state.background;
    titleElement.hidden = !state.title.show || !state.title.text;
    titleElement.textContent = state.title.text;
    titleElement.style.color = state.title.color;
    titleElement.style.fontSize = `${state.title.fontSize}px`;

    if (!categoryField || !valueField) {
      showMessage('Add a dimension to Category and a measure to Value.');
      return;
    }
    if (items.length === 0) {
      showMessage(skipped > 0
        ? 'Every value is zero or negative, so there is nothing to draw.'
        : state.visibility.field ? `No rows where ${state.visibility.field} is True.` : 'No data to show.');
      return;
    }
    messageElement.hidden = true;

    // A legend at the side needs room; narrow sheets put it below
    const position = state.legend.position;
    const side = (position === 'right' || position === 'left') && layoutElement.clientWidth < 420 ? 'bottom' : position;
    layoutElement.className = `legend-${side}`;
    renderLegend();

    const width = chartElement.clientWidth;
    const height = chartElement.clientHeight;
    if (width < 40 || height < 40) {
      chartElement.replaceChildren(messageElement);
      return;
    }
    const svg = createSvgElement('svg', {
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': `${valueField.name} by ${categoryField.name}`
    });
    const slices = createSvgElement('g', { class: 'slices' });
    const labelLayer = createSvgElement('g', { class: animateNext && state.display.animate ? 'labels fade-in' : 'labels' });
    svg.append(slices, labelLayer);
    const geometry = state.chartType === 'radial'
      ? drawRadial(svg, slices, labelLayer, width, height)
      : drawPie(svg, slices, labelLayer, width, height);
    if (animateNext && state.display.animate) addReveal(svg, slices, geometry);
    animateNext = false;

    if (skipped > 0) {
      const note = addText(svg, 'center-caption', 2, height - 8, `${skipped} zero or negative ${skipped === 1 ? 'value' : 'values'} not shown`, {
        'font-size': 10
      });
      note.removeAttribute('dominant-baseline');
    }
    // Clicking empty space clears the selection
    svg.addEventListener('click', clearSelection);
    chartElement.replaceChildren(messageElement, svg);
    applyEmphasis();
  }

  function update () {
    buildItems();
    render();
  }

  // Settings: the Tableau "Format Extension" dialog (Marks card), or an in-page panel as a fallback.

  function getSettingsPayload () {
    return {
      state,
      defaultState: mergeState({}),
      members: items.map(item => ({ name: item.name, isOther: Boolean(item.isOther) })),
      centerFields: centerFields.map(field => field.name),
      visibilityCandidates: getUnencodedFields()
    };
  }

  function applySettings (newState) {
    state = mergeState(newState);
    saveState();
    animateNext = true;
    update();
  }

  function openSettingsPanel () {
    RadialSettingsForm.build(settingsFormElement, getSettingsPayload(), {
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
      const url = new URL('radial-settings.html', window.location.href).href;
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
    return page.data.map((values, rowIndex) => {
      const row = {};
      page.columns.forEach(column => {
        row[column.fieldName] = values[column.index];
      });
      const tupleId = page.marksInfo?.[rowIndex]?.tupleId;
      if (tupleId) rowTuples.set(row, tupleId);
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
    const refresh = async () => {
      try {
        rowTuples = new WeakMap();
        const [rows, encodings] = await Promise.all([getSummaryRows(), getEncodings()]);
        categoryField = encodings.category?.[0];
        valueField = encodings.value?.[0];
        centerFields = encodings.center || [];
        rawRows = rows;
        animateNext = true;
        update();
      } catch (error) {
        showMessage(`Unable to load Tableau data: ${error.message || error}`);
      }
    };

    worksheet.addEventListener(tableau.TableauEventType.SummaryDataChanged, refresh);
    refresh();
  }

  // Sample revenue mix, shown when the page is opened outside Tableau
  function renderPreview () {
    categoryField = { name: 'Product' };
    valueField = { name: 'Revenue' };
    centerFields = [];
    rawRows = [
      ['Gold Wallet', 61.4e6, 182340],
      ['Mutual Fund', 47.5e6, 96410],
      ['Global Savings', 35.6e6, 64120],
      ['KTX', 29.7e6, 31870],
      ['Corporate Bond', 23.8e6, 8240]
    ].map(([product, revenue, accounts]) => ({
      Product: { value: product },
      Revenue: { value: revenue },
      Accounts: { value: accounts, formattedValue: numberFormat.format(accounts) }
    }));
    state.title = { ...state.title, show: true, text: 'Revenue Mix (YTD 2026)' };
    state.number = { format: 'currency', decimals: 1, units: 'millions', currencySymbol: '฿ ' };
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
