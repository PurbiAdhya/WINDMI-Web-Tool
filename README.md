# WINDMI Web Tool

A browser-based WINDMI model runner for yearly OMNI CSV files.

## Final GitHub repo configuration

Upload the full package structure to your GitHub repository:

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

Your yearly OMNI files should be named exactly like:

```text
data/omni_2000.csv
data/omni_2001.csv
```

The page loads the needed year files automatically from the date range and spin-up settings.

## Interface layout

Navigation:

1. **Run WINDMI** — date range, trigger settings, quick parameters, and output plot.
2. **Model Parameters** — full parameter list.
3. **Advanced Settings** — initial conditions, data source, spin-up, and interpolation settings.

## Local testing

For built-in yearly files, test with a local server:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

On GitHub Pages, no local server is needed.
