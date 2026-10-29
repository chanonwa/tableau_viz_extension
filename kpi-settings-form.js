'use strict';

// Builds the settings form used by both the Tableau "Format Extension" dialog and the in-page panel.
// payload: { state, defaultState, fields: { value, target, attainment, changes: [name], trend } (encoded field
//   names, '' when empty), detailFields: [field names on Detail or Tooltip] }
window.KpiSettingsForm = (function () {
  // Color presets; picking one fills in every color of the card
  const THEMES = {
    light: {
      label: 'Light',
      colors: {
        page: '#ffffff',
        card: '#ffffff',
        border: '#dfe3e8',
        title: '#1f3b73',
        value: '#1a56c7',
        text: '#202124',
        muted: '#5f6368',
        accent: '#1a73e8',
        track: '#e8eaed'
      }
    },
    plain: {
      label: 'Light, gray text',
      colors: {
        page: '#ffffff',
        card: '#ffffff',
        border: '#dadce0',
        title: '#5f6368',
        value: '#202124',
        text: '#202124',
        muted: '#80868b',
        accent: '#5f6368',
        track: '#e8eaed'
      }
    },
    dark: {
      label: 'Dark',
      colors: {
        page: '#0b0b0b',
        card: '#161616',
        border: '#2e2e2e',
        title: '#bdc1c6',
        value: '#ffffff',
        text: '#f1f3f4',
        muted: '#9aa0a6',
        accent: '#e8eaed',
        track: '#3c4043'
      }
    }
  };

  // Icons drawn on a 24 × 24 grid as stroked shapes: [element, attributes]
  const ICONS = {
    coins: {
      label: 'Coins',
      shapes: [
        ['ellipse', { cx: 12, cy: 6, rx: 7, ry: 3 }],
        ['path', { d: 'M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6' }],
        ['path', { d: 'M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6' }]
      ]
    },
    target: {
      label: 'Target',
      shapes: [
        ['circle', { cx: 12, cy: 12, r: 9 }],
        ['circle', { cx: 12, cy: 12, r: 5 }],
        ['circle', { cx: 12, cy: 12, r: 1.2 }]
      ]
    },
    bars: {
      label: 'Bar chart',
      shapes: [
        ['path', { d: 'M4 20h16' }],
        ['path', { d: 'M7 16v-4M12 16V6M17 16v-7', 'stroke-width': 3 }]
      ]
    },
    pie: {
      label: 'Pie chart',
      shapes: [
        ['path', { d: 'M11 4a8 8 0 1 0 8 9h-8z' }],
        ['path', { d: 'M14 2.5a8 8 0 0 1 7 7h-7z' }]
      ]
    },
    trend: {
      label: 'Trend up',
      shapes: [
        ['path', { d: 'M3 17l6-6 4 4 8-8' }],
        ['path', { d: 'M15 7h6v6' }]
      ]
    },
    wallet: {
      label: 'Banknote',
      shapes: [
        ['rect', { x: 2.5, y: 6, width: 19, height: 12, rx: 2 }],
        ['circle', { cx: 12, cy: 12, r: 2.5 }],
        ['path', { d: 'M6 9.5v5M18 9.5v5' }]
      ]
    },
    calendar: {
      label: 'Calendar',
      shapes: [
        ['rect', { x: 3.5, y: 5, width: 17, height: 15, rx: 2 }],
        ['path', { d: 'M3.5 10h17M8 3v4M16 3v4' }]
      ]
    },
    users: {
      label: 'People',
      shapes: [
        ['circle', { cx: 9, cy: 8, r: 3.5 }],
        ['path', { d: 'M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6' }],
        ['circle', { cx: 17, cy: 9, r: 2.5 }],
        ['path', { d: 'M17 14c2.7.3 4.5 2.4 4.5 5.5' }]
      ]
    },
    percent: {
      label: 'Percent',
      shapes: [
        ['path', { d: 'M19 5L5 19' }],
        ['circle', { cx: 7, cy: 7, r: 2.5 }],
        ['circle', { cx: 17, cy: 17, r: 2.5 }]
      ]
    }
  };

  const AGGREGATIONS = [
    ['auto', 'Automatic'],
    ['sum', 'Sum'],
    ['avg', 'Average'],
    ['min', 'Minimum'],
    ['max', 'Maximum'],
    ['first', 'First row'],
    ['last', 'Last row (latest)']
  ];

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

  function select (options, value, label, onChange) {
    const node = element('select', { 'aria-label': label });
    for (const [optionValue, text] of options) {
      node.appendChild(element('option', { value: optionValue, text }));
    }
    node.value = String(value);
    node.addEventListener('change', () => onChange(node.value));
    return node;
  }

  function checkbox (checked, text, onChange) {
    const input = element('input', { type: 'checkbox', checked });
    input.addEventListener('change', () => onChange(input.checked));
    return element('label', { class: 'check' }, [input, ` ${text}`]);
  }

  function numberInput (value, min, max, label, onChange) {
    const input = element('input', { type: 'number', min, max, step: 1, value, class: 'number-input', 'aria-label': label });
    input.addEventListener('change', () => {
      const number = Number(input.value);
      if (Number.isFinite(number)) onChange(Math.min(max, Math.max(min, number)));
    });
    return input;
  }

  function textInput (value, label, className, onChange) {
    const input = element('input', { type: 'text', value, class: className, 'aria-label': label });
    input.addEventListener('input', () => onChange(input.value));
    return input;
  }

  function colorInput (value, label, onChange) {
    const input = element('input', { type: 'color', value, 'aria-label': label });
    input.addEventListener('input', () => onChange(input.value));
    return input;
  }

  function section (title, children) {
    return element('fieldset', { class: 'settings-section' }, [element('legend', { text: title }), ...children.filter(Boolean)]);
  }

  function row (label, control) {
    return element('label', { class: 'row' }, [label, control]);
  }

  function hint (text) {
    return element('p', { class: 'hint', text });
  }

  function disable (control, disabled) {
    control.disabled = disabled;
    return control;
  }

  const TEMPLATE_HINT = 'In text boxes, {value}, {target}, {attainment}, {gap}, {marker}, {latest} (the last Trend member), ' +
    '{change1}, {change2}, or any field name in braces, such as {Prior Year Label}, is replaced by its value.';

  function build (container, payload, handlers) {
    const draft = JSON.parse(JSON.stringify(payload.state));
    const fields = payload.fields || { changes: [] };
    const detailFields = payload.detailFields || [];
    const hasAttainment = Boolean(fields.attainment || fields.target);

    function renderForm () {
      container.replaceChildren();

      // Title and background
      const title = draft.title;
      const colors = draft.colors;
      const colorRow = (pairs) => element('div', { class: 'row' }, pairs.flatMap(([key, label]) => [
        label,
        colorInput(colors[key], label, value => { colors[key] = value; })
      ]));
      const appearance = section('Title and background', [
        checkbox(title.show, 'Show title', value => { title.show = value; }),
        row('Text', textInput(title.text, 'Title text', 'text-input', value => { title.text = value; })),
        row('Font size', numberInput(title.fontSize, 9, 32, 'Title font size', value => { title.fontSize = value; })),
        row('Icon', select([['none', 'None'], ...Object.entries(ICONS).map(([name, icon]) => [name, icon.label])],
          draft.icon.name, 'Icon', value => { draft.icon.name = value; })),
        row('Theme', select([['', 'Choose to apply…'], ...Object.entries(THEMES).map(([name, theme]) => [name, theme.label])], '', 'Theme', value => {
          if (THEMES[value]) Object.assign(colors, THEMES[value].colors);
          renderForm();
        })),
        colorRow([['page', 'Background'], ['card', 'Card'], ['border', 'Border'], ['track', 'Bar track']]),
        colorRow([['title', 'Title'], ['value', 'Value'], ['text', 'Text'], ['muted', 'Gray text'], ['accent', 'Accent']]),
        element('div', { class: 'row' }, [
          'Align',
          select([['left', 'Left'], ['center', 'Center'], ['right', 'Right']], draft.align, 'Horizontal alignment', value => { draft.align = value; }),
          select([['top', 'Top'], ['middle', 'Middle']], draft.verticalAlign, 'Vertical alignment', value => { draft.verticalAlign = value; })
        ]),
        element('div', { class: 'row' }, [
          checkbox(draft.border, 'Border', value => { draft.border = value; }),
          'Corner radius (px)',
          numberInput(draft.radius, 0, 30, 'Corner radius', value => { draft.radius = value; })
        ]),
        hint('Leave the title text empty to use the Value field\'s name. The accent colors the icon, the trend line, and ' +
          'the bar when it isn\'t colored by status. Turn off the worksheet title in Tableau if you use this one.')
      ]);

      // Visible rows: a True/False field on Detail, like the radial chart's
      const visibilitySection = section('Visible rows', [
        element('div', { class: 'row' }, [
          'Use only rows where',
          disable(select(
            [['', 'None (use all rows)'], ...detailFields.map(name => [name, name])],
            detailFields.includes(draft.visibility.field) ? draft.visibility.field : '',
            'Use only rows where this field is True',
            value => { draft.visibility.field = value; }
          ), detailFields.length === 0),
          'is True'
        ]),
        hint('Put a True/False field such as In Date Range on Detail, then choose it here. It works like Visible rows in ' +
          'the radial chart and Visible categories in the combo chart, so the same date range parameter drives all of them. ' +
          'Dashboard filters and parameters apply as on any sheet.')
      ]);

      // Combine rows
      const aggregation = draft.aggregation;
      const aggregationRows = [
        ['value', `Value${fields.value ? ` (${fields.value})` : ''}`, true],
        ['target', `Target${fields.target ? ` (${fields.target})` : ''}`, Boolean(fields.target)],
        ['attainment', `Attainment${fields.attainment ? ` (${fields.attainment})` : ''}`, Boolean(fields.attainment)],
        ['change', 'Change fields', fields.changes.length > 0],
        ['marker', 'Bar marker', Boolean(draft.progress.markerField)]
      ].map(([key, label, available]) => row(label, disable(select(AGGREGATIONS, aggregation[key], label, value => { aggregation[key] = value; }), !available)));
      const combineSection = section('Combine rows', [
        ...aggregationRows,
        hint('Used when the sheet has more than one row, for example with a Trend dimension or a field on Detail. ' +
          'Automatic uses a value that is the same on every row as it is; otherwise Value and Target add up and the ' +
          'others take the last row. A sheet of AGG calculations with no dimensions has one row and needs none of this.')
      ]);

      // Value
      const value = draft.value;
      const valueSection = section('Value', [
        row('Font size', numberInput(value.fontSize, 12, 72, 'Value font size', size => { value.fontSize = size; })),
        row('Text beside the value', textInput(value.note, 'Text beside the value', 'text-input', text => { value.note = text; })),
        checkbox(value.colorByStatus, 'Color the value by status', checked => { value.colorByStatus = checked; }),
        hint('For example "of {target}" beside the value.')
      ]);

      // Target and status
      const status = draft.status;
      const statusSection = section('Target and status', [
        checkbox(status.show, 'Show the status (on target, near target, below target)', checked => { status.show = checked; }),
        row('Compare attainment with', select([
          ['target', '100% of the target'],
          ['marker', 'The bar marker (pace), e.g. the share of the year gone']
        ], status.basis, 'Compare attainment with', basis => { status.basis = basis; })),
        row('Near target from (% of the goal)', numberInput(status.near, 0, 100, 'Near target from', near => { status.near = near; })),
        ...['on', 'near', 'below'].map(key => element('div', { class: 'row' }, [
          textInput(status.labels[key], `${key} label`, 'label-text', text => { status.labels[key] = text; }),
          colorInput(status.colors[key], `${key} color`, color => { status.colors[key] = color; })
        ])),
        hint((hasAttainment ? '' : 'Put a measure on Target or Attainment to use this. ') +
          'Attainment is the Attainment field, or Value ÷ Target. Green and red also color the Change lines.')
      ]);

      // Progress bar
      const progress = draft.progress;
      const progressSection = section('Progress bar', [
        checkbox(progress.show, 'Show a bar of the attainment', checked => { progress.show = checked; }),
        element('div', { class: 'row' }, [
          'Full bar (% of the target)',
          numberInput(progress.max, 10, 1000, 'Full bar', max => { progress.max = max; }),
          checkbox(progress.showPercent, 'Show the percent', checked => { progress.showPercent = checked; })
        ]),
        row('Marker', disable(select(
          [['', 'None'], ...detailFields.map(name => [name, name])],
          detailFields.includes(progress.markerField) ? progress.markerField : '',
          'Marker field',
          field => { progress.markerField = field; renderForm(); }
        ), detailFields.length === 0)),
        row('Caption under the bar', textInput(progress.caption, 'Caption under the bar', 'text-input', text => { progress.caption = text; })),
        checkbox(progress.colorByStatus, 'Color the bar by status (otherwise the accent color)', checked => { progress.colorByStatus = checked; }),
        hint('The marker is a fraction on Detail, such as the share of the year gone (0.75 for 75%), drawn as a line on the bar. ' +
          'For example, a caption of "Target {target} · gap {gap}".')
      ]);

      // Change lines
      const changeRows = draft.changes.map((change, index) => {
        const name = fields.changes[index];
        return element('div', {}, [
          element('p', { class: 'group-title', text: name ? `Change ${index + 1}: ${name}` : `Change ${index + 1} (empty)` }),
          element('div', { class: 'row' }, [
            'Text after it',
            textInput(change.label, `Change ${index + 1} text`, 'text-input', text => { change.label = text; })
          ]),
          element('div', { class: 'row' }, [
            'Show as',
            select([
              ['auto', 'Automatic (Tableau format)'],
              ['percent', 'Percent'],
              ['points', 'Points (difference of two rates)'],
              ['number', 'Number (value format)']
            ], change.format, `Change ${index + 1} format`, format => { change.format = format; }),
            checkbox(change.higherIsBetter, 'Higher is better', checked => { change.higherIsBetter = checked; }),
            checkbox(change.showSign, '+/− sign', checked => { change.showSign = checked; })
          ])
        ]);
      });
      const changeSection = section('Change lines', [
        ...changeRows,
        hint('Put up to two change measures on Change, such as % vs prior year. Each shows ▲ in green or ▼ in red ' +
          '(reversed when lower is better), then its text. Points show 0.012 as 1.2 pts.')
      ]);

      // Trend
      const sparkline = draft.sparkline;
      const trendSection = section('Trend line', [
        checkbox(sparkline.show, 'Show a trend line beside the value', checked => { sparkline.show = checked; }),
        checkbox(sparkline.area, 'Shade under the line', checked => { sparkline.area = checked; }),
        hint(fields.trend
          ? `Draws the Value for each ${fields.trend}, in the accent color.`
          : 'Put a dimension such as MONTH(Date) on Trend to draw the Value over time beside it.')
      ]);

      // Footer
      const footer = element('textarea', { rows: 3, class: 'text-area', 'aria-label': 'Text at the bottom' });
      footer.value = draft.footer;
      footer.addEventListener('input', () => { draft.footer = footer.value; });
      const footerSection = section('Text at the bottom', [
        footer,
        hint(`One line per line, for example "{attainment} of its {target} target". ${TEMPLATE_HINT}`)
      ]);

      // Number format
      const number = draft.number;
      const numberSection = section('Number format', [
        row('Values', select([
          ['auto', 'Automatic (from Tableau)'],
          ['number', 'Number'],
          ['currency', 'Currency'],
          ['percent', 'Percentage']
        ], number.format, 'Value format', format => { number.format = format; renderForm(); })),
        row('Units', disable(select([
          ['none', 'None'],
          ['auto', 'Automatic (K, M, B)'],
          ['thousands', 'Thousands (K)'],
          ['millions', 'Millions (M)'],
          ['billions', 'Billions (B)']
        ], number.units, 'Units', units => { number.units = units; }), number.format === 'auto' || number.format === 'percent')),
        row('Decimals', disable(numberInput(number.decimals, 0, 6, 'Decimals', decimals => { number.decimals = Math.round(decimals); }), number.format === 'auto')),
        row('Currency symbol', disable(textInput(number.currencySymbol, 'Currency symbol', 'symbol-text', symbol => { number.currencySymbol = symbol; }), number.format !== 'currency')),
        row('Percent decimals', numberInput(draft.percentDecimals, 0, 4, 'Percent decimals', decimals => { draft.percentDecimals = Math.round(decimals); })),
        hint('Value, Target, and gap use this format; Automatic keeps the format set on the field in Tableau.')
      ]);

      // Animation
      const display = draft.display;
      const animationSection = section('Animation', [
        element('div', { class: 'check-list' }, [
          checkbox(display.animate, 'Animate when the data changes', checked => { display.animate = checked; }),
          checkbox(display.syncAnimation, 'Animate together with the other charts', checked => { display.syncAnimation = checked; })
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

      // Same order as the combo and radial charts' settings: title, data, the card's own sections, number format,
      // animation
      container.append(
        appearance,
        visibilitySection,
        combineSection,
        valueSection,
        statusSection,
        progressSection,
        changeSection,
        trendSection,
        footerSection,
        numberSection,
        animationSection,
        element('div', { class: 'settings-buttons' }, [reset, element('span', { class: 'spacer' }), cancel, save])
      );
    }

    renderForm();
  }

  return { build, THEMES, ICONS };
})();
