const state = {
  lastResults: null,
  lastSegments: null,
  lastIc: null
};

const parameterLabels = {
  L: "L",
  L1: "L1",
  L2: "L2",
  L_y: "L_y",
  C: "C",
  C1: "C1",
  R_prc: "R_prc",
  R_A2: "R_A2",
  M: "M",
  DeltaI: "DeltaI",
  Sigma: "Sigma",
  Sigma1: "Sigma1",
  Mu0: "Mu0",
  A_eff: "A_eff",
  B_tr: "B_tr",
  Omega_cps: "Omega_cps",
  Tau_E: "Tau_E",
  Tau_p: "Tau_parallel",
  Tau_rc: "Tau_rc",
  Alpha: "Alpha for I_ps = Alpha sqrt(p)",
  V0: "Base V0",
  driverLyRe: "vBs L_y, R_E",
  R_E: "R_E"
};

const initialLabels = {
  I: "I(0)",
  V: "V(0)",
  p: "p(0)",
  Kpar: "K_parallel(0)",
  I1: "I1(0)",
  V1: "V1(0)",
  I2: "I2(0)",
  Wrc: "W_rc(0)"
};

const selectors = {
  fileInput: document.getElementById("fileInput"),
  startDate: document.getElementById("startDate"),
  endDate: document.getElementById("endDate"),
  maxStep: document.getElementById("maxStep"),
  constantIc: document.getElementById("constantIc"),
  triggerPercentile: document.getElementById("triggerPercentile"),
  interpolateMissing: document.getElementById("interpolateMissing"),
  runButton: document.getElementById("runButton"),
  downloadButton: document.getElementById("downloadButton"),
  clearButton: document.getElementById("clearButton"),
  statusBox: document.getElementById("statusBox"),
  summaryBox: document.getElementById("summaryBox"),
  plot: document.getElementById("plot"),
  plotBadge: document.getElementById("plotBadge"),
  segmentsBox: document.getElementById("segmentsBox"),
  parameterGrid: document.getElementById("parameterGrid"),
  initialGrid: document.getElementById("initialGrid")
};

function initializeParameterInputs() {
  selectors.parameterGrid.innerHTML = "";
  Object.entries(WINDMI_DEFAULT_PARAMS).forEach(([key, value]) => {
    const label = document.createElement("label");
    label.innerHTML = `<span>${parameterLabels[key] || key}</span><input data-param="${key}" type="number" step="any" value="${value}">`;
    selectors.parameterGrid.appendChild(label);
  });

  selectors.initialGrid.innerHTML = "";
  Object.entries(WINDMI_DEFAULT_INITIAL).forEach(([key, value]) => {
    const label = document.createElement("label");
    label.innerHTML = `<span>${initialLabels[key] || key}</span><input data-initial="${key}" type="number" step="any" value="${value}">`;
    selectors.initialGrid.appendChild(label);
  });
}

function getParams() {
  const params = { ...WINDMI_DEFAULT_PARAMS };
  document.querySelectorAll("[data-param]").forEach(input => {
    params[input.dataset.param] = Number(input.value);
  });
  return params;
}

function getInitialState() {
  const initial = { ...WINDMI_DEFAULT_INITIAL };
  document.querySelectorAll("[data-initial]").forEach(input => {
    initial[input.dataset.initial] = Number(input.value);
  });
  return initial;
}

function setStatus(message, type = "") {
  selectors.statusBox.className = `status-box ${type}`.trim();
  selectors.statusBox.innerHTML = message;
}

function parseUtcDateFromInput(value) {
  if (!value) return null;
  // datetime-local has no timezone. Treat it as UTC for OMNI data.
  return new Date(`${value}:00.000Z`);
}

function findColumn(headers, patterns) {
  const normalized = headers.map(h => ({ raw: h, lower: String(h).toLowerCase() }));
  for (const pattern of patterns) {
    const found = normalized.find(h => h.lower.includes(pattern));
    if (found) return found.raw;
  }
  return null;
}

function cleanNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function rowToOmni(row, keys, start, end) {
  const timeValue = row[keys.time];
  const time = new Date(timeValue);
  if (!(time instanceof Date) || Number.isNaN(time.getTime())) return null;
  if (time < start || time > end) return null;

  let bz = cleanNumber(row[keys.bz]);
  let vx = cleanNumber(row[keys.vx]);

  // OMNI standard fill values. Keep the row so interpolation can fill it.
  if (bz > 9000 || bz < -9000) bz = NaN;
  if (Math.abs(vx) > 90000) vx = NaN;

  return { time, bz, vx };
}

