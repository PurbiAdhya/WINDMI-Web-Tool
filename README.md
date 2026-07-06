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

## GitHub Pages

1. Create a GitHub repository.
2. Upload these files to the repository root.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/root`.
6. Open the generated GitHub Pages URL.

## Important notes

- The computation runs entirely in the user's browser. No data is sent to a server.
- The first version uses a direct JavaScript RK4 solver, not R/webR.
- Verify the numerical output against the MATLAB/Simulink version before using it for publication-quality results.
- The default parameters are copied from the MATLAB code shared in the conversation.
