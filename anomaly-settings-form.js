'use strict';

// Builds the settings form used by both the Tableau "Format Extension" dialog and the in-page panel.
// payload: { state, defaultState, measures: [name] }
window.AnomalySettingsForm = (function () {
  const METHODS = [
    ['auto', 'Automatic'],
    ['smoothing', 'Trend model (exponential smoothing)'],
    ['rolling', 'Rolling median'],
    ['iqr', 'Interquartile range (IQR)'],
    ['zscore', 'Z-score']
  ];
  const METHOD_HINTS = {
    auto: 'Trend model for dates with at least 8 points, otherwise interquartile range.',
    smoothing: 'Compares each point with a forecast from the points before it. Best for time series with a trend.',
    rolling: 'Compares each point with the median of its neighbours. Handles drifting levels.',
    iqr: 'Flags values beyond Q1 − k×IQR or Q3 + k×IQR. Robust, ignores order.',
    zscore: 'Flags values more than k standard deviations from the mean. Simple, but large outliers widen the range.'
  };

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

  function checkbox (checked, text, onChange) {
    const input = element('input', { type: 'checkbox', checked });
    input.addEventListener('change', () => onChange(input.checked));
    return element('label', { class: 'check' }, [input, ` ${text}`]);
  }

  function section (title, children) {
    return element('fieldset', { class: 'settings-section' }, [element('legend', { text: title }), ...children]);
  }

  function row (label, control) {
    return element('label', { class: 'row' }, [label, control]);
  }

  function build (container, payload, handlers) {
    const draft = JSON.parse(JSON.stringify(payload.state));

    function renderForm () {
      container.replaceChildren();

      // Detection
      const method = select(METHODS, draft.method, 'Method');
      method.addEventListener('change', () => { draft.method = method.value; renderForm(); });

      const sensitivity = select([
        ['low', 'Low (fewer anomalies)'],
        ['medium', 'Medium'],
        ['high', 'High (more anomalies)'],
        ['custom', 'Custom threshold']
      ], draft.sensitivity, 'Sensitivity');
      sensitivity.addEventListener('change', () => { draft.sensitivity = sensitivity.value; renderForm(); });

      const threshold = element('input', {
        type: 'number', min: 0.1, max: 10, step: 0.1, value: draft.threshold, class: 'number-input', 'aria-label': 'Threshold k'
      });
      threshold.disabled = draft.sensitivity !== 'custom';
      threshold.addEventListener('change', () => {
        const value = Number(threshold.value);
        if (value > 0) draft.threshold = value;
      });

      const windowSize = element('input', {
        type: 'number', min: 3, max: 51, step: 1, value: draft.window, class: 'number-input', 'aria-label': 'Window size'
      });
      windowSize.disabled = draft.method !== 'rolling';
      windowSize.addEventListener('change', () => {
        const value = Math.round(Number(windowSize.value));
        if (value >= 3) draft.window = value;
      });

      const direction = select([
        ['both', 'Spikes and dips'],
        ['high', 'Spikes only (above range)'],
        ['low', 'Dips only (below range)']
      ], draft.direction, 'Direction');
      direction.addEventListener('change', () => { draft.direction = direction.value; });

      const detection = section('Detection', [
        row('Method', method),
        element('p', { class: 'hint', text: METHOD_HINTS[draft.method] }),
        row('Sensitivity', sensitivity),
        row('Threshold (k)', threshold),
        row('Window (points)', windowSize),
        row('Flag', direction)
      ]);

      // Measures to analyse
      const selected = new Set(draft.measures ?? payload.measures);
      const measureChecks = payload.measures.map(name => checkbox(selected.has(name), name, checked => {
        if (checked) selected.add(name);
        else selected.delete(name);
        draft.measures = payload.measures.every(measure => selected.has(measure)) ? null : [...selected];
      }));
      const measures = section('Measures', measureChecks.length > 0
        ? [element('div', { class: 'check-list' }, measureChecks)]
        : [element('p', { class: 'hint', text: 'Add measures to the Measures encoding to choose them here.' })]);

      // Display
      const display = draft.display;
      const displaySection = section('Display', [
        element('div', { class: 'check-list' }, [
          checkbox(display.band, 'Normal range band', value => { display.band = value; }),
          checkbox(display.expected, 'Expected line', value => { display.expected = value; }),
          checkbox(display.stats, 'Summary statistics', value => { display.stats = value; }),
          checkbox(display.list, 'Anomaly list', value => { display.list = value; }),
          checkbox(display.tooltips, 'Tooltips', value => { display.tooltips = value; })
        ])
      ]);

      const reset = element('button', { type: 'button', text: 'Reset' });
      reset.addEventListener('click', () => {
        Object.assign(draft, JSON.parse(JSON.stringify(payload.defaultState)));
        renderForm();
      });
      const cancel = element('button', { type: 'button', text: 'Cancel' });
      cancel.addEventListener('click', () => handlers.onCancel());
      const save = element('button', { type: 'button', class: 'primary', text: 'OK' });
      save.addEventListener('click', () => handlers.onSave(draft));

      container.append(
        detection,
        measures,
        displaySection,
        element('div', { class: 'settings-buttons' }, [reset, element('span', { class: 'spacer' }), cancel, save])
      );
    }

    renderForm();
  }

  return { build };
})();