function interpolateField(rows, key) {
  if (!rows.length) return;

  let firstValid = rows.findIndex(row => Number.isFinite(row[key]));
  if (firstValid < 0) return;

  for (let i = 0; i < firstValid; i++) rows[i][key] = rows[firstValid][key];

  let lastValid = firstValid;
  for (let i = firstValid + 1; i < rows.length; i++) {
    if (Number.isFinite(rows[i][key])) {
      const startVal = rows[lastValid][key];
      const endVal = rows[i][key];
      const gap = i - lastValid;
      for (let j = 1; j < gap; j++) {
        rows[lastValid + j][key] = startVal + (endVal - startVal) * (j / gap);
      }
      lastValid = i;
    }
  }

  for (let i = lastValid + 1; i < rows.length; i++) rows[i][key] = rows[lastValid][key];
}

function loadOmniFromCsv(file, start, end, params) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let keys = null;
    let parsedCount = 0;
    let keptCount = 0;
    let fillCount = 0;

    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      worker: true,
      chunkSize: 1024 * 1024,
      chunk: (results) => {
        if (!keys) {
          const headers = results.meta.fields || Object.keys(results.data[0] || {});
          keys = {
            time: findColumn(headers, ["epoch", "time", "date"]),
            bz: findColumn(headers, ["bz"]),
            vx: findColumn(headers, ["vx", "velocity"])
          };

          if (!keys.time || !keys.bz || !keys.vx) {
            reject(new Error(`Could not identify required columns. Found: ${headers.join(", ")}`));
            return;
          }
        }

        for (const rawRow of results.data) {
          parsedCount += 1;
          const row = rowToOmni(rawRow, keys, start, end);
          if (row) {
            if (!Number.isFinite(row.bz) || !Number.isFinite(row.vx)) fillCount += 1;
            rows.push(row);
            keptCount += 1;
          }
        }

        if (parsedCount % 250000 < results.data.length) {
          setStatus(`Reading file...\nParsed ${parsedCount.toLocaleString()} rows. Kept ${keptCount.toLocaleString()} rows in the selected date range.`);
        }
      },
      complete: () => {
        rows.sort((a, b) => a.time - b.time);

        if (selectors.interpolateMissing.checked) {
          interpolateField(rows, "bz");
          interpolateField(rows, "vx");
        }

        const cleaned = rows.filter(row => Number.isFinite(row.bz) && Number.isFinite(row.vx));
        cleaned.forEach(row => {
          row.vbs = computeVbs(row.bz, row.vx, params);
        });

        resolve({ rows: cleaned, parsedCount, keptCount, fillCount, keys });
      },
      error: err => reject(err)
    });
  });
}

function selectedOutputs() {
  return [...document.querySelectorAll(".outputs input[type='checkbox']:checked")].map(input => input.value);
}

function normalized(values) {
  const finite = values.filter(Number.isFinite);
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return values.map(() => NaN);
  if (Math.abs(max - min) < 1e-30) return values.map(() => 0.5);
  return values.map(v => Number.isFinite(v) ? (v - min) / (max - min) : NaN);
}

function downsampleRows(rows, maxPoints = 12000) {
  if (rows.length <= maxPoints) return rows;
  const step = Math.ceil(rows.length / maxPoints);
  const sample = [];
  for (let i = 0; i < rows.length; i += step) sample.push(rows[i]);
  if (sample[sample.length - 1] !== rows[rows.length - 1]) sample.push(rows[rows.length - 1]);
  return sample;
}

