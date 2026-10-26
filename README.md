# Multi-Measure Combo Chart for Tableau

A local Tableau Viz Extension starter that displays one category and up to 50 numeric measures as a single chart. Each measure can be switched between bars and a line. Each line can independently use a solid, dashed, dotted, or dash-dot pattern; all series share one value axis.

## Run locally

1. Open PowerShell in this folder and run:

   ```powershell
   .\serve.ps1
   ```

2. In a browser, open `http://localhost:8765/`. Outside Tableau, the page shows sample data so you can preview the chart and try changing series types.
3. In Tableau Desktop, open a worksheet and add the extension from `combo.trex` (use the Viz Extension option on the Marks card).
4. Put one discrete field or date (discrete or continuous) on **Category** and one or more numeric measures on **Measures**. Click any series control above the chart to toggle it between bar and line. Use the adjacent selector to set the pattern for that measure's line; the selector is enabled when the measure is a line.

The extension uses Tableau's summary data and refreshes when the worksheet data changes. The value axis is intentionally shared, so measures with very different scales may be hard to compare. Date categories are shown as month and year (for example "May 2026") and sorted oldest to newest.

## Features

- **Forecast**: when Category is a month, quarter, or year date with at least 3 points, choose a measure and 1–12 periods under the series controls. The extension fits a linear trend to the visible points and draws it as a dashed line with a shaded 80% prediction range. Choose **None** to hide it.
- **Text**: put any field on the **Text** encoding to show its value above each category.
- **Tooltip and Detail**: hover a category to see every measure, the Text field, and any fields on Tableau's Tooltip or Detail shelves. If Detail splits a category into several rows, the extension adds the measure values up and lists the distinct detail values.
- **Settings** (⚙ button): change each measure's color with a color picker or hex code, reset colors, show measure values on marks, and turn tooltips on or off.

Settings, series types, and forecast choices last until the extension reloads; they are not saved in the workbook.

## Requirements and hosting

- Tableau Desktop with Viz Extensions enabled.
- PowerShell on Windows for the included local static server. It binds to `localhost:8765`.
- The `.trex` manifest points at `http://localhost:8765/index.html`; keep `serve.ps1` running while using the extension.

For Tableau Server or Tableau Cloud, host the page, JavaScript, and Tableau API runtime at an HTTPS URL, update the URL in `combo.trex`, and configure the site to allow the extension. Do not publish the local HTTP URL.

The vendored Tableau Extensions API runtime is from the official [Tableau Extensions API repository](https://github.com/tableau/extensions-api).
