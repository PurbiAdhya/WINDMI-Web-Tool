# WINDMI Web Tool

A browser-based WINDMI model viewer for OMNI yearly CSV files.

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
    omni_2000.csv
    ...
  tools/
    split_omni_by_year.py
```

## Data files

Put one OMNI CSV per year in `data/` using this naming pattern:

```text
data/omni_2000.csv
data/omni_2001.csv
```

The app loads only the year files required by the selected UTC interval and spin-up period.

## Main workflow

1. Open **Run WINDMI**.
2. Choose a UTC start and end time.
3. Choose trigger behavior:
   - Trigger off
   - Constant Ic in kA
   - Variable Ic using a percentile
4. Adjust L, C, or Sigma only if needed.
5. Click **Run WINDMI**.

More model configuration is under **Model Parameters** and **Advanced Settings**.