function plotResults(rows) {
  const plotRows = downsampleRows(rows);
  const x = plotRows.map(row => row.timeISO);

  const vbs = plotRows.map(row => Number(row.Vbs));
  const I = plotRows.map(row => Number(row.I));
  const theta = plotRows.map(row => Number(row.Theta));
  const I1 = plotRows.map(row => Number(row.I1));

  const traces = [
    {
      x,
      y: vbs,
      type: "scatter",
      mode: "lines",
      name: "vB_s",
      xaxis: "x",
      yaxis: "y",
      hovertemplate: "%{x}<br>vB_s: %{y:.5g}<extra></extra>"
    },
    {
      x,
      y: I,
      type: "scatter",
      mode: "lines",
      name: "I",
      xaxis: "x2",
      yaxis: "y2",
      hovertemplate: "%{x}<br>I: %{y:.5g}<extra></extra>"
    },
    {
      x,
      y: theta,
      type: "scatter",
      mode: "lines",
      name: "Θ",
      xaxis: "x2",
      yaxis: "y3",
      fill: "tozeroy",
      fillcolor: "rgba(107, 78, 255, 0.18)",
      line: { color: "rgba(107, 78, 255, 0.75)", width: 1.2 },
      hovertemplate: "%{x}<br>Θ: %{y:.5g}<extra></extra>"
    },
    {
      x,
      y: I1,
      type: "scatter",
      mode: "lines",
      name: "I1",
      xaxis: "x3",
      yaxis: "y4",
      hovertemplate: "%{x}<br>I1: %{y:.5g}<extra></extra>"
    }
  ];

  selectors.plot.classList.remove("plot-placeholder");
  selectors.plotBadge.hidden = false;
  selectors.plotBadge.textContent = `${plotRows.length.toLocaleString()} plotted points`;

  const gridColor = "rgba(120,110,96,0.18)";

  Plotly.newPlot(selectors.plot, traces, {
    margin: { t: 28, r: 78, b: 58, l: 78 },
    paper_bgcolor: "rgba(255,255,255,0)",
    plot_bgcolor: "rgba(255,255,255,0.72)",

    xaxis: {
      domain: [0, 1],
      anchor: "y",
      matches: "x3",
      showticklabels: false,
      gridcolor: gridColor,
      zeroline: false
    },
    yaxis: {
      domain: [0.72, 1.00],
      title: "vB_s",
      gridcolor: gridColor,
      zeroline: false
    },

    xaxis2: {
      domain: [0, 1],
      anchor: "y2",
      matches: "x3",
      showticklabels: false,
      gridcolor: gridColor,
      zeroline: false
    },
    yaxis2: {
      domain: [0.36, 0.66],
      title: "I",
      gridcolor: gridColor,
      zeroline: false
    },
    yaxis3: {
      overlaying: "y2",
      side: "right",
      title: "Θ",
      range: [0, 1],
      showgrid: false,
      zeroline: false
    },

    xaxis3: {
      domain: [0, 1],
      anchor: "y4",
      title: "UTC time",
      gridcolor: gridColor,
      zeroline: false
    },
    yaxis4: {
      domain: [0.00, 0.30],
      title: "I1",
      gridcolor: gridColor,
      zeroline: false
    },

    annotations: [
      { text: "vB_s", xref: "paper", yref: "paper", x: 0, y: 1.035, showarrow: false, xanchor: "left", font: { size: 13 } },
      { text: "I with Θ shaded", xref: "paper", yref: "paper", x: 0, y: 0.685, showarrow: false, xanchor: "left", font: { size: 13 } },
      { text: "I1", xref: "paper", yref: "paper", x: 0, y: 0.325, showarrow: false, xanchor: "left", font: { size: 13 } }
    ],
    legend: { orientation: "h", y: -0.14 },
    hovermode: "x unified"
  }, {
    responsive: true,
    displaylogo: false
  });
}

function summarize(rows, loadInfo, mode, Ic, segments) {
  const vbsValues = rows.map(r => r.Vbs).filter(Number.isFinite);
  const thetaMax = Math.max(...rows.map(r => r.Theta).filter(Number.isFinite));
  const minutes = rows.length;
  const vbsMin = Math.min(...vbsValues);
  const vbsMax = Math.max(...vbsValues);

  selectors.summaryBox.hidden = false;
  selectors.summaryBox.innerHTML = `
    <div class="summary-item"><span>Rows used</span><strong>${minutes.toLocaleString()}</strong></div>
    <div class="summary-item"><span>vBs range</span><strong>${formatNumber(vbsMin)} – ${formatNumber(vbsMax)}</strong></div>
    <div class="summary-item"><span>I_c</span><strong>${formatNumber(Ic)}</strong></div>
    <div class="summary-item"><span>Trigger intervals</span><strong>${segments.length}</strong></div>
  `;

  const fillMessage = loadInfo.fillCount > 0
    ? `${loadInfo.fillCount.toLocaleString()} OMNI rows had fill values${selectors.interpolateMissing.checked ? " and were interpolated" : " and were removed"}.`
    : "No OMNI fill values found in the selected range.";

  setStatus(
    `Finished.\nMode: ${mode === "percentile" ? "triggered percentile" : "constant Ic"}.\n${fillMessage}\nMax Θ: ${formatNumber(thetaMax)}.`,
    "success"
  );
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if ((abs >= 1e4 || abs < 1e-3) && abs !== 0) return value.toExponential(3);
  return value.toLocaleString(undefined, { maximumSignificantDigits: 5 });
}

