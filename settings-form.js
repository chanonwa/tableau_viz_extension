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
    const colorMembers = payload.color ? payload.color.members.map(member => ({ ...member })) : [];
    // Bar Style can use any field on Detail or Tooltip; each candidate carries its values
    const styleCandidates = payload.style
      ? payload.style.candidates.map(candidate => ({ name: candidate.name, values: candidate.values.map(value => ({ ...value })) }))
      : [];
    const getStyleValues = () => styleCandidates.find(candidate => candidate.name === draft.barStyle.field)?.values || [];

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

      // Color encoding, following Tableau's Edit Colors dialog
      let colorSection = null;
      if (payload.color) {
        const layout = select([['stacked', 'Stacked'], ['side-by-side', 'Side by side']], draft.colorGroup.layout, 'Bar layout');
        layout.addEventListener('change', () => { draft.colorGroup.layout = layout.value; });
        const memberRows = colorMembers.map(member => {
          const color = element('input', { type: 'color', value: member.color, 'aria-label': `${member.name} color` });
          color.addEventListener('input', () => { member.color = color.value; });
          const fill = select([['solid', 'Solid'], ['hatched', 'Hatched'], ['light', 'Light']], member.fill, `${member.name} fill`);
          fill.addEventListener('change', () => { member.fill = fill.value; });
          return element('tr', {}, [
            element('td', { class: 'measure-name', text: member.name, title: member.name }),
            element('td', {}, [color]),
            element('td', {}, [fill])
          ]);
        });
        colorSection = section(`Color: ${payload.color.fieldName}`, [
          element('p', { class: 'hint', text: 'Splits the first bar measure into one colored group per value. Use Hatched or Light to mark values such as estimates.' }),
          element('div', { class: 'row' }, [element('span', { text: 'Bars' }), layout]),
          element('table', { class: 'measure-table' }, [
            element('thead', {}, [element('tr', {}, ['Value', 'Color', 'Fill'].map(text => element('th', { text })))]),
            element('tbody', {}, memberRows)
          ])
        ]);
      }

      // Prior period: the extension recalculates a measure as another measure's category total N periods back
      draft.priorPeriod = draft.priorPeriod || { target: '', basis: '', periods: 12 };
      const prior = draft.priorPeriod;
      const measureOptions = measures.map(measure => [measure.name, measure.name]);
      const priorTarget = select([['', 'None'], ...measureOptions], measures.some(measure => measure.name === prior.target) ? prior.target : '', 'Measure to replace');
      priorTarget.addEventListener('change', () => {
        prior.target = priorTarget.value;
        // Default the basis to the first measure that isn't the one being replaced
        if (prior.target && !measures.some(measure => measure.name === prior.basis && measure.name !== prior.target)) {
          prior.basis = measures.find(measure => measure.name !== prior.target)?.name || '';
        }
        renderForm();
      });
      const priorBasis = select(measureOptions, prior.basis, 'Based on measure');
      priorBasis.addEventListener('change', () => { prior.basis = priorBasis.value; });
      const priorPeriods = numberInput(prior.periods, 1, 60, 'Periods back');
      priorPeriods.addEventListener('change', () => { prior.periods = clamp(priorPeriods.value, 1, 60, prior.periods); });
      priorBasis.disabled = priorPeriods.disabled = !prior.target;
      const priorSection = section('Prior period', [
        element('p', {
          class: 'hint',
          text: 'Use this when a prior-period table calculation such as LOOKUP(SUM([Revenue]), -12) shows wrong totals here. ' +
            'Fields on Color or Detail split each category, and parts with no row 12 periods back (e.g. Estimate) return nothing. ' +
            'The extension instead takes the category total of the chosen measure N periods earlier. ' +
            'Where that period isn\'t in the chart, Tableau\'s own value is kept.'
        }),
        element('div', { class: 'row' }, [
          element('span', { text: 'Replace' }), priorTarget,
          element('span', { text: 'with' }), priorBasis,
          element('span', { text: 'from' }), priorPeriods,
          element('span', { text: 'periods earlier' })
        ])
      ]);

      // Bar Style: a field on Detail (e.g. Official / Estimate) sets the fill of each part of the primary bar
      draft.barStyle = draft.barStyle || { field: '', fills: {} };
      const styleFieldSelect = select(
        [['', 'None'], ...styleCandidates.map(candidate => [candidate.name, candidate.name])],
        styleCandidates.some(candidate => candidate.name === draft.barStyle.field) ? draft.barStyle.field : '',
        'Bar Style field'
      );
      styleFieldSelect.addEventListener('change', () => { draft.barStyle.field = styleFieldSelect.value; renderForm(); });
      const styleRows = getStyleValues().map(value => {
        const fill = select([['solid', 'Solid'], ['hatched', 'Hatched'], ['light', 'Light']], value.fill, `${value.name} fill`);
        fill.addEventListener('change', () => { value.fill = fill.value; });
        return element('tr', {}, [
          element('td', { class: 'measure-name', text: value.name, title: value.name }),
          element('td', {}, [fill])
        ]);
      });
      const styleSection = section('Bar Style', [
        element('p', {
          class: 'hint',
          text: styleCandidates.length === 0
            ? 'Drag a field such as Source (Official / Estimate) onto Detail on the Marks card, then choose it here. ' +
              `Fields received from Tableau: ${(payload.style?.receivedFields || []).join(', ') || 'none'}.`
            : 'Choose a field on Detail to set the fill of the first bar measure for each of its values. ' +
              'Other bar measures follow it in categories with a single value. Solid parts are stacked first, with shaded parts on top.'
        }),
        element('div', { class: 'row' }, [element('span', { text: 'Field' }), styleFieldSelect]),
        ...(styleRows.length > 0
          ? [element('table', { class: 'measure-table' }, [
              element('thead', {}, [element('tr', {}, ['Value', 'Fill'].map(text => element('th', { text })))]),
              element('tbody', {}, styleRows)
            ])]
          : [])
      ]);
      styleFieldSelect.disabled = styleCandidates.length === 0;

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

      // Labels, following Tableau's Label shelf
      const labels = draft.labels;
      const marks = select([
        ['all', 'All'],
        ['minmax', 'Min and max'],
        ['recent', 'Most recent']
      ], labels.marks, 'Marks to label');
      marks.addEventListener('change', () => { labels.marks = marks.value; });

      const labelNumberFormat = select([
        ['axis', 'Same as value axis'],
        ['tableau', 'Field format from Tableau'],
        ['custom', 'Custom']
      ], labels.numberFormat, 'Label number format');
      labelNumberFormat.addEventListener('change', () => { labels.numberFormat = labelNumberFormat.value; renderForm(); });
      const custom = labels.numberFormat === 'custom';
      const labelFormat = select([['number', 'Number'], ['currency', 'Currency'], ['percent', 'Percentage']], labels.format, 'Custom label format');
      labelFormat.addEventListener('change', () => { labels.format = labelFormat.value; renderForm(); });
      const labelDecimals = numberInput(labels.decimals, 0, 6, 'Label decimal places');
      labelDecimals.addEventListener('change', () => { labels.decimals = clamp(labelDecimals.value, 0, 6, labels.decimals); });
      const labelUnits = select([
        ['none', 'None'],
        ['thousands', 'Thousands (K)'],
        ['millions', 'Millions (M)'],
        ['billions', 'Billions (B)']
      ], labels.units, 'Label display units');
      labelUnits.addEventListener('change', () => { labels.units = labelUnits.value; });
      const labelSymbol = textInput(labels.currencySymbol, '$', 'Label currency symbol', 'symbol-text');
      labelSymbol.addEventListener('input', () => { labels.currencySymbol = labelSymbol.value; });
      labelFormat.disabled = labelDecimals.disabled = !custom;
      labelUnits.disabled = !custom || labels.format === 'percent';
      labelSymbol.disabled = !custom || labels.format !== 'currency';

      const fontSize = numberInput(labels.fontSize, 7, 24, 'Label font size');
      fontSize.addEventListener('change', () => { labels.fontSize = clamp(fontSize.value, 7, 24, labels.fontSize); });
      const colorMode = select([
        ['auto', 'Automatic'],
        ['mark', 'Match mark color'],
        ['custom', 'Custom']
      ], labels.colorMode, 'Label color');
      colorMode.addEventListener('change', () => { labels.colorMode = colorMode.value; renderForm(); });
      const labelColor = element('input', { type: 'color', value: labels.color, 'aria-label': 'Custom label color' });
      labelColor.disabled = labels.colorMode !== 'custom';
      labelColor.addEventListener('input', () => { labels.color = labelColor.value; });
      const position = select([
        ['outside', 'Outside end'],
        ['inside', 'Inside end'],
        ['center', 'Center']
      ], labels.position, 'Label position on bars');
      position.addEventListener('change', () => { labels.position = position.value; });

      const labelsSection = section('Labels', [
        checkbox(labels.show, 'Show mark labels (each measure\'s value on its bar or line point)', checked => { labels.show = checked; }),
        checkbox(labels.showBreakdown, 'Show color breakdown labels (each Color value inside the primary bar)', checked => { labels.showBreakdown = checked; }),
        checkbox(labels.showTotal, 'Show primary total labels (the primary bar total above the bar)', checked => { labels.showTotal = checked; }),
        element('p', {
          class: 'hint',
          text: 'The primary measure is the first measure shown as bars. Breakdown labels need a field on the Color encoding. ' +
            'Format and font settings also apply to the field on the Text encoding.'
        }),
        element('div', { class: 'group-title', text: 'Marks to label' }),
        element('div', { class: 'row' }, [marks, element('span', { text: 'Position on bars' }), position]),
        element('div', { class: 'group-title', text: 'Number format' }),
        element('div', { class: 'row' }, [labelNumberFormat]),
        element('div', { class: 'row' }, [
          labelFormat,
          element('span', { text: 'Decimals' }), labelDecimals,
          element('span', { text: 'Units' }), labelUnits,
          element('span', { text: 'Symbol' }), labelSymbol
        ]),
        element('div', { class: 'group-title', text: 'Font' }),
        element('div', { class: 'row' }, [
          element('span', { text: 'Size' }), fontSize,
          element('span', { text: 'Color' }), colorMode, labelColor,
          checkbox(labels.bold, 'Bold', checked => { labels.bold = checked; })
        ]),
        checkbox(labels.applyToTooltips, 'Use this number format in tooltips', checked => { labels.applyToTooltips = checked; })
      ]);

      // Display
      const tooltips = element('input', { type: 'checkbox', checked: draft.display.tooltips });
      tooltips.addEventListener('change', () => { draft.display.tooltips = tooltips.checked; });
      const displaySection = section('Display', [
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
        for (const member of colorMembers) {
          member.color = member.defaultColor;
          member.fill = 'solid';
        }
        for (const candidate of styleCandidates) {
          for (const value of candidate.values) value.fill = value.defaultFill;
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
        // Keep colors chosen for members that are filtered out right now
        draft.colorGroup.fills = draft.colorGroup.fills || {};
        for (const member of colorMembers) {
          if (member.color === member.defaultColor) delete draft.colorGroup.colors[member.name];
          else draft.colorGroup.colors[member.name] = member.color;
          if (member.fill === 'solid') delete draft.colorGroup.fills[member.name];
          else draft.colorGroup.fills[member.name] = member.fill;
        }
        draft.barStyle.fills = draft.barStyle.fills || {};
        for (const value of getStyleValues()) {
          if (value.fill === value.defaultFill) delete draft.barStyle.fills[value.name];
          else draft.barStyle.fills[value.name] = value.fill;
        }
        handlers.onSave(draft);
      });

      container.append(
        measuresSection,
        priorSection,
        ...(colorSection ? [colorSection] : []),
        styleSection,
        valueAxisSection,
        categoryAxisSection,
        labelsSection,
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
