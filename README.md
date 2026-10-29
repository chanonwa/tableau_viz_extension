# Multi-Measure Combo Chart for Tableau

A local Tableau Viz Extension starter that displays one category and up to 50 numeric measures as a single chart. Each measure can be switched between bars and a line. Each line can independently use a solid, dashed, dotted, or dash-dot pattern; all series share one value axis.

This folder contains four extensions. Each has two manifests: one for a local server while developing, and one for the hosted copy on GitHub Pages.

| Extension | Local manifest | Hosted manifest (GitHub Pages) | Hosted page |
| --- | --- | --- | --- |
| Multi-Measure Combo Chart | `combo.trex` | `combo.server.trex` | <https://chanonwa.github.io/tableau_viz_extension/index.html> |
| Anomaly Detection | `anomaly.trex` | `anomaly.server.trex` | <https://chanonwa.github.io/tableau_viz_extension/anomaly.html> |
| Radial Chart | `radial.trex` | `radial.server.trex` | <https://chanonwa.github.io/tableau_viz_extension/radial.html> |
| KPI Card | `kpi.trex` | `kpi.server.trex` | <https://chanonwa.github.io/tableau_viz_extension/kpi.html> |

To just use the extensions, the hosted manifests are the quickest way in: they need no local server and work on Tableau Server and Tableau Cloud. See [Use the hosted version](#use-the-hosted-version-github-pages). To change the code and try it before pushing, [run the server locally](#run-the-server-locally). If you work on this repository with others, read [Collaboration](#collaboration) first: every push to `main` goes live for everyone using the hosted extensions.

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

2. Check it in a browser: `http://localhost:8765/` (combo chart) and `http://localhost:8765/anomaly.html` (anomaly detection) and `http://localhost:8765/radial.html` (radial chart) and `http://localhost:8765/kpi.html` (KPI card). Outside Tableau, the pages show sample data.
3. In Tableau Desktop, open a worksheet, open the mark type dropdown on the Marks card, and choose **Add Extension** > **Access Local Viz Extensions**. Pick `combo.trex`, `anomaly.trex`, `radial.trex`, or `kpi.trex`.
4. For the combo chart, put one discrete field or date (discrete or continuous) on **Category** and one or more numeric measures on **Measures**. Change each measure's mark type (bar or line) and line style in **Format Extension**.

Tableau reads a manifest only when the extension is added. After a change to a `.trex` file (for example a new encoding), remove the extension from the Marks card and add it again. Changes to the HTML or JavaScript only need the extension to reload.

To use a different port, change `http://localhost:8765/` in `serve.ps1` and the `<url>` in each local `.trex` file.

The extension uses Tableau's summary data and refreshes when the worksheet data changes. The value axis is intentionally shared, so measures with very different scales may be hard to compare. Date categories are shown as month and year (for example "May 2026") and sorted oldest to newest.

## Settings

Open the settings from the extension's dropdown on the Marks card (**Format Extension**) or by double-clicking an axis. Settings are saved in the workbook.

- **Title and background**: an optional title with its own font size and color, for when the worksheet title is turned off; the background color.
- **Visible categories**: draw only the categories where a True/False field on **Detail** is True, for example an `In Date Range` calculation driven by a date-range parameter. Use this instead of putting the field on the Filters shelf when Prior period is on: Tableau doesn't send filtered-out months to the extension, so Prior period couldn't look back into them. Months hidden this way still reach the extension and feed Prior period. The Color and Bar Style legends list only the values in visible categories.
- **Measures**: mark type (bar or line), line style, and color for each measure; a display name that replaces the field name (for example *Revenue* for *SUM(Revenue)*) in the legend, tooltips, and axis title; and whether the measure appears in the legend. A bar measure split by Color starts out of the legend, since the Color legend already names its parts.
- **Prior period**: replace a measure with another measure's category total N periods earlier, worked out by the extension (for example, replace `Prior_Revenue_12m` with `SUM(Revenue)` from 12 periods earlier). Use it when a prior-period table calculation such as `LOOKUP(SUM([Revenue]), -12)` shows wrong totals in the chart. With fields on Color or Detail, Tableau calculates it separately for each part (e.g. each Product Group × Source), and parts with no row 12 periods back, such as new Estimate rows, return nothing. Where the earlier period isn't in the chart, Tableau's own value is kept.
- **Labels** (like Tableau's Label shelf): three independent options: mark labels (each measure's value on its bar or line point), color breakdown labels (each Color value inside the primary bar), and primary total labels (the primary bar total above the bar); label all marks, only the min and max, or only the most recent; number format that follows the value axis (default), uses Tableau's field format, or is custom; font size, color (automatic, match the mark, or custom), and bold; position on bars (outside end, inside end, or center). The format and font also apply to the Text field, and optionally to tooltips.
- **Value axis** (like Tableau's Edit Axis): title, fixed start and end, include zero, reversed and logarithmic scales, automatic, fixed-interval, or no tick marks, grid lines, and number format (number, currency, or percentage, with decimals and K/M/B units).
- **Category axis**: title and label orientation (horizontal, 45°, or 90°).
- **Forecast** (like Tableau's Forecast Options): show or hide the forecast and choose which measures to forecast; length (automatic, one season, or exactly N periods); ignore the last N periods; model (Automatic, Automatic without seasonality, or Custom trend and season, each none, additive, or multiplicative); and 90/95/99% prediction intervals. Forecasts use exponential smoothing, and the automatic model is the candidate with the lowest AICc. Seasonality needs at least two full seasons of data (24 months or 8 quarters). Forecast marks use each measure's mark type in a lighter shade.
- **Tooltip**: turn tooltips on or off, and use the label number format in them.
- **Animation**: animate when the data changes (bars grow from the axis, lines draw in from the left, and labels fade in), and animate together with the radial chart and KPI cards.

Both extensions list their Format Extension sections in the same order: title and background, visible rows or categories, the chart's marks, colors, labels, chart-specific sections, tooltip, then interaction and animation.

## Other features

- **Color**: put a dimension on the **Color** encoding to split the first bar measure into one colored group per value. The legend above the chart is one line: the Color values, then the Bar Style values, then the measures, with extra space between the groups. Choose stacked or side-by-side bars, a palette (shared with the radial chart; as in Tableau, each member keeps its color when a filter hides other members, and the same member gets the same color in both), and each value's color and fill (solid, hatched, or light) under **Color** in the settings. Lines and other bar measures show category totals.
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

## Radial Chart extension

A third, separate Viz Extension (`radial.trex`, served at `http://localhost:8765/radial.html`) for showing how a total splits across members: a donut with the total in the center, percent labels around the ring, and a legend table with each member's percent and value. It can also draw a pie, or radial bars (one ring per member, the longest spanning 270°). Open `http://localhost:8765/radial.html` in a browser to preview it with sample revenue data.

1. With `serve.ps1` running, add the extension from `radial.trex` on the Marks card.
2. Put a dimension on **Category** (each member becomes a slice) and a measure on **Value**. Fields on **Tooltip** are listed in the tooltip. Fields on **Detail** are combined per member (numbers are added up). For a target, put the target measure on **Detail** too and choose it under **Target** in the settings.
3. Optionally put a KPI measure on **Center**, and a second measure (for example % vs prior year) for a comparison line that shows green with ▲ when positive and red with ▼ when negative. The extension gets one value per member, so use a calculation that gives one value for the whole chart, such as `TOTAL(SUM([Revenue]))`, a `WINDOW_SUM`, or a `FIXED` calculation; otherwise the member values are added up.
4. Open **Format Extension** on the Marks card to change:
   - **Title and background**: an optional title with its own font size and color, for when the worksheet title is turned off; the background color.
   - **Visible rows**: uses only rows where a True/False field on **Detail** is True, such as an `In Date Range` test driven by a date range parameter. It works like the combo chart's *Visible categories*, so one parameter can drive both charts. The field isn't listed in the tooltip.
   - **Target**: a target measure on **Detail**. Each member's value is shown as a percent of its target (*% of target*) in the legend, the tooltip, and the center when the slice is hovered; the *Other* slice and the total row compare against the sum of their targets. Optionally colored green when the target is met and red when it isn't, in colors you choose.
   - **Chart**: donut, pie, or radial bars; hole size; start angle; how much of the circle the chart spans (full, three quarters, or half for a gauge-style half donut); longest bar angle (radial bars); clockwise or counterclockwise.
   - **Slices**: gap between slices and its color (the background color by default, or any color for a border look); rounded corners (rounded bar ends for radial bars); how far a hovered or selected slice pops out; opacity.
   - **Sort and group**: largest first, smallest first, alphabetical, or data source order; and *Show top N*, which combines the smaller members into one slice (named *Other* by default).
   - **Colors**: a palette (Ocean, Tableau 10, Blues, Warm, Pastel) and a color for each member. As in Tableau, palette colors are fixed per member: every value of the field gets a palette slot, alphabetically, the first time the sheet sees it (including values hidden by a filter on that field), and keeps it. Filtering, sorting, the date range and Top N never recolor a member, and the combo chart uses the same rule, so a member matches across both.
   - **Labels**: percent, value, both, name, or name and percent; outside the ring (with an adjustable distance and optional leader lines) or inside the slice; a minimum share below which labels are hidden; font size and bold; color (automatic, the slice color, or a custom color).
   - **Center**: the total, the KPI from the Center encoding, or the caption only; the caption (*Total* by default); value size and colors; the comparison line and its up and down colors; and whether hovering a slice shows its value, name, and percent (and % of target) in the center. Every member's hover text uses the same sizes, so it sits in the same place whichever slice is hovered.
   - **Legend**: below, above, right, or left of the chart (side legends move below on narrow sheets), or hidden; which columns show (share, value, target, % of target); whether each column's name shows in a header row above the members, and its text (the field name, *Share*, or *% of target* when left empty); total row; font size.
   - **Number format**: Automatic (the field's Tableau format), number, currency, or percentage; units (none, automatic K/M/B, thousands, millions, billions); decimals; currency symbol (end it with a space, as in ฿ followed by a space, to get "฿ 61.4M"); percent decimals.
   - **Tooltip**: on or off; the extension's tooltip (value, percent of total, and Tooltip fields) or Tableau's own tooltip from the Tooltip shelf. Tableau's tooltip is used for members drawn from a single mark; members split by a field on Detail and the *Other* slice use the extension's tooltip.
   - **Interaction and animation**: on hover, dim the other slices, pop the slice out, both, or nothing; click to select in Tableau; sweep the slices in when the data changes, together with the combo chart and KPI cards; the background track behind radial bars.

**Linked animation.** With *Animate together* on, the combo chart, radial chart, and KPI cards on one dashboard animate in step: when one gets new data (for example from a shared date range parameter), the others replay their animations from the same moment, and a chart whose data arrives a little later joins in part way, so both finish together. The extensions talk through the browser (`chart-sync.js`), so this works when both are served from the same site, such as the GitHub Pages copies.

Clicking a slice or legend row selects that member's marks in Tableau, so dashboard filter and highlight actions run from it. Ctrl+click (Cmd+click on a Mac) adds to or removes from the selection, and clicking empty space clears it.

Percentages are each member's share of the total of the members shown, after filters. Zero and negative values can't be drawn as slices, so they are left out and counted in a note at the bottom of the chart.

## KPI Card extension

A fourth Viz Extension (`kpi.trex`, served at `http://localhost:8765/kpi.html`) that draws one KPI card per worksheet: a title and optional icon, the value, a target status (on target, near target, below target), a progress bar of the attainment with an optional pace marker, up to two change lines (▲ green or ▼ red), a trend line, and free text. Build one sheet per KPI and place the sheets side by side on the dashboard. Open `http://localhost:8765/kpi.html` in a browser to preview it with sample data.

1. With `serve.ps1` running, add the extension from `kpi.trex` on the Marks card.
2. Drag your existing calculations onto the encodings. Only **Value** is needed:
   - **Value**: the KPI, such as `rev_ytd` or `att_ytd`.
   - **Target**: optional, such as `tgt_ytd`. Attainment is Value ÷ Target, unless you choose an attainment rate under **Target and status**.
   - **Change**: up to two changes, such as `att_ytd_change` (% or points vs prior year). The card picks the arrow and color itself, so separate up and down fields aren't needed.
   - **Trend**: optional dimension, such as `MONTH(Date)`, for a trend line of the Value beside it.
   - **Detail**: any other field, for the *Visible rows* test, an attainment rate you already calculate (such as `att_ytd`, 1 = 100%), the progress bar marker, or the text (for example `{rev_ytd_py}` in a line of text).
3. Open **Format Extension** on the Marks card to change:
   - **Title and background**: title text (the Value field's name when empty) and size; an icon; a theme (light, light with gray text, or dark) and each color; left, center, or right alignment, top or middle; border and corner radius.
   - **Visible rows**: uses only rows where a True/False field on **Detail** is True, the same as the radial chart's *Visible rows* and the combo chart's *Visible categories*, so one date range parameter drives every chart. Dashboard filters (for example on Product Group) and parameters apply to the card as to any sheet; set the filter to apply to the KPI worksheets too.
   - **Combine rows**: how each field is combined when the sheet has more than one row (a Trend dimension or a field on Detail): automatic, sum, average, minimum, maximum, first row, or last row. Automatic uses a value that is the same on every row as it is; otherwise Value and Target add up and the other fields take the last row. A sheet of `AGG()` calculations with no dimensions has one row and needs none of this.
   - **Value**: font size, text beside the value (for example `of {target}`), and coloring the value by status.
   - **Target and status**: show the status; the attainment (Value ÷ Target, or a rate on Detail); compare the attainment with 100% of the target, or with the bar marker (pace, for example the share of the year gone); where *near target* starts; each status's text and color.
   - **Progress bar**: show it; what a full bar stands for (100% of the target by default); the percent; a marker from a field on Detail (a fraction, such as 0.75); a caption under the bar (for example `Target {target} · gap {gap}`); status or accent color.
   - **Change lines**: for each Change field, the text after it (for example `vs YoY`), shown as Tableau's format, percent, points (0.012 = 1.2 pts), or number; whether higher is better; a + or − sign.
   - **Trend line**: show it, with or without shading.
   - **Text at the bottom**: lines of text. In every text box, `{value}`, `{target}`, `{attainment}`, `{gap}`, `{marker}`, `{latest}` (the last Trend member), `{change1}`, `{change2}`, or any field name in braces is replaced by its value, in bold.
   - **Number format**: as in the radial chart; Automatic keeps the format set on the field in Tableau.
   - **Animation**: animate when the data changes, together with the combo and radial charts.

## Use the hosted version (GitHub Pages)

The extensions are hosted from this repository with GitHub Pages at `https://chanonwa.github.io/tableau_viz_extension/`. The site is published from the `main` branch (root folder), so every push to `main` updates the hosted extensions, usually within a minute or two. Viewers get the update the next time the extension loads. GitHub Pages serves over HTTPS, which Tableau Server and Tableau Cloud require.

Open <https://chanonwa.github.io/tableau_viz_extension/index.html>, <https://chanonwa.github.io/tableau_viz_extension/anomaly.html>, <https://chanonwa.github.io/tableau_viz_extension/radial.html>, or <https://chanonwa.github.io/tableau_viz_extension/kpi.html> in a browser to check the hosted pages. Outside Tableau they show sample data.

### In Tableau Desktop

No local server is needed. On a worksheet, open the mark type dropdown on the Marks card, choose **Add Extension** > **Access Local Viz Extensions**, and pick `combo.server.trex`, `anomaly.server.trex`, `radial.server.trex`, or `kpi.server.trex`. In the extension list they show as "Multi-Measure Combo Chart (GitHub Pages)", "Anomaly Detection (GitHub Pages)", "Radial Chart (GitHub Pages)", and "KPI Card (GitHub Pages)".

### On Tableau Server or Tableau Cloud

1. **Allow the address on the site.** A site administrator does this once per site:
   1. Open the site's **Settings** > **Extensions**.
   2. Make sure extensions, including viz extensions, are allowed to run on the site. On Tableau Server, the server administrator may also need to enable extensions for the whole server first.
   3. Add `https://chanonwa.github.io` to the safe list, with full data access, because the extensions read the worksheet's summary data.
2. **Build the workbook with the hosted manifests.** In Tableau Desktop, add the extension from `combo.server.trex`, `anomaly.server.trex`, `radial.server.trex`, or `kpi.server.trex`, not the local `.trex`, so the workbook stores the HTTPS address rather than `localhost`. A worksheet built with the local manifest has to have its extension removed and added again from the hosted one.
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

1. Copy the folder to any HTTPS web server or static hosting service (IIS, nginx, Apache, Azure Static Web Apps, Amazon S3 with CloudFront, and so on), keeping the `vendor` subfolder. `README.md`, `CONTRIBUTING.md`, `serve.ps1`, and the `.trex` files aren't needed there. The server needs a valid certificate and must serve `.js` files as JavaScript.
2. Copy `combo.server.trex`, `anomaly.server.trex`, `radial.server.trex`, and `kpi.server.trex` and change the `<url>` in each to the new address, for example:

   ```xml
   <source-location>
     <url>https://extensions.example.com/combo/index.html</url>
   </source-location>
   ```

   The settings dialogs (`settings.html`, `anomaly-settings.html`, `radial-settings.html`, `kpi-settings.html`) are found relative to the page, so they need no change.
3. Add the new address to the site's extension safe list and build the workbook with the new manifests, as in [On Tableau Server or Tableau Cloud](#on-tableau-server-or-tableau-cloud).

## Collaboration

Changes are welcome. The short version:

- `main` is the live site. GitHub Pages publishes it within minutes, so every workbook that uses a hosted manifest picks up a push to `main` the next time it loads. Work on a branch and open a pull request instead of pushing to `main`.
- Test with `serve.ps1` and the local `.trex` manifests in Tableau Desktop before opening a pull request, and check the page in a browser with the sample data.
- Settings are saved inside people's workbooks, so new settings need defaults and old saved settings must keep loading.
- Update this README in the same pull request when a change is visible to users.

[CONTRIBUTING.md](CONTRIBUTING.md) has the full workflow, the file layout, a test checklist, and how the repository owner adds collaborators.

## Requirements

- Tableau Desktop, Tableau Server, or Tableau Cloud with viz extensions (Tableau 2024.2 or later).
- For local use: PowerShell on Windows for `serve.ps1` (it binds to `localhost:8765`), or any other static file server on that port.
- For Tableau Server or Tableau Cloud: the hosted manifests (`*.server.trex`) or another HTTPS host, and the hosting address on the site's extension safe list.

The vendored Tableau Extensions API runtime is from the official [Tableau Extensions API repository](https://github.com/tableau/extensions-api).
