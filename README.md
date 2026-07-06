# WINDMI Web Tool

A static HTML/CSS/JavaScript prototype for running the 8-state WINDMI model from OMNI 1-minute data in the browser.

## Files

- `index.html` — user interface
- `style.css` — styling
- `script.js` — CSV parsing, filtering, plotting, export
- `windmi.js` — WINDMI equations and RK4 solver

## How to use locally

Open `index.html` in a browser, upload an OMNI CSV, choose a UTC date range, and click **Solve WINDMI**.

The app expects columns similar to:

- `EPOCH_TIME_yyyy-mm-ddThh:mm:ss.sssZ`
- `BZ__GSM_nT`
- `VX_VELOCITY__GSE_km/s`

It also tries to auto-detect columns containing `epoch`/`time`, `bz`, and `vx`.
