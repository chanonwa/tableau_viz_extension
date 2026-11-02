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

  function loadOrders () {
    try {
      return JSON.parse(tableau.extensions.settings.get(ORDER_KEY) || '{}');
    } catch (error) {
      return {};
    }
  }

  // Settings are saved per extension, so each chart keeps its own copy of the color scheme (palette, picked member
  // colors, and color orders). Linked charts share it over a BroadcastChannel (same site only) and agree on the
  // newest copy, so a member has the same color in every chart and a color changed in one chart changes in all.
  const UPDATED_KEY = 'colorSchemeUpdated';
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('chart-colors') : null;
  // { getColors: () => ({ palette, colors }), applyColors({ palette, colors }) (updates the chart's settings without
  // saving them), recolor() }, from linkColors
  let link = null;
  // When this chart's scheme last changed (epoch ms; 0 = before charts shared colors)
  let updated = 0;

  function setSetting (key, value) {
    try {
      tableau.extensions.settings.set(key, value);
    } catch (error) {
      // Outside Tableau; the scheme still holds for this page
    }
  }

  function getScheme () {
    const { palette, colors } = link.getColors();
    return { palette, colors, orders: loadOrders(), updated };
  }

  function getContent (scheme) {
    return JSON.stringify([scheme.palette, scheme.colors, scheme.orders]);
  }

  // The newer scheme wins; equal times (such as two charts set up before colors were shared) are settled by content,
  // so every chart picks the same one
  function isNewer (a, b) {
    return a.updated !== b.updated ? a.updated > b.updated : getContent(a) > getContent(b);
  }

  function share (type) {
    if (link) channel?.postMessage({ type, scheme: getScheme() });
  }

  async function adopt (scheme) {
    // Orders of fields only this chart uses are kept
    setSetting(ORDER_KEY, JSON.stringify({ ...loadOrders(), ...scheme.orders }));
    updated = scheme.updated;
    setSetting(UPDATED_KEY, String(updated));
    link.applyColors({ palette: scheme.palette, colors: { ...scheme.colors } });
    scheduleSave();
    await link.recolor();
  }

  // Joins the shared color scheme. Call once the chart's saved settings are loaded.
  function linkColors (callbacks) {
    link = callbacks;
    try {
      updated = Number(tableau.extensions.settings.get(UPDATED_KEY)) || 0;
    } catch (error) {
      updated = 0;
    }
    share('hello');
  }

  // The user changed the palette or member colors in this chart; call before saving the settings
  function colorsChanged () {
    updated = Date.now();
    setSetting(UPDATED_KEY, String(updated));
    share('scheme');
  }

  if (channel) {
    channel.onmessage = ({ data }) => {
      if (!link) return;
      const mine = getScheme();
      if (getContent(mine) === getContent(data.scheme)) return;
      if (isNewer(data.scheme, mine)) adopt(data.scheme);
      // A chart that just opened has an older scheme: send it this one
      else if (data.type === 'hello') share('scheme');
    };
  }

  // Members of fieldName in palette slot order. names: the members in the data now. Members seen before keep their
  // slot; new ones take the next slots alphabetically, and the order is saved. It reads no filters: asking Tableau for
  // them while it is applying a filter could fail the user's filter action.
  async function getColorOrder (worksheet, fieldName, names) {
    if (!worksheet || !fieldName) return sortMembers(names);
    const orders = loadOrders();
    const order = orders[fieldName] || [];
    const known = new Set(order);
    if (names.every(name => known.has(name))) return order;

    orders[fieldName] = [...order, ...sortMembers(names.filter(name => !known.has(name)))];
    // The linked charts take the new members in the same slots
    updated = Date.now();
    setSetting(ORDER_KEY, JSON.stringify(orders));
    setSetting(UPDATED_KEY, String(updated));
    share('scheme');
    scheduleSave();
    return orders[fieldName];
  }

  // Saves made without the user pressing OK (new color slots, a scheme taken from another chart) wait until the data
  // has settled, so they never run while Tableau is still applying a filter, and run only while authoring: viewers
  // can't save, and the scheme still holds for their session.
  let saveTimer = 0;
  function scheduleSave () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        if (tableau.extensions.environment.mode !== 'authoring') return;
        await tableau.extensions.settings.saveAsync();
      } catch (error) {
        console.warn('Unable to save the color scheme', error);
      }
    }, 3000);
  }

  return { PALETTE_NAMES, DEFAULT_PALETTE, OTHER_COLOR, sortMembers, paletteColor, getColorOrder, linkColors, colorsChanged };
})();
