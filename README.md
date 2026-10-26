# Multi-Measure Combo Chart for Tableau

A local Tableau Viz Extension starter that displays one category and up to 50 numeric measures as a single chart. Each measure can be switched between bars and a line. Each line can independently use a solid, dashed, dotted, or dash-dot pattern; all series share one value axis.

## Run locally

1. Open PowerShell in this folder and run:

   ```powershell
   .\serve.ps1
   ```

2. In a browser, open `http://localhost:8765/`. Outside Tableau, the page shows sample data so you can preview the chart and try changing series types.
3. In Tableau Desktop, open a worksheet and add the extension from `combo.trex` (use the Viz Extension option on the Marks card).
4. Put one discrete field on **Category** and one or more numeric measures on **Measures**. Click any series control above the chart to toggle it between bar and line. Use the adjacent selector to set the pattern for that measure's line; the selector is enabled when the measure is a line.

The extension uses Tableau's summary data and refreshes when the worksheet data changes. The value axis is intentionally shared, so measures with very different scales may be hard to compare.

## Requirements and hosting

- Tableau Desktop with Viz Extensions enabled.
- PowerShell on Windows for the included local static server. It binds to `localhost:8765`.
- The `.trex` manifest points at `http://localhost:8765/index.html`; keep `serve.ps1` running while using the extension.

For Tableau Server or Tableau Cloud, host the page, JavaScript, and Tableau API runtime at an HTTPS URL, update the URL in `combo.trex`, and configure the site to allow the extension. Do not publish the local HTTP URL.

The vendored Tableau Extensions API runtime is from the official [Tableau Extensions API repository](https://github.com/tableau/extensions-api).
