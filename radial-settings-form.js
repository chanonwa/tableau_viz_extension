'use strict';

// Builds the settings form used by both the Tableau "Format Extension" dialog and the in-page panel.
// payload: { state, defaultState, members: [{ name, isOther }] in display order, centerFields: [name],
//   visibilityCandidates: [field names on Detail or Tooltip] }
window.RadialSettingsForm = (function () {
  const PALETTES = {
    ocean: ['#1d5fa8', '#2f8fe8', '#27b5a6', '#f9c15c', '#b9a0e6', '#5cc8f2', '#f27a6b', '#7d8fa3', '#8fd18a', '#e58bc5'],
    tableau: ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'],
    blues: ['#0b3c7a', '#1d5fa8', '#2f8fe8', '#5cb1f5', '#93ccf8', '#c4e2fb', '#7d8fa3', '#a9b6c4'],
    warm: ['#b8432f', '#e3693f', '#f29a52', '#f9c15c', '#f7dc8e', '#c98f6b', '#8c6d5c', '#d9b8a3'],
    pastel: ['#8ab6e8', '#f7b39b', '#9fd8c8', '#f9d98c', '#c9b5ec', '#f4a8c6', '#b5d99c', '#c7ccd1']
  };
  const PALETTE_NAMES = [
    ['ocean', 'Ocean'],
    ['tableau', 'Tableau 10'],
    ['blues', 'Blues'],
    ['warm', 'Warm'],
    ['pastel', 'Pastel']
  ];
  const OTHER_COLOR = '#bdc1c6';

  // A member's color: its own choice, else the palette color for its position
  function colorFor (state, name, index, isOther) {
    if (state.colors[name]) return state.colors[name];
    if (isOther) return OTHER_COLOR;
    const palette = PALETTES[state.palette] || PALETTES.ocean;
    return palette[index % palette.length];
  }

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

  function build (container, payload, handlers) {
    const draft = JSON.parse(JSON.stringify(payload.state));
    const centerFields = payload.centerFields || [];

    function renderForm () {
      container.replaceChildren();
      const type = draft.chartType;
      const radial = type === 'radial';

      // Chart
      const chart = section('Chart', [
        row('Type', select([
          ['donut', 'Donut'],
          ['pie', 'Pie'],
          ['radial', 'Radial bars (one ring per member)']
        ], type, 'Chart type', value => { draft.chartType = value; renderForm(); })),
        row('Hole size (% of radius)', disable(numberInput(draft.innerRadius, 0, 90, 'Hole size', value => { draft.innerRadius = value; }), type === 'pie')),
        row('Start angle (° clockwise from 12 o\'clock)', numberInput(draft.startAngle, -360, 360, 'Start angle', value => { draft.startAngle = value; })),
        row('Chart spans (°)', disable(select([
          ['360', 'Full circle (360°)'],
          ['270', 'Three quarters (270°)'],
          ['180', 'Half (180°)']
        ], draft.arc, 'Chart spans', value => {
          draft.arc = Number(value);
          // A half donut reads best as a gauge, opening downwards
          if (draft.arc === 180 && draft.startAngle === 0) draft.startAngle = -90;
          if (draft.arc === 270 && draft.startAngle === 0) draft.startAngle = -135;
          renderForm();
        }), radial)),
        row('Longest bar angle (°)', disable(numberInput(draft.sweep, 30, 360, 'Longest bar angle', value => { draft.sweep = value; }), !radial)),
        row('Direction', select([
          ['clockwise', 'Clockwise'],
          ['counterclockwise', 'Counterclockwise']
        ], draft.direction, 'Direction', value => { draft.direction = value; }))
      ]);

      // Slices
      const sameAsBackground = draft.gapColor === '';
      const gapColor = disable(colorInput(draft.gapColor || draft.background, 'Gap color', value => { draft.gapColor = value; }), sameAsBackground);
      const slices = section(radial ? 'Bars' : 'Slices', [
        row(radial ? 'Gap between rings (px)' : 'Gap between slices (px)', numberInput(draft.gap, 0, 12, 'Gap', value => { draft.gap = value; })),
        radial ? null : element('div', { class: 'row' }, [
          'Gap color',
          gapColor,
          checkbox(sameAsBackground, 'Same as background', value => {
            draft.gapColor = value ? '' : draft.background;
            renderForm();
          })
        ]),
        row(radial ? 'Rounded bar ends (px)' : 'Rounded corners (px)', numberInput(draft.cornerRadius, 0, 30, 'Corner radius', value => { draft.cornerRadius = value; })),
        row('Pop out on hover or select (px)', disable(numberInput(draft.explode, 0, 20, 'Pop out distance', value => { draft.explode = value; }), radial)),
        row('Opacity (%)', numberInput(draft.opacity, 10, 100, 'Opacity', value => { draft.opacity = value; }))
      ]);

      // Visible rows: a True/False field on Detail, like the combo chart's Visible categories
      draft.visibility = draft.visibility || { field: '' };
      const candidates = payload.visibilityCandidates || [];
      const visibilitySection = section('Visible rows', [
        element('div', { class: 'row' }, [
          'Use only rows where',
          disable(select(
            [['', 'None (use all rows)'], ...candidates.map(name => [name, name])],
            candidates.includes(draft.visibility.field) ? draft.visibility.field : '',
            'Use only rows where this field is True',
            value => { draft.visibility.field = value; }
          ), candidates.length === 0),
          'is True'
        ]),
        hint('Put a True/False field such as In Date Range on Detail, then choose it here. It works like Visible categories ' +
          'in the combo chart, so the same date range parameter can drive both charts.')
      ]);

      // Sort and group
      const group = section('Sort and group', [
        row('Sort', select([
          ['value-desc', 'Largest first'],
          ['value-asc', 'Smallest first'],
          ['name', 'Alphabetical'],
          ['data', 'Data source order']
        ], draft.sort, 'Sort', value => { draft.sort = value; })),
        row('Show top', numberInput(draft.topN, 0, 100, 'Show top N', value => { draft.topN = Math.round(value); })),
        row('Combine the rest as', textInput(draft.otherLabel, 'Name for the rest', 'number-text', value => { draft.otherLabel = value || 'Other'; })),
        hint('Show top 0 shows every member. Otherwise the smaller members are combined into one slice.')
      ]);

      // Colors
      const swatches = payload.members.map(({ name, isOther }, index) => element('label', { class: 'check' }, [
        colorInput(colorFor(draft, name, index, isOther), `Color for ${name}`, value => { draft.colors[name] = value; }),
        ` ${name}`
      ]));
      const resetColors = element('button', { type: 'button', text: 'Use palette colors' });
      resetColors.addEventListener('click', () => { draft.colors = {}; renderForm(); });
      const colors = section('Colors', [
        row('Palette', select(PALETTE_NAMES, draft.palette, 'Palette', value => { draft.palette = value; renderForm(); })),
        swatches.length > 0
          ? element('div', { class: 'check-list' }, swatches)
          : hint('Add a field to Category to pick a color for each member.'),
        element('div', { class: 'settings-buttons' }, [resetColors])
      ]);

      // Labels
      const labels = draft.labels;
      const outside = labels.position === 'outside' && !radial;
      const labelSection = section('Labels', [
        checkbox(labels.show, radial ? 'Show values beside the names' : 'Show labels', value => { labels.show = value; }),
        row('Show', select([
          ['percent', 'Percent of total'],
          ['value', 'Value'],
          ['both', 'Percent and value'],
          ['name', 'Name'],
          ['name-percent', 'Name and percent']
        ], labels.content, 'Label content', value => { labels.content = value; })),
        row('Position', disable(select([
          ['outside', 'Outside the ring'],
          ['inside', 'Inside the slice']
        ], labels.position, 'Label position', value => { labels.position = value; renderForm(); }), radial)),
        row('Distance from the ring (px)', disable(numberInput(labels.distance, 0, 40, 'Label distance', value => { labels.distance = value; }), !outside)),
        outside ? checkbox(labels.leaderLines, 'Leader lines', value => { labels.leaderLines = value; }) : null,
        row('Hide labels under (% of total)', numberInput(labels.minPercent, 0, 50, 'Hide labels under', value => { labels.minPercent = value; })),
        element('div', { class: 'row' }, [
          'Font size',
          numberInput(labels.fontSize, 8, 24, 'Font size', value => { labels.fontSize = value; }),
          checkbox(labels.bold, 'Bold', value => { labels.bold = value; })
        ]),
        element('div', { class: 'row' }, [
          'Color',
          select([
            ['auto', radial ? 'Automatic (dark gray)' : 'Automatic (gray outside, contrasting inside)'],
            ['slice', 'Same as the slice'],
            ['custom', 'Custom']
          ], labels.colorMode, 'Label color', value => { labels.colorMode = value; renderForm(); }),
          disable(colorInput(labels.color, 'Custom label color', value => { labels.color = value; }), labels.colorMode !== 'custom')
        ])
      ]);
      if (radial) labelSection.append(hint('Radial bars show each name, and the label, beside the start of its ring.'));

      // Center
      const center = draft.center;
      const kpiName = centerFields[0];
      const comparisonName = centerFields[1];
      const centerSection = section('Center', [
        checkbox(center.show, 'Show text in the center', value => { center.show = value; }),
        row('Main value', select([
          ['total', 'Total of the slices'],
          ['kpi', kpiName ? `KPI field (${kpiName})` : 'KPI field (first field on Center)'],
          ['caption', 'None (caption only)']
        ], center.content, 'Center value', value => { center.content = value; })),
        row('Caption', textInput(center.caption, 'Center caption', 'text-input', value => { center.caption = value; })),
        element('div', { class: 'row' }, [
          'Value size (px, 0 = fit)',
          numberInput(center.valueSize, 0, 96, 'Center value size', value => { center.valueSize = value; }),
          'Value color',
          colorInput(center.valueColor, 'Center value color', value => { center.valueColor = value; }),
          'Caption color',
          colorInput(center.captionColor, 'Caption color', value => { center.captionColor = value; })
        ]),
        checkbox(center.showComparison, comparisonName ? `Show comparison (${comparisonName})` : 'Show comparison (second field on Center)', value => { center.showComparison = value; }),
        element('div', { class: 'row' }, [
          'Up color',
          colorInput(center.upColor, 'Up color', value => { center.upColor = value; }),
          'Down color',
          colorInput(center.downColor, 'Down color', value => { center.downColor = value; })
        ]),
        checkbox(center.hoverDetail, 'Show the hovered slice in the center', value => { center.hoverDetail = value; }),
        hint('Donut and radial bars only. For a KPI, drag a measure onto Center, and optionally a second one (for example % vs prior year) ' +
          'for the comparison. Use a calculation that gives one value for the whole chart, such as TOTAL(SUM([Revenue])) or a FIXED calculation.')
      ]);

      // Legend
      const legend = draft.legend;
      const legendSection = section('Legend', [
        row('Position', select([
          ['bottom', 'Below the chart'],
          ['top', 'Above the chart'],
          ['right', 'Right of the chart'],
          ['left', 'Left of the chart'],
          ['none', 'Hidden']
        ], legend.position, 'Legend position', value => { legend.position = value; })),
        element('div', { class: 'check-list' }, [
          checkbox(legend.showPercent, 'Percent column', value => { legend.showPercent = value; }),
          checkbox(legend.showValue, 'Value column', value => { legend.showValue = value; }),
          checkbox(legend.header, 'Header row', value => { legend.header = value; }),
          checkbox(legend.totalRow, 'Total row', value => { legend.totalRow = value; })
        ]),
        row('Font size', numberInput(legend.fontSize, 9, 24, 'Legend font size', value => { legend.fontSize = value; })),
        hint('A legend at the side moves below the chart when the sheet is narrow.')
      ]);

      // Number format
      const number = draft.number;
      const numberSection = section('Number format', [
        row('Values', select([
          ['auto', 'Automatic (from Tableau)'],
          ['number', 'Number'],
          ['currency', 'Currency'],
          ['percent', 'Percentage']
        ], number.format, 'Value format', value => { number.format = value; renderForm(); })),
        row('Units', disable(select([
          ['none', 'None'],
          ['auto', 'Automatic (K, M, B)'],
          ['thousands', 'Thousands (K)'],
          ['millions', 'Millions (M)'],
          ['billions', 'Billions (B)']
        ], number.units, 'Units', value => { number.units = value; }), number.format === 'auto' || number.format === 'percent')),
        row('Decimals', disable(numberInput(number.decimals, 0, 6, 'Decimals', value => { number.decimals = Math.round(value); }), number.format === 'auto')),
        row('Currency symbol', disable(textInput(number.currencySymbol, 'Currency symbol', 'symbol-text', value => { number.currencySymbol = value; }), number.format !== 'currency')),
        row('Percent decimals', numberInput(draft.percentDecimals, 0, 4, 'Percent decimals', value => { draft.percentDecimals = Math.round(value); })),
        hint('Add a trailing space to the symbol for "฿ 61.4M" instead of "฿61.4M".')
      ]);

      // Tooltip
      const tooltip = draft.tooltip;
      const tooltipSection = section('Tooltip', [
        checkbox(draft.display.tooltips, 'Show tooltips', value => { draft.display.tooltips = value; }),
        row('Style', select([
          ['extension', 'Extension (value, percent, and Tooltip fields)'],
          ['tableau', 'Tableau (uses the Tooltip shelf text)']
        ], tooltip.style, 'Tooltip style', value => { tooltip.style = value; renderForm(); })),
        tooltip.style === 'extension'
          ? checkbox(tooltip.showPercent, 'Show percent of total', value => { tooltip.showPercent = value; })
          : hint('Tableau\'s tooltip is used for members drawn from a single mark. Members split by a field on Detail, and the ' +
            'combined "Other" slice, use the extension tooltip.')
      ]);

      // Interaction
      const display = draft.display;
      const interaction = section('Interaction and animation', [
        row('On hover', select([
          ['both', 'Dim the others and pop out'],
          ['dim', 'Dim the others'],
          ['explode', 'Pop out'],
          ['none', 'Nothing']
        ], display.hoverEffect, 'Hover effect', value => { display.hoverEffect = value; })),
        element('div', { class: 'check-list' }, [
          checkbox(display.select, 'Click to select in Tableau', value => { display.select = value; }),
          checkbox(display.animate, 'Animate when the data changes', value => { display.animate = value; }),
          radial ? checkbox(display.track, 'Background track', value => { display.track = value; }) : ''
        ]),
        hint('Clicking a slice or legend row selects its marks, so dashboard filter and highlight actions work. ' +
          'Ctrl+click adds to the selection; click empty space to clear it.')
      ]);

      // Title and background
      const title = draft.title;
      const appearance = section('Title and background', [
        checkbox(title.show, 'Show title', value => { title.show = value; }),
        row('Text', textInput(title.text, 'Title text', 'text-input', value => { title.text = value; })),
        element('div', { class: 'row' }, [
          'Font size',
          numberInput(title.fontSize, 10, 36, 'Title font size', value => { title.fontSize = value; }),
          'Color',
          colorInput(title.color, 'Title color', value => { title.color = value; })
        ]),
        row('Background', colorInput(draft.background, 'Background color', value => { draft.background = value; })),
        hint('Turn off the worksheet title in Tableau if you use this one.')
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
        visibilitySection,
        chart,
        slices,
        group,
        colors,
        labelSection,
        centerSection,
        legendSection,
        numberSection,
        tooltipSection,
        interaction,
        appearance,
        element('div', { class: 'settings-buttons' }, [reset, element('span', { class: 'spacer' }), cancel, save])
      );
    }

    renderForm();
  }

  return { build, colorFor, PALETTES };
})();
