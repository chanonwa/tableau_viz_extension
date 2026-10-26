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
  const chartElement = document.getElementById('chart');
  const messageElement = document.getElementById('message');
  const seriesListElement = document.getElementById('series-list');

  let chartRows = [];
  let categoryField;
  let measureFields = [];
  const seriesModes = new Map();
  const lineStyles = new Map();

  function showMessage (message) {
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

  function getNumericValue (row, field) {
    const value = getValue(row[field.name]);
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function getSeriesMode (field, index) {
    if (!seriesModes.has(field.name)) {
      seriesModes.set(field.name, index === 0 ? 'bar' : 'line');
    }
    return seriesModes.get(field.name);
  }

  function renderControls () {
    seriesListElement.replaceChildren();

    measureFields.forEach((field, index) => {
      const mode = getSeriesMode(field, index);
      if (!lineStyles.has(field.name)) lineStyles.set(field.name, 'solid');
      const lineStyle = lineStyles.get(field.name);
      const control = document.createElement('div');
      control.className = 'series-control-wrap';

      const button = document.createElement('button');
      button.className = 'series-control';
      button.type = 'button';
      button.setAttribute('aria-label', `${field.name}: ${mode}. Change chart type`);

      const swatch = document.createElement('span');
      swatch.setAttribute('aria-hidden', 'true');
      swatch.style.width = '10px';
      swatch.style.height = '10px';
      swatch.style.flex = '0 0 auto';
      swatch.style.borderRadius = mode === 'line' ? '50%' : '2px';
      swatch.style.backgroundColor = COLORS[index % COLORS.length];

      const name = document.createElement('span');
      name.className = 'series-name';
      name.textContent = field.name;

      const modeLabel = document.createElement('span');
      modeLabel.className = 'series-mode';
      modeLabel.textContent = mode;

      button.append(swatch, name, modeLabel);
      button.addEventListener('click', () => {
        seriesModes.set(field.name, mode === 'bar' ? 'line' : 'bar');
        render();
      });

      const styleSelect = document.createElement('select');
      styleSelect.className = 'line-style';
      styleSelect.setAttribute('aria-label', `${field.name} line style`);
      styleSelect.disabled = mode !== 'line';
      for (const style of Object.keys(LINE_STYLES)) {
        const option = document.createElement('option');
        option.value = style;
        option.textContent = style === 'dash-dot'
          ? 'Dash-dot'
          : style.charAt(0).toUpperCase() + style.slice(1);
        styleSelect.appendChild(option);
      }
      styleSelect.value = lineStyle;
      styleSelect.addEventListener('change', () => {
        lineStyles.set(field.name, styleSelect.value);
        render();
      });

      control.append(button, styleSelect);
      seriesListElement.appendChild(control);
    });
  }

  function render () {
    renderControls();

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

    const categories = chartRows.map(row => getLabel(row[categoryField.name]));
    const values = chartRows.flatMap(row =>
      measureFields.map(field => getNumericValue(row, field)).filter(value => value !== null)
    );
    if (values.length === 0) {
      showMessage('The selected measures do not contain numeric values.');
      return;
    }

    hideMessage();
    chartElement.querySelector('svg')?.remove();

    const width = Math.max(320, chartElement.clientWidth - 16);
    const height = Math.max(220, chartElement.clientHeight - 8);
    const margin = { top: 16, right: 18, bottom: 64, left: 64 };
    const plotWidth = Math.max(1, width - margin.left - margin.right);
    const plotHeight = Math.max(1, height - margin.top - margin.bottom);
    const minValue = Math.min(0, ...values);
    const maxValue = Math.max(0, ...values);
    const range = maxValue - minValue;
    const padding = range === 0 ? Math.max(1, Math.abs(maxValue) * 0.1) : range * 0.08;
    const domainMin = minValue < 0 ? minValue - padding : 0;
    const domainMax = maxValue > 0 ? maxValue + padding : 0;
    const adjustedMax = domainMax === domainMin ? domainMin + 1 : domainMax;
    const y = value => margin.top + (adjustedMax - value) / (adjustedMax - domainMin) * plotHeight;
    const zeroY = y(0);
    const groupWidth = plotWidth / categories.length;
    const xCenter = index => margin.left + groupWidth * (index + 0.5);
    const svg = createSvgElement('svg', {
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': 'Combo chart of multiple measures'
    });

    for (let tick = 0; tick <= 4; tick++) {
      const value = adjustedMax - (adjustedMax - domainMin) * tick / 4;
      const yPosition = y(value);
      svg.appendChild(createSvgElement('line', {
        x1: margin.left,
        x2: width - margin.right,
        y1: yPosition,
        y2: yPosition,
        class: 'grid-line'
      }));
      addText(svg, new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value), {
        x: margin.left - 8,
        y: yPosition + 4,
        'text-anchor': 'end',
        class: 'tick-label'
      });
    }

    svg.appendChild(createSvgElement('line', {
      x1: margin.left,
      x2: width - margin.right,
      y1: zeroY,
      y2: zeroY,
      class: 'axis-line'
    }));

    const barFields = measureFields.filter((field, index) => getSeriesMode(field, index) === 'bar');
    const barWidth = Math.min(36, groupWidth * 0.72 / Math.max(1, barFields.length));

    chartRows.forEach((row, categoryIndex) => {
      const center = xCenter(categoryIndex);
      const firstBarX = center - barWidth * barFields.length / 2;
      barFields.forEach((field, barIndex) => {
        const value = getNumericValue(row, field);
        if (value === null) return;
        const yValue = y(value);
        const rect = createSvgElement('rect', {
          x: firstBarX + barIndex * barWidth + 1,
          y: Math.min(zeroY, yValue),
          width: Math.max(1, barWidth - 2),
          height: Math.max(1, Math.abs(zeroY - yValue)),
          fill: COLORS[measureFields.indexOf(field) % COLORS.length],
          rx: 1
        });
        const title = createSvgElement('title');
        title.textContent = `${categories[categoryIndex]} · ${field.name}: ${value}`;
        rect.appendChild(title);
        svg.appendChild(rect);
      });

      if (categories.length <= 12 || categoryIndex % Math.ceil(categories.length / 12) === 0) {
        addText(svg, categories[categoryIndex], {
          x: center,
          y: height - margin.bottom + 18,
          'text-anchor': 'middle',
          class: 'tick-label'
        });
      }
    });

    measureFields.forEach((field, fieldIndex) => {
      if (getSeriesMode(field, fieldIndex) !== 'line') return;
      const points = chartRows
        .map((row, categoryIndex) => {
          const value = getNumericValue(row, field);
          return value === null ? null : { x: xCenter(categoryIndex), y: y(value), value, categoryIndex };
        })
        .filter(point => point !== null);
      if (points.length === 0) return;

      const path = createSvgElement('path', {
        d: points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '),
        fill: 'none',
        stroke: COLORS[fieldIndex % COLORS.length],
        'stroke-width': 2.5,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        'aria-label': `${field.name} ${lineStyles.get(field.name)} line`
      });
      const dashArray = LINE_STYLES[lineStyles.get(field.name)];
      if (dashArray) path.setAttribute('stroke-dasharray', dashArray);
      svg.appendChild(path);

      points.forEach(point => {
        const circle = createSvgElement('circle', {
          cx: point.x,
          cy: point.y,
          r: 3.5,
          fill: COLORS[fieldIndex % COLORS.length],
          stroke: '#fff',
          'stroke-width': 1.5
        });
        const title = createSvgElement('title');
        title.textContent = `${categories[point.categoryIndex]} · ${field.name}: ${point.value}`;
        circle.appendChild(title);
        svg.appendChild(circle);
      });
    });

    addText(svg, 'Shared value axis', {
      x: 14,
      y: margin.top + plotHeight / 2,
      transform: `rotate(-90 14 ${margin.top + plotHeight / 2})`,
      'text-anchor': 'middle',
      class: 'axis-label'
    });

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

  function updateFromTableau (worksheet) {
    const refresh = async () => {
      try {
        const [rows, encodings] = await Promise.all([
          getSummaryRows(worksheet),
          getEncodings(worksheet)
        ]);
        chartRows = rows;
        categoryField = encodings.category?.[0];
        measureFields = encodings.measures || [];
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
    chartRows = [
      { Month: { value: 'Jan' }, Sales: { value: 92 }, Profit: { value: 38 }, Orders: { value: 62 }, Target: { value: 71 } },
      { Month: { value: 'Feb' }, Sales: { value: 108 }, Profit: { value: 45 }, Orders: { value: 68 }, Target: { value: 79 } },
      { Month: { value: 'Mar' }, Sales: { value: 84 }, Profit: { value: 31 }, Orders: { value: 57 }, Target: { value: 82 } },
      { Month: { value: 'Apr' }, Sales: { value: 126 }, Profit: { value: 52 }, Orders: { value: 76 }, Target: { value: 88 } },
      { Month: { value: 'May' }, Sales: { value: 115 }, Profit: { value: 49 }, Orders: { value: 73 }, Target: { value: 94 } },
      { Month: { value: 'Jun' }, Sales: { value: 143 }, Profit: { value: 66 }, Orders: { value: 85 }, Target: { value: 101 } }
    ];
    render();
  }

  window.addEventListener('resize', render);

  if (window.tableau?.extensions && window.parent !== window) {
    tableau.extensions.initializeAsync()
      .then(() => {
        const worksheet = tableau.extensions.worksheetContent?.worksheet;
        if (!worksheet) {
          showMessage('This page is not running inside a Tableau worksheet.');
          return;
        }
        updateFromTableau(worksheet);
      })
      .catch(error => showMessage(`Unable to initialize the Tableau extension: ${error.message || error}`));
  } else {
    renderPreview();
  }
})();
