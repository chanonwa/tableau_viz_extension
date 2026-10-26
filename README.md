# Multi-Measure Combo Chart for Tableau

A local Tableau Viz Extension starter that displays one category and up to 50 numeric measures as a single chart. Each measure can be switched between bars and a line. Each line can independently use a solid, dashed, dotted, or dash-dot pattern; all series share one value axis.

## Run locally

1. Open PowerShell in this folder and run:

   ```powershell
   .\serve.ps1
   ```

2. In a browser, open `http://localhost:8765/`. Outside Tableau, the page shows sample data so you can preview the chart and try changing series types.
3. In Tableau Desktop, open a worksheet and add the extension from `combo.trex` (use the Viz Extension option on the Marks card).
4. Put one discrete field or date (discrete or continuous) on **Category** and one or more numeric measures on **Measures**. Change each measure's mark type (bar or line) and line style in **Format Extension**.

The extension uses Tableau's summary data and refreshes when the worksheet data changes. The value axis is intentionally shared, so measures with very different scales may be hard to compare. Date categories are shown as month and year (for example "May 2026") and sorted oldest to newest.

## Settings

Open the settings from the extension's dropdown on the Marks card (**Format Extension**), the ⚙ button on the chart, or by double-clicking an axis. Settings are saved in the workbook.

- **Measures**: mark type (bar or line), line style, and color for each measure.
- **Value axis** (like Tableau's Edit Axis): title, fixed start and end, include zero, reversed and logarithmic scales, automatic, fixed-interval, or no tick marks, grid lines, and number format (number, currency, or percentage, with decimals and K/M/B units).
- **Category axis**: title and label orientation (horizontal, 45°, or 90°).
- **Display**: show measure values on marks, and turn tooltips on or off.
- **Forecast** (like Tableau's Forecast Options): show or hide the forecast and choose which measures to forecast; length (automatic, one season, or exactly N periods); ignore the last N periods; model (Automatic, Automatic without seasonality, or Custom trend and season, each none, additive, or multiplicative); and 90/95/99% prediction intervals. Forecasts use exponential smoothing, and the automatic model is the candidate with the lowest AICc. Seasonality needs at least two full seasons of data (24 months or 8 quarters). Forecast marks use each measure's mark type in a lighter shade.

## Other features

- **Color**: put a dimension on the **Color** encoding to split the first bar measure into one colored group per value, with a legend above the chart. Choose stacked or side-by-side bars and edit each value's color under **Color** in the settings. Lines and other bar measures show category totals.

- **Text**: put any field on the **Text** encoding to show its value above each category.
- **Tooltip and Detail**: hover a category to see every measure, the Text field, and any fields on Tableau's Tooltip or Detail shelves. If Detail splits a category into several rows, the extension adds the measure values up and lists the distinct detail values.

## Requirements and hosting

- Tableau Desktop with Viz Extensions enabled.
- PowerShell on Windows for the included local static server. It binds to `localhost:8765`.
- The `.trex` manifest points at `http://localhost:8765/index.html`; keep `serve.ps1` running while using the extension.

For Tableau Server or Tableau Cloud, host the page, JavaScript, and Tableau API runtime at an HTTPS URL, update the URL in `combo.trex`, and configure the site to allow the extension. Do not publish the local HTTP URL.

The vendored Tableau Extensions API runtime is from the official [Tableau Extensions API repository](https://github.com/tableau/extensions-api).
