'use strict';

// Palettes and color order shared by the Combo and Radial extensions, so a member gets the same color in both.
// A member's palette color comes from its place in the alphabetical list of every member in the sheet's data,
// counted before Visible rows, Top N or sorting, so none of those recolor it.
window.ChartColors = (function () {
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

  return { PALETTE_NAMES, DEFAULT_PALETTE, OTHER_COLOR, sortMembers, paletteColor };
})();
