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
  const FORECAST_PERIOD_OPTIONS = [1, 2, 3, 6, 12];
  // z-score for an 80% prediction interval
  const FORECAST_Z = 1.2816;
  const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  const chartElement = document.getElementById('chart');
  const messageElement = document.getElementById('message');
  const seriesListElement = document.getElementById('series-list');
  const forecastControlsElement = document.getElementById('forecast-controls');
  const settingsButton = document.getElementById('settings-button');
  const settingsPanel = document.getElementById('settings-panel');
  const colorListElement = document.getElementById('color-list');
  const resetColorsButton = document.getElementById('reset-colors');
  const showValueLabelsInput = document.getElementById('show-value-labels');
  const showTooltipsInput = document.getElementById('show-tooltips');
  const tooltipElement = document.getElementById('tooltip');

  let chartRows = [];
  let categoryField;
  let measureFields = [];
  let labelField;
  let tooltipContent = null;
  const seriesModes = new Map();
  const lineStyles = new Map();
  const seriesColors = new Map();
  // undefined = first measure, '' = no forecast
  let forecastMeasure;
  let forecastPeriods = 3;

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

  // Fields on Detail split a category into several rows; combine them into one row per category.
  // Measures are added up and other fields list their distinct values.
  function groupRowsByCategory (rows) {
    if (!categoryField) return rows;
    const groups = new Map();
    for (const row of rows) {
      const key = getLabel(row[categoryField.name]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    if (groups.size === rows.length) return rows;

    const measureNames = new Set(measureFields.map(field => field.name));
    return [...groups.values()].map(group => {
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
    });
  }

  function hideTooltip () {
    tooltipElement.hidden = true;
    tooltipContent = null;
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
        if (item.color) {
          const swatch = document.createElement('span');
          swatch.className = 'tooltip-swatch';
          swatch.style.backgroundColor = item.color;
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

  function getColor (field) {
    const index = Math.max(0, measureFields.findIndex(measure => measure.name === field.name));
    return seriesColors.get(field.name) || COLORS[index % COLORS.length];
  }

  // Rebuilt only when the panel opens or the measures change, so an open color picker is not destroyed mid-edit.
  function renderSettings () {
    colorListElement.replaceChildren();
    if (measureFields.length === 0) {
      colorListElement.textContent = 'Add measures to change their colors.';
      return;
    }

    measureFields.forEach(field => {
      const row = document.createElement('label');
      row.className = 'color-row';

      const picker = document.createElement('input');
      picker.type = 'color';
      picker.value = getColor(field);
      picker.setAttribute('aria-label', `${field.name} color`);

      const hex = document.createElement('input');
      hex.type = 'text';
      hex.className = 'color-hex';
      hex.value = picker.value;
      hex.maxLength = 7;
      hex.setAttribute('aria-label', `${field.name} hex color`);

      const name = document.createElement('span');
      name.className = 'series-name';
      name.textContent = field.name;

      picker.addEventListener('input', () => {
        seriesColors.set(field.name, picker.value);
        hex.value = picker.value;
        render();
      });
      hex.addEventListener('change', () => {
        const value = hex.value.trim().startsWith('#') ? hex.value.trim() : `#${hex.value.trim()}`;
        if (/^#[0-9a-f]{6}$/i.test(value)) {
          seriesColors.set(field.name, value.toLowerCase());
          picker.value = value.toLowerCase();
          render();
        }
        hex.value = picker.value;
      });

      row.append(picker, hex, name);
      colorListElement.appendChild(row);
    });
  }

  settingsButton.addEventListener('click', () => {
    const open = settingsPanel.hidden;
    settingsPanel.hidden = !open;
    settingsButton.setAttribute('aria-expanded', String(open));
    if (open) renderSettings();
    render();
  });

  resetColorsButton.addEventListener('click', () => {
    seriesColors.clear();
    renderSettings();
    render();
  });

  showValueLabelsInput.addEventListener('change', render);
  showTooltipsInput.addEventListener('change', render);

  function getForecastDates () {
    if (!categoryField || chartRows.length < 3) return null;
    const dates = chartRows.map(row => getCategoryDate(row[categoryField.name]));
    if (dates.some(date => date === null)) return null;

    const monthIndex = date => date.getUTCFullYear() * 12 + date.getUTCMonth();
    const last = dates[dates.length - 1];
    const step = monthIndex(last) - monthIndex(dates[dates.length - 2]);
    if (step <= 0) return null;

    return Array.from({ length: forecastPeriods }, (_, index) =>
      new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + step * (index + 1), 1))
    );
  }

  function getForecastField () {
    if (forecastMeasure === '') return null;
    return measureFields.find(field => field.name === forecastMeasure) || measureFields[0] || null;
  }

  // Least-squares linear trend over the visible points, with an 80% prediction interval.
  function getForecast () {
    const field = getForecastField();
    const dates = getForecastDates();
    if (!field || !dates) return null;

    const points = chartRows
      .map((row, index) => ({ x: index, y: getNumericValue(row, field) }))
      .filter(point => point.y !== null);
    const n = points.length;
    if (n < 3) return null;

    const meanX = points.reduce((sum, point) => sum + point.x, 0) / n;
    const meanY = points.reduce((sum, point) => sum + point.y, 0) / n;
    const sxx = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
    const slope = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / sxx;
    const intercept = meanY - slope * meanX;
    const residualSd = Math.sqrt(
      points.reduce((sum, point) => sum + (point.y - intercept - slope * point.x) ** 2, 0) / (n - 2)
    );

    return {
      field,
      anchor: points[n - 1],
      points: dates.map((date, index) => {
        const x = chartRows.length + index;
        const value = intercept + slope * x;
        const margin = FORECAST_Z * residualSd * Math.sqrt(1 + 1 / n + (x - meanX) ** 2 / sxx);
        return { x, label: formatMonth(date), value, low: value - margin, high: value + margin };
      })
    };
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
      swatch.style.backgroundColor = getColor(field);

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

  function renderForecastControls () {
    forecastControlsElement.replaceChildren();
    if (measureFields.length === 0) return;
    const available = getForecastDates() !== null;

    const label = document.createElement('span');
    label.textContent = 'Forecast';

    const measureSelect = document.createElement('select');
    measureSelect.className = 'line-style forecast-select';
    measureSelect.setAttribute('aria-label', 'Measure to forecast');
    measureSelect.disabled = !available;
    for (const [value, text] of [['', 'None'], ...measureFields.map(field => [field.name, field.name])]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      measureSelect.appendChild(option);
    }
    measureSelect.value = getForecastField()?.name ?? '';
    measureSelect.addEventListener('change', () => {
      forecastMeasure = measureSelect.value;
      render();
    });

    const periodsSelect = document.createElement('select');
    periodsSelect.className = 'line-style';
    periodsSelect.setAttribute('aria-label', 'Periods to forecast');
    periodsSelect.disabled = !available || !getForecastField();
    for (const periods of FORECAST_PERIOD_OPTIONS) {
      const option = document.createElement('option');
      option.value = String(periods);
      option.textContent = `${periods} period${periods === 1 ? '' : 's'}`;
      periodsSelect.appendChild(option);
    }
    periodsSelect.value = String(forecastPeriods);
    periodsSelect.addEventListener('change', () => {
      forecastPeriods = Number(periodsSelect.value);
      render();
    });

    forecastControlsElement.append(label, measureSelect, periodsSelect);
    if (!available) {
      const hint = document.createElement('span');
      hint.className = 'forecast-hint';
      hint.textContent = 'Needs a month, quarter, or year date on Category with at least 3 points.';
      forecastControlsElement.appendChild(hint);
    }
  }

  function render () {
    renderControls();
    renderForecastControls();

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

    const showValueLabels = showValueLabelsInput.checked;
    const width = Math.max(320, chartElement.clientWidth - 16);
    const height = Math.max(220, chartElement.clientHeight - 8);
    const margin = { top: labelField || showValueLabels ? 32 : 16, right: 18, bottom: 64, left: 64 };
    const plotWidth = Math.max(1, width - margin.left - margin.right);
    const plotHeight = Math.max(1, height - margin.top - margin.bottom);
    const forecast = getForecast();
    const forecastValues = forecast ? forecast.points.flatMap(point => [point.low, point.high]) : [];
    const minValue = Math.min(0, ...values, ...forecastValues);
    const maxValue = Math.max(0, ...values, ...forecastValues);
    const range = maxValue - minValue;
    const padding = range === 0 ? Math.max(1, Math.abs(maxValue) * 0.1) : range * 0.08;
    const domainMin = minValue < 0 ? minValue - padding : 0;
    const domainMax = maxValue > 0 ? maxValue + padding : 0;
    const adjustedMax = domainMax === domainMin ? domainMin + 1 : domainMax;
    const y = value => margin.top + (adjustedMax - value) / (adjustedMax - domainMin) * plotHeight;
    const zeroY = y(0);
    const labels = [...categories, ...(forecast ? forecast.points.map(point => point.label) : [])];
    const groupWidth = plotWidth / labels.length;
    const xCenter = index => margin.left + groupWidth * (index + 0.5);
    const svg = createSvgElement('svg', {
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': 'Combo chart of multiple measures'
    });

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
      addText(svg, numberFormat.format(value), {
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
          fill: getColor(field),
          rx: 1
        });
        svg.appendChild(rect);
        if (showValueLabels) {
          addText(svg, getLabel(row[field.name]), {
            x: firstBarX + barIndex * barWidth + barWidth / 2,
            y: value >= 0 ? yValue - 4 : yValue + 12,
            'text-anchor': 'middle',
            class: 'value-label'
          });
        }
      });
    });

    // Thin out labels so long month names do not overlap
    const labelStep = Math.ceil(labels.length / Math.max(1, Math.floor(plotWidth / 96)));
    labels.forEach((label, index) => {
      if (index % labelStep !== 0) return;
      addText(svg, label, {
        x: xCenter(index),
        y: height - margin.bottom + 18,
        'text-anchor': 'middle',
        class: 'tick-label'
      });
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
        stroke: getColor(field),
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
          fill: getColor(field),
          stroke: '#fff',
          'stroke-width': 1.5
        });
        svg.appendChild(circle);
        if (showValueLabels) {
          addText(svg, getLabel(chartRows[point.categoryIndex][field.name]), {
            x: point.x,
            y: point.y - 8,
            'text-anchor': 'middle',
            class: 'value-label'
          });
        }
      });
    });

    if (labelField) {
      chartRows.forEach((row, categoryIndex) => {
        const rowValues = measureFields.map(field => getNumericValue(row, field)).filter(value => value !== null);
        const top = y(Math.max(0, ...rowValues));
        addText(svg, getLabel(row[labelField.name]), {
          x: xCenter(categoryIndex),
          y: Math.max(12, top - (showValueLabels ? 18 : 6)),
          'text-anchor': 'middle',
          class: 'text-label'
        });
      });
    }

    if (forecast) {
      const color = getColor(forecast.field);
      const anchorX = xCenter(forecast.anchor.x);
      const anchorY = y(forecast.anchor.y);
      const upper = forecast.points.map(point => `L ${xCenter(point.x)} ${y(point.high)}`);
      const lower = forecast.points.slice().reverse().map(point => `L ${xCenter(point.x)} ${y(point.low)}`);
      svg.appendChild(createSvgElement('path', {
        d: `M ${anchorX} ${anchorY} ${upper.join(' ')} ${lower.join(' ')} Z`,
        fill: color,
        'fill-opacity': 0.15,
        stroke: 'none'
      }));
      svg.appendChild(createSvgElement('path', {
        d: `M ${anchorX} ${anchorY} ` + forecast.points.map(point => `L ${xCenter(point.x)} ${y(point.value)}`).join(' '),
        fill: 'none',
        stroke: color,
        'stroke-width': 2.5,
        'stroke-dasharray': '6 4',
        'stroke-linecap': 'round',
        'aria-label': `${forecast.field.name} forecast`
      }));
      forecast.points.forEach(point => {
        const circle = createSvgElement('circle', {
          cx: xCenter(point.x),
          cy: y(point.value),
          r: 3.5,
          fill: '#fff',
          stroke: color,
          'stroke-width': 2
        });
        svg.appendChild(circle);
        if (showValueLabels) {
          addText(svg, numberFormat.format(point.value), {
            x: xCenter(point.x),
            y: y(point.value) - 8,
            'text-anchor': 'middle',
            class: 'value-label'
          });
        }
      });
    }

    if (showTooltipsInput.checked) {
      const measureNames = new Set(measureFields.map(field => field.name));
      const extraFieldNames = Object.keys(chartRows[0]).filter(name =>
        name !== categoryField.name && name !== labelField?.name && !measureNames.has(name)
      );
      const getTooltipContent = index => {
        if (index >= chartRows.length) {
          const point = forecast.points[index - chartRows.length];
          return {
            title: point.label,
            rows: [
              { name: `${forecast.field.name} forecast`, value: numberFormat.format(point.value), color: getColor(forecast.field) },
              { name: '80% range', value: `${numberFormat.format(point.low)} – ${numberFormat.format(point.high)}` }
            ]
          };
        }
        const row = chartRows[index];
        return {
          title: categories[index],
          rows: [
            ...measureFields.map(field => ({ name: field.name, value: getLabel(row[field.name]), color: getColor(field) })),
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
        categoryField = encodings.category?.[0];
        measureFields = encodings.measures || [];
        labelField = encodings.label?.[0];
        chartRows = sortRowsByDate(groupRowsByCategory(rows));
        if (!settingsPanel.hidden) renderSettings();
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
    labelField = { name: 'Region' };
    chartRows = [
      { Month: { value: '2026-01-01' }, Sales: { value: 92 }, Profit: { value: 38 }, Orders: { value: 62 }, Target: { value: 71 }, Region: { value: 'East' } },
      { Month: { value: '2026-02-01' }, Sales: { value: 108 }, Profit: { value: 45 }, Orders: { value: 68 }, Target: { value: 79 }, Region: { value: 'West' } },
      { Month: { value: '2026-03-01' }, Sales: { value: 84 }, Profit: { value: 31 }, Orders: { value: 57 }, Target: { value: 82 }, Region: { value: 'East' } },
      { Month: { value: '2026-04-01' }, Sales: { value: 126 }, Profit: { value: 52 }, Orders: { value: 76 }, Target: { value: 88 }, Region: { value: 'North' } },
      { Month: { value: '2026-05-01' }, Sales: { value: 115 }, Profit: { value: 49 }, Orders: { value: 73 }, Target: { value: 94 }, Region: { value: 'West' } },
      { Month: { value: '2026-06-01' }, Sales: { value: 143 }, Profit: { value: 66 }, Orders: { value: 85 }, Target: { value: 101 }, Region: { value: 'South' } }
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
