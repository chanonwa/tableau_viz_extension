'use strict';

// Palettes and color order shared by the Combo and Radial extensions, so a member gets the same color in both.
// As in Tableau, a member's palette color is fixed: every value of the field gets a slot, alphabetically, the first
// time it is seen, and keeps it. Filters, Visible rows, Top N and sorting never recolor a member.
window.ChartColors = (function () {
  // Saved with the workbook: { fieldName: [member, ...] } in slot order
  const ORDER_KEY = 'colorOrder';
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
  const DEFAULT_PALETTE = 'ocean';
  // The combined "Other" slice
  const OTHER_COLOR = '#bdc1c6';

  // Distinct member names in alphabetical order, as in Tableau's default color legend
  function sortMembers (names) {
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  function paletteColor (palette, index) {
    const colors = PALETTES[palette] || PALETTES[DEFAULT_PALETTE];
    return colors[Math.max(0, index) % colors.length];
  }

  // Every value of the field, including ones a filter hides: the database domain of a filter on that field
  async function getFilterDomain (worksheet, fieldName) {
    try {
      const filters = await worksheet.getFiltersAsync();
      const filter = filters.find(item => item.filterType === tableau.FilterType.Categorical && item.fieldName === fieldName);
      if (!filter) return [];
      const domain = await filter.getDomainAsync(tableau.FilterDomainType.Database);
      return domain.values.map(value => value.formattedValue ?? String(value.value));
    } catch (error) {
      console.warn('Unable to read the filter domain', error);
      return [];
    }
  }

  function loadOrders () {
    try {
      return JSON.parse(tableau.extensions.settings.get(ORDER_KEY) || '{}');
    } catch (error) {
      return {};
    }
  }

  // Members of fieldName in palette slot order. names: the members in the data now. Members seen before keep their
  // slot; new ones (with the rest of the field's values) take the next slots alphabetically, and the order is saved.
  async function getColorOrder (worksheet, fieldName, names) {
    if (!worksheet || !fieldName) return sortMembers(names);
    const orders = loadOrders();
    const order = orders[fieldName] || [];
    const known = new Set(order);
    if (names.every(name => known.has(name))) return order;

    const domain = await getFilterDomain(worksheet, fieldName);
    const added = sortMembers([...domain, ...names].filter(name => !known.has(name)));
    orders[fieldName] = [...order, ...added];
    try {
      tableau.extensions.settings.set(ORDER_KEY, JSON.stringify(orders));
      await tableau.extensions.settings.saveAsync();
    } catch (error) {
      // Viewers can't save settings; the order still holds for this session
      console.warn('Unable to save the color order', error);
    }
    return orders[fieldName];
  }

  return { PALETTE_NAMES, DEFAULT_PALETTE, OTHER_COLOR, sortMembers, paletteColor, getColorOrder };
})();
