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

Open the settings from the extension's dropdown on the Marks card (**Format Extension**) or by double-clicking an axis. Settings are saved in the workbook.

- **Measures**: mark type (bar or line), line style, and color for each measure.
- **Value axis** (like Tableau's Edit Axis): title, fixed start and end, include zero, reversed and logarithmic scales, automatic, fixed-interval, or no tick marks, grid lines, and number format (number, currency, or percentage, with decimals and K/M/B units).
- **Category axis**: title and label orientation (horizontal, 45°, or 90°).
- **Labels** (like Tableau's Label shelf): three independent options: mark labels (each measure's value on its bar or line point), color breakdown labels (each Color value inside the primary bar), and primary total labels (the primary bar total above the bar); label all marks, only the min and max, or only the most recent; number format that follows the value axis (default), uses Tableau's field format, or is custom; font size, color (automatic, match the mark, or custom), and bold; position on bars (outside end, inside end, or center). The format and font also apply to the Text field, and optionally to tooltips.
- **Display**: turn tooltips on or off.
- **Forecast** (like Tableau's Forecast Options): show or hide the forecast and choose which measures to forecast; length (automatic, one season, or exactly N periods); ignore the last N periods; model (Automatic, Automatic without seasonality, or Custom trend and season, each none, additive, or multiplicative); and 90/95/99% prediction intervals. Forecasts use exponential smoothing, and the automatic model is the candidate with the lowest AICc. Seasonality needs at least two full seasons of data (24 months or 8 quarters). Forecast marks use each measure's mark type in a lighter shade.

## Other features

- **Color**: put a dimension on the **Color** encoding to split the first bar measure into one colored group per value, with a legend above the chart. Choose stacked or side-by-side bars and edit each value's color under **Color** in the settings. Lines and other bar measures show category totals.

- **Text**: put any field on the **Text** encoding to show its value above each category.
- **Tooltip and Detail**: hover a category to see every measure, the Text field, and any fields on Tableau's Tooltip or Detail shelves. If Detail splits a category into several rows, the extension adds the measure values up and lists the distinct detail values.

## Anomaly Detection extension

A second, separate Viz Extension in this folder (`anomaly.trex`, served at `http://localhost:8765/anomaly.html`). It shows each measure in its own panel with summary statistics, a written explanation, a shaded normal range, an expected line, spikes (red) and dips (orange), and the seasonal pattern. Below the panels are a breakdown table for drilling down and a list of all anomalies, largest first, each with an explanation. Open `http://localhost:8765/anomaly.html` in a browser to preview it with sample data (Region › Channel breakdown and planted anomalies).

1. With `serve.ps1` running, add the extension from `anomaly.trex` on the Marks card.
2. Put one field or date on **Category** and up to 10 measures on **Measures**.
3. Optionally put up to 3 dimensions on **Breakdown**, in drill order (for example Region, then Category, then Sub-Category). See below.
4. Change the settings from **Format Extension**:
   - **Method**: *Automatic* (trend model for dates with at least 8 points, otherwise IQR); *Trend model* (Holt exponential smoothing, which compares each point with the forecast from the points before it); *Rolling median* (median and MAD of neighbouring points within a window); *Interquartile range* (Q1 − k×IQR to Q3 + k×IQR); or *Z-score* (mean ± k standard deviations).
   - **Sensitivity**: low, medium, or high, or a custom threshold *k*. The default *k* depends on the method.
   - **Flag**: spikes and dips, spikes only, or dips only. **Ignore changes under** hides anomalies whose deviation is smaller than a percentage of the expected value. You can also choose which measures to analyse.
   - **Seasonality**: automatic, always, or never (see below).
   - **Combine rows by**: Sum (default), Average, Minimum, or Maximum. Use Average for AVG measures.
   - **Display**: normal range band, expected line, summary statistics, explanation, seasonal pattern chart, segment table, anomaly list, and tooltips.

### Breakdown and drill-down

With fields on **Breakdown**, the panels show the total across all members, combined with **Combine rows by**. The extension also runs detection on every member's own series. The breakdown table ranks members by how many anomalies they have. Click a row to drill into that member, then into the next Breakdown field. Use the breadcrumb at the top to go back up. Anomalies in the total also name the member that contributed most to the deviation (with its share of the deviation when combining by Sum). Rows in the anomaly list for a member can be clicked to drill into it. Up to 100 members are analysed per level.

### Seasonality

For date categories the season length comes from the date level: months repeat every 12, quarters every 4, weeks every 52 and days every 7 (weekday). The extension splits the series into trend and season (classical additive decomposition with a robust median per position) and reports a strength from 0 to 1. On *Automatic*, seasonality is removed before detection when the strength is at least 0.4, so regular seasonal highs and lows aren't flagged. The expected line and normal range then follow the seasonal pattern. Seasonality needs at least two full cycles (24 months, 8 quarters).

### Explanations

Each panel lists the trend (change from first to last, slope per period), the range and spread, the seasonality (peak and low period with their effect), the largest anomalies, and how they were found. Each anomaly's tooltip and list entry explain how far it is from the expected value and the normal range, the seasonal effect already included, and the biggest contributing Breakdown member.

Statistics include points, mean, median, standard deviation, min, max, total, first-to-last change (dates only), seasonality strength, and anomaly rate. The *score* is the deviation divided by the method's spread (standard deviation, IQR, or robust MAD-based sigma). The analysis runs on the worksheet's aggregated summary data after filters. Anomaly flags stay inside the extension, so they can't be used as a filter on other sheets.

## Requirements and hosting

- Tableau Desktop with Viz Extensions enabled.
- PowerShell on Windows for the included local static server. It binds to `localhost:8765`.
- The `.trex` manifest points at `http://localhost:8765/index.html`; keep `serve.ps1` running while using the extension.

For Tableau Server or Tableau Cloud, host the page, JavaScript, and Tableau API runtime at an HTTPS URL, update the URL in `combo.trex`, and configure the site to allow the extension. Do not publish the local HTTP URL.

The vendored Tableau Extensions API runtime is from the official [Tableau Extensions API repository](https://github.com/tableau/extensions-api).
