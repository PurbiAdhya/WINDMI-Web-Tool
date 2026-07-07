# WINDMI Web Tool

A static GitHub Pages app for running the WINDMI model from OMNI 1-minute data.

This version includes a branded full-width interface and the WINDMI logo/icon in `assets/`.

The app runs entirely in the browser using:

- HTML/CSS/JavaScript
- Papa Parse for CSV parsing
- Plotly.js for interactive plots
- A JavaScript RK4 solver for the WINDMI ODE system

No MATLAB, Simulink, R backend, Python backend, or server is needed after deployment.

---

## Folder structure

```text
windmi-web-tool/
  index.html
  style.css
  script.js
  windmi.js
  README.md
  assets/
    windmi-logo.png
    favicon-32.png
    icon-192.png
    icon-512.png
  data/
    .gitkeep
    omni_2000.csv
    omni_2001.csv
    ...
  tools/
    split_omni_by_year.py
```

The app expects yearly data files in this pattern:

```text
data/omni_{year}.csv
```

For example:

```text
data/omni_1998.csv
data/omni_1999.csv
data/omni_2000.csv
```

You can change the pattern from the app under **Data handling**.

---

## Expected OMNI columns

The parser tries to automatically detect these columns:

- time column containing `epoch`, `time`, `datetime`, or `dateutc`
- Bz column containing `bz`
- Vx column containing `vx`, or `velocity` and `gse`

Examples that work:

```text
EPOCH_TIME_yyyy-mm-ddThh:mm:ss.sssZ
BZ__GSM_nT
VX_VELOCITY__GSE_km/s
```

or:

```text
EPOCH_TIME
BZ,_GSM
VX_VELOCITY,_GSE
```

OMNI fill values are handled as missing:

- Bz around `9999.99`
- Vx around `99999.9`

Short gaps are linearly interpolated by default. The maximum interpolation gap is editable in the app.

---

## Add yearly OMNI data files

If you download the data directly year by year, place each file in the `data/` folder and rename it to this pattern:

```text
data/omni_2000.csv
data/omni_2001.csv
data/omni_2002.csv
```

The year in the filename must match the data year because the website fetches files by date range. For example, a run from Dec 31, 2000 to Jan 1, 2001 will fetch both `data/omni_2000.csv` and `data/omni_2001.csv`.

If you ever download one large multi-year OMNI CSV instead, you can split it from the project root:

```bash
python tools/split_omni_by_year.py OMNI_HRO_1MIN_2000-2010.csv data
```

Install pandas if needed:

```bash
pip install pandas
```

---

## Run locally

The upload option can work by opening `index.html` directly, but the built-in `data/omni_YYYY.csv` fetches need a local web server.

From the project folder:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

This step is only for local testing. Once the project is on GitHub Pages, open the GitHub Pages link instead.

---

## Interface behavior

The setup page has a two-column workspace:

- Left control panel: OMNI data source, file input, UTC start/end, spin-up, trigger mode, constant/prepass I_c, and trigger percentile.
- Right configuration area: model parameters, initial conditions, and data handling.

The number-input spinner arrows for model parameters change each parameter by 10% of its nominal/default value. Use **Reset to nominal parameters** to restore only the WINDMI model parameters.

After clicking **Run WINDMI**, the page switches to the plot view. Use **Set conditions again and run** to return to the setup view.

The app produces three linked Plotly panels:

1. `vB_s` in kV
2. `I` in kA with `theta` shaded on the right y-axis
3. `I1` in kA

`I` and `I1` are not normalized.

---

## GitHub Pages deployment

1. Create or open your GitHub repository.
2. Add all app files to the repo.
3. Add the yearly OMNI files to `data/`.
4. Commit and push. Use GitHub Desktop or command-line Git for large data files.
5. Go to **Settings → Pages**.
6. Set source to **Deploy from branch**.
7. Choose **main** and **root**.
8. Save.

Your app will be available at a GitHub Pages URL after deployment finishes.

---

## Important GitHub data notes

- Do not use Git LFS for files that need to be served directly by GitHub Pages.
- Keep each yearly CSV under GitHub's single-file limit.
- Keep the total published Pages site under the GitHub Pages site size limit.
- For hundreds of MB of data, use command line Git or GitHub Desktop instead of uploading everything through the browser.

---

## Boundary-year logic

The app automatically loads all year files needed for the selected time range, including spin-up.

Example:

```text
Selected interval: Jan 1, 1999 00:30 to Jan 1, 1999 06:00
Spin-up: 2 hours
Model begins: Dec 31, 1998 22:30
Files loaded: data/omni_1998.csv and data/omni_1999.csv
```

---

## Research-use warning

The model equations and MATLAB parameter defaults are included, but initial conditions are editable because they were not available from the Simulink model. Before using the output for publication-quality analysis, validate a short interval against your MATLAB/Simulink run and adjust initial conditions or parameter interpretations as needed.
