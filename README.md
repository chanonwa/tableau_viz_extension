# Multi-Measure Combo Chart for Tableau

A local Tableau Viz Extension starter that displays one category and up to 50 numeric measures as a single chart. Each measure can be switched between bars and a line. Each line can independently use a solid, dashed, dotted, or dash-dot pattern; all series share one value axis.

This folder contains two extensions. Each has two manifests: one for a local server while developing, and one for the hosted copy on GitHub Pages.

| Extension | Local manifest | Hosted manifest (GitHub Pages) | Hosted page |
| --- | --- | --- | --- |
| Multi-Measure Combo Chart | `combo.trex` | `combo.server.trex` | <https://chanonwa.github.io/tableau_viz_extension/index.html> |
| Anomaly Detection | `anomaly.trex` | `anomaly.server.trex` | <https://chanonwa.github.io/tableau_viz_extension/anomaly.html> |

To just use the extensions, the hosted manifests are the quickest way in: they need no local server and work on Tableau Server and Tableau Cloud. See [Use the hosted version](#use-the-hosted-version-github-pages). To change the code and try it before pushing, [run the server locally](#run-the-server-locally).

## Run the server locally

Use this for Tableau Desktop on your own computer. Tableau Desktop allows extensions from `http://localhost`, so no certificate is needed.

1. Open PowerShell in this folder and run:

   ```powershell
   .\serve.ps1
   ```

   It prints `Serving this extension at http://localhost:8765/` and keeps running until you press **Ctrl+C** or close the window. Keep it running the whole time you use the extensions.

   If Windows blocks the script ("running scripts is disabled on this system"), run it for this session only with:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\serve.ps1
   ```

   On macOS or Linux, or without PowerShell, any static file server on port 8765 works, for example `python3 -m http.server 8765` from this folder.

2. Check it in a browser: `http://localhost:8765/` (combo chart) and `http://localhost:8765/anomaly.html` (anomaly detection). Outside Tableau, both pages show sample data.
3. In Tableau Desktop, open a worksheet, open the mark type dropdown on the Marks card, and choose **Add Extension** > **Access Local Viz Extensions**. Pick `combo.trex` or `anomaly.trex`.
4. For the combo chart, put one discrete field or date (discrete or continuous) on **Category** and one or more numeric measures on **Measures**. Change each measure's mark type (bar or line) and line style in **Format Extension**.

Tableau reads a manifest only when the extension is added. After a change to a `.trex` file (for example a new encoding), remove the extension from the Marks card and add it again. Changes to the HTML or JavaScript only need the extension to reload.

To use a different port, change `http://localhost:8765/` in `serve.ps1` and the `<url>` in both `.trex` files.

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

- **Color**: put a dimension on the **Color** encoding to split the first bar measure into one colored group per value, with a legend above the chart. Choose stacked or side-by-side bars and edit each value's color and fill (solid, hatched, or light) under **Color** in the settings. Lines and other bar measures show category totals.
- **Bar Style**: put a dimension such as Source (Official / Estimate) on Tableau's **Detail** shelf, then choose it under **Format Extension** > **Bar Style** > **Field**. Each value sets the fill of the first bar measure: solid, hatched, or light. Values that read as estimates (Estimate, Forecast, Projected, Preliminary, Provisional) start hatched. It works with or without Color; solid parts stack first, with shaded parts on top, and other bar measures follow it in categories with a single value. Bar Style uses Detail rather than its own slot because Tableau allows at most four custom encodings per viz extension (Category, Measures, Color, and Text).

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

## Use the hosted version (GitHub Pages)

The extensions are hosted from this repository with GitHub Pages at `https://chanonwa.github.io/tableau_viz_extension/`. The site is published from the `main` branch (root folder), so every push to `main` updates the hosted extensions, usually within a minute or two. Viewers get the update the next time the extension loads. GitHub Pages serves over HTTPS, which Tableau Server and Tableau Cloud require.

Open <https://chanonwa.github.io/tableau_viz_extension/index.html> or <https://chanonwa.github.io/tableau_viz_extension/anomaly.html> in a browser to check the hosted pages. Outside Tableau they show sample data.

### In Tableau Desktop

No local server is needed. On a worksheet, open the mark type dropdown on the Marks card, choose **Add Extension** > **Access Local Viz Extensions**, and pick `combo.server.trex` or `anomaly.server.trex`. In the extension list they show as "Multi-Measure Combo Chart (GitHub Pages)" and "Anomaly Detection (GitHub Pages)".

### On Tableau Server or Tableau Cloud

1. **Allow the address on the site.** A site administrator does this once per site:
   1. Open the site's **Settings** > **Extensions**.
   2. Make sure extensions, including viz extensions, are allowed to run on the site. On Tableau Server, the server administrator may also need to enable extensions for the whole server first.
   3. Add `https://chanonwa.github.io` to the safe list, with full data access, because the extensions read the worksheet's summary data.
2. **Build the workbook with the hosted manifests.** In Tableau Desktop, add the extension from `combo.server.trex` or `anomaly.server.trex`, not the local `.trex`, so the workbook stores the HTTPS address rather than `localhost`. A worksheet built with the local manifest has to have its extension removed and added again from the hosted one.
3. **Publish** the workbook to Tableau Server or Tableau Cloud as usual, then open it in a browser to check the chart loads.

Settings made in **Format Extension** are saved in the workbook, so they travel with it when you publish.

If the extension area is blank or shows a warning:

- Check that the hosted page opens in a browser on the same network. Some company networks block `github.io`.
- Check that `https://chanonwa.github.io` is on the site's extension safe list.
- After a push, wait a few minutes for GitHub Pages to update, then reload the workbook.

### Notes on GitHub Pages

- The extension code is public, because the repository and the Pages site are public. Workbook data is not: the extension runs inside Tableau and reads the data in the viewer's browser. Nothing is sent to GitHub.
- GitHub Pages for a private repository needs a paid GitHub plan, and the site stays publicly reachable unless you use GitHub Enterprise access control.
- To change the hosting branch or turn the site off, use the repository's **Settings** > **Pages**.

## Host on another server

If your organisation only allows extensions from its own servers, host the files elsewhere instead of GitHub Pages:

1. Copy the folder to any HTTPS web server or static hosting service (IIS, nginx, Apache, Azure Static Web Apps, Amazon S3 with CloudFront, and so on), keeping the `vendor` subfolder. `README.md`, `serve.ps1`, and the `.trex` files aren't needed there. The server needs a valid certificate and must serve `.js` files as JavaScript.
2. Copy `combo.server.trex` and `anomaly.server.trex` and change the `<url>` in each to the new address, for example:

   ```xml
   <source-location>
     <url>https://extensions.example.com/combo/index.html</url>
   </source-location>
   ```

   The settings dialogs (`settings.html`, `anomaly-settings.html`) are found relative to the page, so they need no change.
3. Add the new address to the site's extension safe list and build the workbook with the new manifests, as in [On Tableau Server or Tableau Cloud](#on-tableau-server-or-tableau-cloud).

## Requirements

- Tableau Desktop, Tableau Server, or Tableau Cloud with viz extensions (Tableau 2024.2 or later).
- For local use: PowerShell on Windows for `serve.ps1` (it binds to `localhost:8765`), or any other static file server on that port.
- For Tableau Server or Tableau Cloud: the hosted manifests (`*.server.trex`) or another HTTPS host, and the hosting address on the site's extension safe list.

The vendored Tableau Extensions API runtime is from the official [Tableau Extensions API repository](https://github.com/tableau/extensions-api).