function renderSegments(segments) {
  if (!segments.length) {
    selectors.segmentsBox.textContent = "No Θ ≥ 0.1 intervals found.";
    return;
  }

  selectors.segmentsBox.innerHTML = `
    <table>
      <thead>
        <tr><th>#</th><th>Start UTC</th><th>End UTC</th><th>Duration</th><th>Peak Θ</th></tr>
      </thead>
      <tbody>
        ${segments.map((seg, index) => {
          const durationMin = (seg.end - seg.start) / 60000;
          return `<tr>
            <td>${index + 1}</td>
            <td>${seg.start.toISOString()}</td>
            <td>${seg.end.toISOString()}</td>
            <td>${formatNumber(durationMin)} min</td>
            <td>${formatNumber(seg.peakTheta)}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
}

function rowsToCsv(rows) {
  const headers = ["timeISO", "Bz", "Vx", "Vbs", "I", "I1", "I2", "Ips", "Theta", "V", "V1", "p", "Kpar", "Wrc", "Ic"];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map(h => row[h] ?? "").join(","));
  }
  return lines.join("\n");
}

function downloadCsv() {
  if (!state.lastResults) return;
  const csv = rowsToCsv(state.lastResults);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "windmi_output.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function runModel() {
  const file = selectors.fileInput.files[0];
  if (!file) {
    setStatus("Please choose an OMNI CSV file first.", "warning");
    return;
  }

  const start = parseUtcDateFromInput(selectors.startDate.value);
  const end = parseUtcDateFromInput(selectors.endDate.value);
  if (!start || !end || start >= end) {
    setStatus("Please choose a valid UTC start and end date/time.", "warning");
    return;
  }

  const params = getParams();
  const initial = getInitialState();
  const maxStepSeconds = Number(selectors.maxStep.value) || 60;
  const mode = document.querySelector("input[name='triggerMode']:checked").value;

  selectors.runButton.disabled = true;
  selectors.downloadButton.disabled = true;
  selectors.summaryBox.hidden = true;
  selectors.plotBadge.hidden = true;
  selectors.segmentsBox.textContent = "Waiting for result...";
  setStatus("Reading selected date range from CSV...");

  try {
    const loadInfo = await loadOmniFromCsv(file, start, end, params);

    if (loadInfo.rows.length < 2) {
      throw new Error("No usable OMNI rows were found in the selected date range.");
    }

    if (loadInfo.rows.length > 120000) {
      setStatus(`Solving ${loadInfo.rows.length.toLocaleString()} rows. This may take a while in the browser...`, "warning");
    } else {
      setStatus(`Solving ${loadInfo.rows.length.toLocaleString()} rows with RK4...`);
    }

    let Ic = Number(selectors.constantIc.value);
    let results;

    if (mode === "percentile") {
      const baseResults = solveWindmiSeries(loadInfo.rows, params, Ic, initial, { maxStepSeconds });
      Ic = percentile(baseResults.map(row => row.I), Number(selectors.triggerPercentile.value));
      if (!Number.isFinite(Ic)) throw new Error("Could not compute percentile-based Ic.");
      results = solveWindmiSeries(loadInfo.rows, params, Ic, initial, { maxStepSeconds });
    } else {
      results = solveWindmiSeries(loadInfo.rows, params, Ic, initial, { maxStepSeconds });
    }

    const segments = findThetaSegments(results, 0.1);

    state.lastResults = results;
    state.lastSegments = segments;
    state.lastIc = Ic;

    plotResults(results);
    renderSegments(segments);
    summarize(results, loadInfo, mode, Ic, segments);
    selectors.downloadButton.disabled = false;
  } catch (error) {
    console.error(error);
    setStatus(error.message || String(error), "error");
  } finally {
    selectors.runButton.disabled = false;
  }
}

function clearResult() {
  state.lastResults = null;
  state.lastSegments = null;
  state.lastIc = null;
  selectors.downloadButton.disabled = true;
  selectors.summaryBox.hidden = true;
  selectors.plotBadge.hidden = true;
  selectors.plot.innerHTML = "The plot will appear here.";
  selectors.plot.classList.add("plot-placeholder");
  selectors.segmentsBox.textContent = "No result yet.";
  setStatus("Choose an OMNI CSV file and click <strong>Solve WINDMI</strong>.");
}

initializeParameterInputs();
selectors.runButton.addEventListener("click", runModel);
selectors.downloadButton.addEventListener("click", downloadCsv);
selectors.clearButton.addEventListener("click", clearResult);

