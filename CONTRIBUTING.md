# Contributing

This repository holds three Tableau Viz Extensions: the Multi-Measure Combo Chart, Anomaly Detection, and the Radial Chart. The [README](README.md) explains how to use them. This file is for people who change them.

## Before you start: `main` is live

GitHub Pages publishes the `main` branch at <https://chanonwa.github.io/tableau_viz_extension/>. Every workbook built with a hosted manifest (`*.server.trex`) loads the extension from there, so a push to `main` reaches all of those workbooks, on Tableau Server and Tableau Cloud too, the next time they load. There is no separate release step.

So:

- Don't push straight to `main`. Make a branch, push it, and open a pull request.
- Merge only after the change has been tried in Tableau Desktop with the local manifests.
- If a merge breaks something, revert the commit on `main` (`git revert <commit>`) and push. That undoes the change on the hosted site within minutes.

## Getting access

The repository owner adds collaborators on GitHub under **Settings** > **Collaborators** > **Add people**. Collaborators can push branches and open pull requests. To stop anyone pushing to `main` directly, the owner can add a branch protection rule for `main` under **Settings** > **Branches** that requires a pull request.

Without collaborator access, fork the repository and open the pull request from your fork.

## Set up

There is no build step and nothing to install. The extensions are plain HTML, CSS, and JavaScript, and the Tableau Extensions API is checked in under `vendor/`.

1. Clone the repository:

   ```powershell
   git clone https://github.com/chanonwa/tableau_viz_extension.git
   cd tableau_viz_extension
   ```

2. Start the local server with `.\serve.ps1` (see [Run the server locally](README.md#run-the-server-locally)). It serves this folder at `http://localhost:8765/` and turns caching off, so Tableau always gets your latest files.
3. In Tableau Desktop, add the extension from the local manifest (`combo.trex`, `anomaly.trex`, or `radial.trex`). These point at `localhost`; the `*.server.trex` manifests point at GitHub Pages and won't show your local changes.

## Where things are

| File | What it is |
| --- | --- |
| `index.html`, `combo.js` | Combo chart page and logic |
| `settings.html`, `settings-form.js` | Combo chart **Format Extension** dialog. The same form is also used as an in-chart settings panel when the dialog isn't available. |
| `forecast.js` | Exponential smoothing forecast used by the combo chart |
| `anomaly.html`, `anomaly.js` | Anomaly Detection page and logic |
| `anomaly-detect.js` | Detection methods (trend model, rolling median, IQR, z-score) and seasonality |
| `anomaly-settings.html`, `anomaly-settings-form.js` | Anomaly Detection settings dialog |
| `radial.html`, `radial.js` | Radial Chart page and logic |
| `radial-settings.html`, `radial-settings-form.js` | Radial Chart settings dialog |
| `colors.js` | Palettes and the fixed color slot for each member, shared by the combo and radial charts |
| `settings.css` | Styles shared by all settings dialogs |
| `*.trex` | Local manifests (`localhost:8765`) |
| `*.server.trex` | Hosted manifests (GitHub Pages) |
| `serve.ps1` | Local development server |
| `vendor/` | Official Tableau Extensions API runtime. Don't edit it. |

`colors.js` and `settings.css` are shared, so a change there affects more than one extension. Test every extension that loads the file.

## Making changes

### Code style

Follow the code around your change:

- Plain JavaScript with `'use strict'`, no frameworks, and no build tools. Each page script is wrapped in an immediately invoked function. Shared code is exposed as one global, such as `window.ChartColors` or `window.ComboSettingsForm`.
- Two-space indentation, single quotes, semicolons, and a space before the parentheses in function declarations (`function getSeries (field)`).
- Short comments that explain why, not what. Document the shape of settings objects where they are defined, as `DEFAULT_STATE` in `radial.js` and the payload comment at the top of `settings-form.js` do.
- Keep each extension working outside Tableau: when the page is opened in a plain browser it shows sample data. A new encoding or setting should have sample data too.

### Saved settings

Each extension saves its settings in the workbook with `tableau.extensions.settings`, and workbooks keep those settings for years. When you add or rename a setting:

- Give it a default, and merge saved settings over the defaults (see `mergeState` in `combo.js`), so workbooks saved before the change still load.
- Don't rename or remove a saved key without reading the old one too. `mergeState` in `combo.js` still reads the old `display.valueLabels` key, for example.
- Where a value should follow later changes automatically, save `null` for "automatic" rather than the current default. The combo chart's per-measure legend setting does this.

### Manifests

If you change an encoding or anything else in a manifest, make the same change in both the local and the hosted manifest for that extension, for example `combo.trex` and `combo.server.trex`. Only the `<url>` and the name should differ.

Tableau reads a manifest only when the extension is added, so remove the extension from the Marks card and add it again to test a manifest change. Workbooks that already use the extension keep the old manifest until someone does the same. Tableau also allows at most four custom encodings per viz extension.

### Documentation

Update [README.md](README.md) in the same pull request when users would notice the change: a new setting, an encoding, or different default behavior. Describe what the user sees and does, in the same plain style as the rest of the README.

## Testing checklist

There are no automated tests. Before opening a pull request:

- [ ] Open each changed page in a browser at `http://localhost:8765/` (`index.html`, `anomaly.html`, `radial.html`) and check it with the sample data. Check the browser console for errors.
- [ ] In Tableau Desktop, add the extension from the local `.trex` and check the change with real data.
- [ ] Open **Format Extension**, change the new or affected settings, click **OK**, and check that the chart updates. Reopen the dialog to check the settings were kept.
- [ ] Save, close, and reopen the workbook to check the settings are restored.
- [ ] Open a workbook saved before your change to check older settings still load.
- [ ] If you changed `colors.js` or `settings.css`, check both the combo chart and the radial chart.
- [ ] Change a filter or parameter and check that the chart redraws correctly, including members that come and go.

## Commits and pull requests

- Keep each pull request to one change, so it is easy to review and, if needed, to revert.
- Start commit messages with a type, as the history does: `feat:` for new behavior, `fix:` for bug fixes, `refactor:` for code changes that keep behavior the same, and `docs:` for documentation. For example, `feat: Add display name and legend toggle for each measure`.
- In the pull request, say what changed, which extensions it affects, and how you tested it. Add a screenshot for visual changes.
- After merging, open the hosted page in a few minutes to check GitHub Pages has updated, then reload a workbook that uses the hosted manifest.

## Updating the Tableau Extensions API

`vendor/tableau.extensions.1.latest.min.js` comes from the official [Tableau Extensions API repository](https://github.com/tableau/extensions-api). To update it, replace the file with the newer release and keep `vendor/LICENSE.txt` alongside it, then run the full testing checklist for all three extensions.
