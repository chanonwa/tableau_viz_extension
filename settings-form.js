'use strict';

// Builds the settings form used by both the Tableau "Format Extension" dialog and the in-chart panel.
// payload: { state, defaultState, measures: [{ name, mode, lineStyle, color, defaultMode, defaultColor }] }
window.ComboSettingsForm = (function () {
  const LINE_STYLE_LABELS = { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted', 'dash-dot': 'Dash-dot' };

  function element (tag, attributes, children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes || {})) {
      if (key === 'text') node.textContent = value;
      else if (key === 'checked' || key === 'disabled') node[key] = Boolean(value);
      else node.setAttribute(key, String(value));
    }
    for (const child of children || []) node.append(child);
    return node;
  }

  function select (options, value, label) {
    const node = element('select', { 'aria-label': label });
    for (const [optionValue, text] of options) {
      node.appendChild(element('option', { value: optionValue, text }));
    }
    node.value = String(value);
    return node;
  }

  function numberInput (value, min, max, label) {
    return element('input', { type: 'number', min, max, step: 1, value, 'aria-label': label, class: 'number-input' });
  }

  function textInput (value, placeholder, label, className) {
    return element('input', { type: 'text', value, placeholder, 'aria-label': label, class: className || 'text-input' });
  }

  function checkbox (checked, text, onChange) {
    const input = element('input', { type: 'checkbox', checked });
    input.addEventListener('change', () => onChange(input.checked));
    return element('label', { class: 'check' }, [input, ` ${text}`]);
  }

  function section (title, children) {
    return element('fieldset', { class: 'settings-section' }, [element('legend', { text: title }), ...children]);
  }

  function build (container, payload, handlers) {
    const draft = JSON.parse(JSON.stringify(payload.state));
    const measures = payload.measures.map(measure => ({ ...measure }));

    function renderForm () {
      container.replaceChildren();
      const forecast = draft.forecast;

      // Measures
      const measureRows = measures.map(measure => {
        const mode = select([['bar', 'Bar'], ['line', 'Line']], measure.mode, `${measure.name} mark type`);
        const lineStyle = select(Object.entries(LINE_STYLE_LABELS), measure.lineStyle, `${measure.name} line style`);
        lineStyle.disabled = measure.mode !== 'line';
        const color = element('input', { type: 'color', value: measure.color, 'aria-label': `${measure.name} color` });
        mode.addEventListener('change', () => {
          measure.mode = mode.value;
          lineStyle.disabled = measure.mode !== 'line';
        });
        lineStyle.addEventListener('change', () => { measure.lineStyle = lineStyle.value; });
        color.addEventListener('input', () => { measure.color = color.value; });
        return element('tr', {}, [
          element('td', { class: 'measure-name', text: measure.name, title: measure.name }),
          element('td', {}, [mode]),
          element('td', {}, [lineStyle]),
          element('td', {}, [color])
        ]);
      });
      const measuresSection = section('Measures', measures.length === 0
        ? [element('p', { class: 'hint', text: 'Add measures to the Measures encoding to style them.' })]
        : [element('table', { class: 'measure-table' }, [
          element('thead', {}, [element('tr', {}, ['Measure', 'Mark', 'Line style', 'Color'].map(text => element('th', { text })))]),
          element('tbody', {}, measureRows)
        ])]);

      // Value axis, following Tableau's Edit Axis dialog
      const axis = draft.axis;
      const axisTitle = textInput(axis.title, 'Automatic (measure names)', 'Value axis title');
      axisTitle.addEventListener('input', () => { axis.title = axisTitle.value; });
      const rangeMin = textInput(axis.rangeMin, 'Automatic', 'Axis start', 'number-text');
      const rangeMax = textInput(axis.rangeMax, 'Automatic', 'Axis end', 'number-text');
      rangeMin.addEventListener('input', () => { axis.rangeMin = rangeMin.value.trim(); });
      rangeMax.addEventListener('input', () => { axis.rangeMax = rangeMax.value.trim(); });

      const ticks = select([['auto', 'Automatic'], ['fixed', 'Fixed interval'], ['none', 'None']], axis.ticks, 'Tick marks');
      const tickInterval = textInput(axis.tickInterval, 'Interval', 'Tick interval', 'number-text');
      tickInterval.disabled = axis.ticks !== 'fixed';
      ticks.addEventListener('change', () => { axis.ticks = ticks.value; renderForm(); });
      tickInterval.addEventListener('input', () => { axis.tickInterval = tickInterval.value.trim(); });

      const format = select([
        ['auto', 'Automatic'],
        ['number', 'Number'],
        ['currency', 'Currency'],
        ['percent', 'Percentage']
      ], axis.format, 'Number format');
      format.addEventListener('change', () => { axis.format = format.value; renderForm(); });
      const decimals = numberInput(axis.decimals, 0, 6, 'Decimal places');
      decimals.disabled = axis.format === 'auto';
      decimals.addEventListener('change', () => { axis.decimals = clamp(decimals.value, 0, 6, axis.decimals); });
      const units = select([
        ['none', 'None'],
        ['thousands', 'Thousands (K)'],
        ['millions', 'Millions (M)'],
        ['billions', 'Billions (B)']
      ], axis.units, 'Display units');
      units.disabled = axis.format === 'auto' || axis.format === 'percent';
      units.addEventListener('change', () => { axis.units = units.value; });
      const currencySymbol = textInput(axis.currencySymbol, '$', 'Currency symbol', 'symbol-text');
      currencySymbol.disabled = axis.format !== 'currency';
      currencySymbol.addEventListener('input', () => { axis.currencySymbol = currencySymbol.value; });

      const valueAxisSection = section('Value axis', [
        element('div', { class: 'group-title', text: 'Title' }),
        element('div', { class: 'row' }, [axisTitle, checkbox(axis.showTitle, 'Show title', checked => { axis.showTitle = checked; })]),
        element('div', { class: 'group-title', text: 'Range' }),
        element('div', { class: 'row' }, [
          element('span', { text: 'Start' }), rangeMin,
          element('span', { text: 'End' }), rangeMax,
          checkbox(axis.includeZero, 'Include zero', checked => { axis.includeZero = checked; })
        ]),
        element('div', { class: 'group-title', text: 'Scale' }),
        element('div', { class: 'row' }, [
          checkbox(axis.reversed, 'Reversed', checked => { axis.reversed = checked; }),
          checkbox(axis.logarithmic, 'Logarithmic', checked => { axis.logarithmic = checked; })
        ]),
        element('div', { class: 'group-title', text: 'Tick marks' }),
        element('div', { class: 'row' }, [ticks, tickInterval, checkbox(axis.gridLines, 'Show grid lines', checked => { axis.gridLines = checked; })]),
        element('div', { class: 'group-title', text: 'Number format' }),
        element('div', { class: 'row' }, [
          format,
          element('span', { text: 'Decimals' }), decimals,
          element('span', { text: 'Units' }), units,
          element('span', { text: 'Symbol' }), currencySymbol
        ])
      ]);

      // Category axis
      const categoryTitle = textInput(axis.categoryTitle, 'Automatic (field name)', 'Category axis title');
      categoryTitle.addEventListener('input', () => { axis.categoryTitle = categoryTitle.value; });
      const rotation = select([
        ['auto', 'Horizontal (skip labels to fit)'],
        ['45', 'Rotate 45°'],
        ['90', 'Rotate 90°']
      ], axis.labelRotation, 'Label orientation');
      rotation.addEventListener('change', () => { axis.labelRotation = rotation.value; });
      const categoryAxisSection = section('Category axis', [
        element('div', { class: 'group-title', text: 'Title' }),
        element('div', { class: 'row' }, [categoryTitle, checkbox(axis.showCategoryTitle, 'Show title', checked => { axis.showCategoryTitle = checked; })]),
        element('div', { class: 'group-title', text: 'Labels' }),
        element('div', { class: 'row' }, [rotation])
      ]);

      // Display
      const valueLabels = element('input', { type: 'checkbox', checked: draft.display.valueLabels });
      valueLabels.addEventListener('change', () => { draft.display.valueLabels = valueLabels.checked; });
      const tooltips = element('input', { type: 'checkbox', checked: draft.display.tooltips });
      tooltips.addEventListener('change', () => { draft.display.tooltips = tooltips.checked; });
      const displaySection = section('Display', [
        element('label', { class: 'check' }, [valueLabels, ' Show measure values on marks']),
        element('label', { class: 'check' }, [tooltips, ' Show tooltips'])
      ]);

      // Forecast, following Tableau's Forecast Options dialog
      const show = element('input', { type: 'checkbox', checked: forecast.show });
      show.addEventListener('change', () => {
        forecast.show = show.checked;
        renderForm();
      });

      const forecastMeasures = measures.map(measure => {
        const checkbox = element('input', {
          type: 'checkbox',
          checked: forecast.measures === null || forecast.measures.includes(measure.name),
          disabled: !forecast.show
        });
        checkbox.addEventListener('change', () => {
          const selected = forecast.measures === null ? measures.map(item => item.name) : forecast.measures.slice();
          forecast.measures = checkbox.checked
            ? [...selected, measure.name]
            : selected.filter(name => name !== measure.name);
        });
        return element('label', { class: 'check' }, [checkbox, ` ${measure.name}`]);
      });

      const lengthAuto = element('input', { type: 'radio', name: 'forecast-length', checked: forecast.length === 'auto', disabled: !forecast.show });
      const lengthExact = element('input', { type: 'radio', name: 'forecast-length', checked: forecast.length !== 'auto', disabled: !forecast.show });
      const periods = numberInput(forecast.periods, 1, 60, 'Forecast periods');
      periods.disabled = !forecast.show || forecast.length === 'auto';
      lengthAuto.addEventListener('change', () => { forecast.length = 'auto'; renderForm(); });
      lengthExact.addEventListener('change', () => { forecast.length = 'exact'; renderForm(); });
      periods.addEventListener('change', () => { forecast.periods = clamp(periods.value, 1, 60, forecast.periods); });

      const ignoreLast = numberInput(forecast.ignoreLast, 0, 12, 'Ignore last periods');
      ignoreLast.disabled = !forecast.show;
      ignoreLast.addEventListener('change', () => { forecast.ignoreLast = clamp(ignoreLast.value, 0, 12, forecast.ignoreLast); });

      const model = select([
        ['auto', 'Automatic'],
        ['auto-noseason', 'Automatic without seasonality'],
        ['custom', 'Custom']
      ], forecast.model, 'Forecast model');
      model.disabled = !forecast.show;
      model.addEventListener('change', () => { forecast.model = model.value; renderForm(); });
      const typeOptions = [['none', 'None'], ['additive', 'Additive'], ['multiplicative', 'Multiplicative']];
      const trend = select(typeOptions, forecast.trend, 'Trend');
      const season = select(typeOptions, forecast.season, 'Season');
      trend.disabled = season.disabled = !forecast.show || forecast.model !== 'custom';
      trend.addEventListener('change', () => { forecast.trend = trend.value; });
      season.addEventListener('change', () => { forecast.season = season.value; });

      const showInterval = element('input', { type: 'checkbox', checked: forecast.showInterval, disabled: !forecast.show });
      const interval = select([['90', '90%'], ['95', '95%'], ['99', '99%']], forecast.interval, 'Prediction interval');
      interval.disabled = !forecast.show || !forecast.showInterval;
      showInterval.addEventListener('change', () => { forecast.showInterval = showInterval.checked; renderForm(); });
      interval.addEventListener('change', () => { forecast.interval = Number(interval.value); });

      const forecastSection = section('Forecast', [
        element('label', { class: 'check strong' }, [show, ' Show forecast']),
        element('div', { class: 'group-title', text: 'Forecast measures' }),
        element('div', { class: 'check-list' }, forecastMeasures),
        element('div', { class: 'group-title', text: 'Forecast length' }),
        element('label', { class: 'check' }, [lengthAuto, ' Automatic (one season: 12 months, 4 quarters, or 3 years)']),
        element('label', { class: 'check' }, [lengthExact, ' Exactly ', periods, ' periods']),
        element('div', { class: 'group-title', text: 'Source data' }),
        element('label', { class: 'row' }, ['Ignore last ', ignoreLast, ' periods (for an incomplete latest period)']),
        element('div', { class: 'group-title', text: 'Forecast model' }),
        element('div', { class: 'row' }, [model]),
        element('div', { class: 'row' }, [element('span', { text: 'Trend' }), trend, element('span', { text: 'Season' }), season]),
        element('div', { class: 'group-title', text: 'Prediction intervals' }),
        element('div', { class: 'row' }, [element('label', { class: 'check' }, [showInterval, ' Show prediction intervals']), interval])
      ]);

      // Buttons
      const reset = element('button', { type: 'button', class: 'secondary', text: 'Reset to defaults' });
      reset.addEventListener('click', () => {
        Object.assign(draft, JSON.parse(JSON.stringify(payload.defaultState)));
        for (const measure of measures) {
          measure.mode = measure.defaultMode;
          measure.lineStyle = 'solid';
          measure.color = measure.defaultColor;
        }
        renderForm();
      });
      const cancel = element('button', { type: 'button', class: 'secondary', text: 'Cancel' });
      cancel.addEventListener('click', () => handlers.onCancel());
      const ok = element('button', { type: 'button', class: 'primary', text: 'OK' });
      ok.addEventListener('click', () => {
        draft.series = {};
        for (const measure of measures) {
          draft.series[measure.name] = { mode: measure.mode, lineStyle: measure.lineStyle, color: measure.color };
        }
        handlers.onSave(draft);
      });

      container.append(
        measuresSection,
        valueAxisSection,
        categoryAxisSection,
        displaySection,
        forecastSection,
        element('div', { class: 'settings-buttons' }, [reset, element('span', { class: 'spacer' }), cancel, ok])
      );
    }

    renderForm();
  }

  function clamp (value, min, max, fallback) {
    const number = Math.round(Number(value));
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  return { build };
})();
