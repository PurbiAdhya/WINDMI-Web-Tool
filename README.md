# WINDMI Web Tool

A static GitHub Pages-ready browser app for running the WINDMI model on OMNI 1-minute data.

## Interface

The main workflow is intentionally simple:

1. Choose a UTC date range.
2. Choose trigger behavior:
   - **Trigger off**: sets `I_c = 1e8`, so the trigger effectively never turns on.
   - **Constant I_c**: uses a fixed threshold.
   - **Variable I_c**: calculates `I_c` from a prepass percentile.
3. Optionally adjust the quick parameters `L`, `C`, and `Sigma`.
4. Click **Run and Plot**.

Deeper configuration is available from the left navigation:

- Trigger Settings
- Model Parameters
- Initial Conditions
- Data Source
- Plot Options

Most users can leave initial conditions and the full model configuration unchanged.

## Data files

Place yearly OMNI CSV files in the `data/` folder with this naming pattern:

```text
data/omni_1998.csv
data/omni_1999.csv
data/omni_2000.csv
```

The app loads only the year files required for the selected interval and spin-up period.

## Local testing

For built-in yearly files, run a small local server instead of double-clicking `index.html`:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

After publishing to GitHub Pages, no local server is needed.

## GitHub Pages

Upload the project files to your repository root and enable:

```text
Settings → Pages → Deploy from branch → main → / root
```

## Files

```text
index.html
style.css
script.js
windmi.js
README.md
assets/
  windmi-wordmark.png
  favicon-32.png
  icon-192.png
  icon-512.png
data/
  .gitkeep
tools/
  split_omni_by_year.py
```
