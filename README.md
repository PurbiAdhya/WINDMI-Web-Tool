# WINDMI Web Tool

Static GitHub Pages application for loading yearly OMNI data, running the JavaScript WINDMI solver, and plotting selected state variables.

## Navigation

- **Run WINDMI** — date range and trigger controls on the left, OMNI `Vx`/`Bz` input plot in the middle, WINDMI output plot on the right.
- **Model Parameters** — full parameter list and output-variable selection.
- **Advanced Settings** — initial conditions, data source, interpolation, spin-up, and path settings.
- **WINDMI Equations** — model overview and MathJax-rendered equations.
- **Recent Papers** — ten directly relevant WINDMI publications and research outputs.
- **About This Tool** — project development and model lineage.

## Supported interval

The interface accepts UTC ranges from **1998-01-01 00:00** through **2022-12-31 23:59**.

## Repository layout

```text
WINDMI-Web-Tool/
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
    omni_1998.csv
    omni_1999.csv
    ...
    omni_2022.csv
  tools/
    split_omni_by_year.py
```

Yearly data files must follow the filename pattern configured in Advanced Settings. The default pattern is:

```text
data/omni_{year}.csv
```

The expected columns are a UTC time column, GSM `Bz`, and GSE `Vx`. The current OMNI headings are detected automatically.

## GitHub Pages

Commit the application files and yearly CSV files to the repository, then enable **Settings → Pages → Deploy from a branch → main → root**.

## Interface update (July 2026)

- Start and end UTC fields appear side by side on desktop.
- The run status message appears beneath Trigger settings.
- WINDMI input and output panels use equal widths.
- IMF Bz labels render with z as a subscript.

## Plot export update

- The WINDMI input panel includes an **Export input PNG** button.
- The WINDMI output plot intentionally hides its legend to leave more room for the subplots; variable names remain in subplot headings and hover labels.

- OMNI Vx and Bz are smoothed with a centered 5-minute moving average after optional interpolation and before vBs calculation and model integration.
