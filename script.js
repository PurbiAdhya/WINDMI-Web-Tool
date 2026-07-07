const selectors = {};
let latestRun = null;
let syncInProgress = false;

window.addEventListener("DOMContentLoaded", () => {
  cacheSelectors();
  buildParameterInputs();
  buildInitialInputs();
  setDefaultTimes();
  wireEvents();
  updateSourceVisibility();
});

function cacheSelectors() {
  const ids = [
    "setupPage", "plotPage", "backToSetupBtn",
    "fileInput", "uploadFieldWrap", "startTime", "endTime", "spinupHours", "icMode",
    "icConstant", "icPercentile", "parameterGrid", "initialGrid", "interpolateMissing",
    "maxGapMinutes", "dataPathPattern", "runBtn", "exportBtn", "resetDefaultsBtn", "resetParamsBtn",
    "statusBox", "runSummary", "plotVbs", "plotITheta", "plotI1"
  ];

  ids.forEach(id => selectors[id] = document.getElementById(id));
}

function buildParameterInputs() {
  selectors.parameterGrid.innerHTML = "";
  WINDMI_PARAM_META.forEach(([key, label, units]) => {
    const nominalValue = WINDMI_DEFAULT_PARAMS[key];
    const stepValue = nominalStep(nominalValue);
    const wrap = document.createElement("div");
    wrap.className = "field param-field";
    wrap.innerHTML = `
      <label for="param-${key}">${label} ${units ? `<span class="units">(${units})</span>` : ""}</label>
      <input id="param-${key}" data-param-key="${key}" type="number" step="${stepValue}" value="${nominalValue}" title="Spinner step is 10% of the nominal value." />
      <span class="param-step-hint">step: ${formatStepForDisplay(stepValue)}</span>
    `;
    selectors.parameterGrid.appendChild(wrap);
  });
}

function nominalStep(value) {
  const numeric = Math.abs(Number(value));
  if (!Number.isFinite(numeric) || numeric === 0) return "1";
  return Number((numeric * 0.1).toPrecision(12)).toString();
}

function formatStepForDisplay(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return numeric.toLocaleString(undefined, { maximumSignificantDigits: 4 });
}

function buildInitialInputs() {
  selectors.initialGrid.innerHTML = "";
  WINDMI_INITIAL_META.forEach(([key, label, units]) => {
    const wrap = document.createElement("div");
    wrap.className = "field param-field";
    wrap.innerHTML = `
      <label for="initial-${key}">${label} ${units ? `<span class="units">(${units})</span>` : ""}</label>
      <input id="initial-${key}" data-initial-key="${key}" type="number" step="any" value="${WINDMI_DEFAULT_INITIAL[key]}" />
    `;
    selectors.initialGrid.appendChild(wrap);
  });
}

function setDefaultTimes() {
  const start = new Date(Date.UTC(2000, 0, 1, 0, 0, 0));
  const end = new Date(Date.UTC(2000, 0, 2, 0, 0, 0));
  selectors.startTime.value = toDatetimeLocalValueUTC(start);
  selectors.endTime.value = toDatetimeLocalValueUTC(end);
}

function wireEvents() {
  document.querySelectorAll("input[name='dataSource']").forEach(input => {
    input.addEventListener("change", updateSourceVisibility);
  });

  selectors.runBtn.addEventListener("click", runModel);
  selectors.exportBtn.addEventListener("click", exportLatestRun);
  selectors.resetDefaultsBtn.addEventListener("click", resetDefaults);
  selectors.resetParamsBtn.addEventListener("click", resetNominalParameters);
  selectors.backToSetupBtn.addEventListener("click", showSetupPage);
}

function updateSourceVisibility() {
  const source = selectedDataSource();
  selectors.uploadFieldWrap.style.opacity = source === "upload" ? "1" : "0.55";
}

function selectedDataSource() {
  return document.querySelector("input[name='dataSource']:checked")?.value || "repo";
}

function resetDefaults() {
  buildParameterInputs();
  buildInitialInputs();
  selectors.icMode.value = "percentile";
  selectors.icConstant.value = "20000000";
  selectors.icPercentile.value = "70";
  selectors.spinupHours.value = "2";
  selectors.interpolateMissing.checked = true;
  selectors.maxGapMinutes.value = "30";
  selectors.dataPathPattern.value = "data/omni_{year}.csv";
  setDefaultTimes();
  showSetupPage();
  setStatus("Setup restored.", "neutral");
}

function resetNominalParameters() {
  buildParameterInputs();
  setStatus("Model parameters reset to nominal values.", "neutral");
}

function showPlotPage() {
  selectors.setupPage.classList.remove("active");
  selectors.plotPage.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showSetupPage() {
  selectors.plotPage.classList.remove("active");
  selectors.setupPage.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setStatus(message, mode = "neutral") {
  selectors.statusBox.textContent = message;
  selectors.statusBox.className = `status ${mode}`;
}

function appendStatus(message, mode = "neutral") {
  selectors.statusBox.textContent = `${selectors.statusBox.textContent}\n${message}`;
  selectors.statusBox.className = `status ${mode}`;
}

function parseUtcDatetimeLocal(value) {
  if (!value) return null;
  const [datePart, timePart = "00:00"] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second = 0] = timePart.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0));
}

function toDatetimeLocalValueUTC(date) {
  const pad = number => String(number).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function collectParams() {
  const params = {};
  document.querySelectorAll("[data-param-key]").forEach(input => {
    params[input.dataset.paramKey] = Number(input.value);
  });
  return params;
}

function collectInitialState() {
  const initial = {};
  document.querySelectorAll("[data-initial-key]").forEach(input => {
    initial[input.dataset.initialKey] = Number(input.value);
  });
  return initial;
}

async function runModel() {
  try {
    selectors.runBtn.disabled = true;
    selectors.exportBtn.disabled = true;
    latestRun = null;

    const start = parseUtcDatetimeLocal(selectors.startTime.value);
    const end = parseUtcDatetimeLocal(selectors.endTime.value);
    const spinupHours = Math.max(0, Number(selectors.spinupHours.value) || 0);
    const params = collectParams();
    const initialState = collectInitialState();

    if (!start || !end || end <= start) {
      throw new Error("Please enter a valid UTC start and end time. End time must be after start time.");
    }

    const source = selectedDataSource();
    setStatus("Preparing data...", "neutral");

    let loadInfo;
    if (source === "repo") {
      loadInfo = await loadOmniFromRepo(start, end, params, spinupHours);
    } else {
      const file = selectors.fileInput.files[0];
      if (!file) throw new Error("Please choose an OMNI CSV file, or switch to built-in yearly files.");
      loadInfo = await loadOmniFromUploadedFile(file, start, end, params, spinupHours);
    }

    if (!loadInfo.rows.length) {
      throw new Error("No valid OMNI rows were found in this interval after cleaning missing values.");
    }

    appendStatus(`Solving WINDMI using ${loadInfo.rows.length.toLocaleString()} OMNI rows...`, "neutral");

    // Give the UI a moment to paint before a large solve.
    await new Promise(resolve => setTimeout(resolve, 40));

    const solution = solveWindmi(loadInfo.rows, {
      params,
      initialState,
      icMode: selectors.icMode.value,
      icConstant: Number(selectors.icConstant.value),
      icPercentile: Number(selectors.icPercentile.value)
    });

    const plotted = solution.output.filter(row => row.time >= start && row.time <= end);
    latestRun = {
      source,
      start,
      end,
      spinupHours,
      loadInfo,
      solution,
      plotted
    };

    showPlotPage();
    await new Promise(resolve => setTimeout(resolve, 60));
    plotRun(latestRun);
    selectors.exportBtn.disabled = false;

    setStatus(
      `Done.\n` +
      `Loaded source: ${loadInfo.sourceLabel}\n` +
      `Years/files: ${loadInfo.fileLabels.join(", ")}\n` +
      `Rows used for solve: ${loadInfo.rows.length.toLocaleString()}\n` +
      `Rows plotted: ${plotted.length.toLocaleString()}\n` +
      `I_c used: ${(solution.meta.ic / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })} kA`,
      "ok"
    );

  } catch (error) {
    console.error(error);
    setStatus(error.message || String(error), "error");
  } finally {
    selectors.runBtn.disabled = false;
  }
}

function yearsNeeded(startDate, endDate, spinupHours) {
  const modelStart = new Date(startDate.getTime() - spinupHours * 3600 * 1000);
  const startYear = modelStart.getUTCFullYear();
  const endYear = endDate.getUTCFullYear();

  const years = [];
  for (let year = startYear; year <= endYear; year += 1) years.push(year);
  return years;
}

async function loadOmniFromRepo(start, end, params, spinupHours) {
  const modelStart = new Date(start.getTime() - spinupHours * 3600 * 1000);
  const years = yearsNeeded(start, end, spinupHours);
  const rows = [];
  const fileLabels = [];
  const pattern = selectors.dataPathPattern.value.trim() || "data/omni_{year}.csv";

  for (const year of years) {
    const url = pattern.replace("{year}", String(year));
    fileLabels.push(url);
    setStatus(`Loading ${url}...`, "neutral");

    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`Could not load ${url}. Make sure data/omni_${year}.csv exists and GitHub Pages has finished deploying.`);
    }

    const csvText = await response.text();
    const parsedRows = parseOmniCsvText(csvText, modelStart, end, params);
    rows.push(...parsedRows);
  }

  const cleaned = finalizeOmniRows(rows);
  return {
    rows: cleaned,
    fileLabels,
    sourceLabel: "built-in yearly files",
    years
  };
}

async function loadOmniFromUploadedFile(file, start, end, params, spinupHours) {
  const modelStart = new Date(start.getTime() - spinupHours * 3600 * 1000);
  setStatus(`Reading uploaded file: ${file.name}...`, "neutral");
  const csvText = await file.text();
  const rows = parseOmniCsvText(csvText, modelStart, end, params);
  const cleaned = finalizeOmniRows(rows);

  return {
    rows: cleaned,
    fileLabels: [file.name],
    sourceLabel: "uploaded file",
    years: []
  };
}

function parseOmniCsvText(csvText, modelStart, end, params) {
  const parsed = Papa.parse(csvText, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    comments: "#"
  });

  if (parsed.errors && parsed.errors.length) {
    const serious = parsed.errors.filter(error => error.type !== "FieldMismatch");
    if (serious.length) console.warn("Papa Parse warnings:", serious.slice(0, 5));
  }

  const headers = parsed.meta.fields || [];
  const keys = detectOmniColumns(headers);
  if (!keys.time || !keys.bz || !keys.vx) {
    throw new Error(
      `Could not identify OMNI columns. Found headers: ${headers.join(", ")}\n` +
      `Expected a time column, a Bz column, and a Vx velocity column.`
    );
  }

  const rows = [];
  for (const rawRow of parsed.data) {
    const row = rowToOmni(rawRow, keys, params);
    if (!row) continue;
    if (row.time >= modelStart && row.time <= end) rows.push(row);
  }

  return rows;
}

function detectOmniColumns(headers) {
  const normalizedHeaders = headers.map(header => ({ raw: header, norm: normalizeHeader(header) }));

  const time = findFirst(normalizedHeaders, item =>
    item.norm.includes("epoch") || item.norm === "time" || item.norm.includes("datetime") || item.norm.includes("dateutc")
  );

  const bz = findFirst(normalizedHeaders, item =>
    item.norm.includes("bz") && !item.norm.includes("sigma")
  );

  const vx = findFirst(normalizedHeaders, item =>
    item.norm.includes("vx") || (item.norm.includes("velocity") && item.norm.includes("gse"))
  );

  return {
    time: time?.raw,
    bz: bz?.raw,
    vx: vx?.raw
  };
}

function normalizeHeader(header) {
  return String(header || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findFirst(items, predicate) {
  for (const item of items) {
    if (predicate(item)) return item;
  }
  return null;
}

function rowToOmni(rawRow, keys, params) {
  const time = parseOmniTime(rawRow[keys.time]);
  if (!time || Number.isNaN(time.getTime())) return null;

  let bz = toNumber(rawRow[keys.bz]);
  let vx = toNumber(rawRow[keys.vx]);

  // OMNI fill values commonly appear as Bz = 9999.99 and Vx = 99999.9.
  if (!Number.isFinite(bz) || Math.abs(bz) >= 9000) bz = NaN;
  if (!Number.isFinite(vx) || Math.abs(vx) >= 90000) vx = NaN;

  return {
    time,
    bz,
    vx,
    vbs: computeVbs(bz, vx, params)
  };
}

function parseOmniTime(value) {
  if (value instanceof Date) return value;
  if (typeof value === "number") return null;

  const text = String(value || "").trim();
  if (!text) return null;

  // ISO case: 2000-01-01T00:00:00.000Z
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return new Date(text);

  // OMNI text case: 01-01-2000 00:00:00.000, interpreted as dd-mm-yyyy UTC.
  const ddmmyyyy = text.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy, hh, min, ss = "0"] = ddmmyyyy;
    return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss)));
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toNumber(value) {
  if (typeof value === "number") return value;
  const n = Number(String(value || "").trim());
  return Number.isFinite(n) ? n : NaN;
}

function finalizeOmniRows(rows) {
  const sorted = rows
    .filter(row => row.time instanceof Date && !Number.isNaN(row.time.getTime()))
    .sort((a, b) => a.time - b.time);

  dedupeRowsInPlace(sorted);

  const maxGapMinutes = Math.max(1, Number(selectors.maxGapMinutes.value) || 30);

  if (selectors.interpolateMissing.checked) {
    interpolateField(sorted, "bz", maxGapMinutes);
    interpolateField(sorted, "vx", maxGapMinutes);
    sorted.forEach(row => {
      row.vbs = computeVbs(row.bz, row.vx, collectParams());
    });
  }

  const cleaned = sorted.filter(row =>
    Number.isFinite(row.bz) && Number.isFinite(row.vx) && Number.isFinite(row.vbs)
  );

  checkContinuity(cleaned, maxGapMinutes);
  return cleaned;
}

function dedupeRowsInPlace(rows) {
  if (rows.length < 2) return;
  let write = 1;
  for (let read = 1; read < rows.length; read += 1) {
    if (rows[read].time.getTime() !== rows[write - 1].time.getTime()) {
      rows[write] = rows[read];
      write += 1;
    }
  }
  rows.length = write;
}

function interpolateField(rows, field, maxGapMinutes) {
  let i = 0;
  while (i < rows.length) {
    if (Number.isFinite(rows[i][field])) {
      i += 1;
      continue;
    }

    const startMissing = i;
    while (i < rows.length && !Number.isFinite(rows[i][field])) i += 1;
    const endMissing = i - 1;
    const before = startMissing - 1;
    const after = i;

    if (before < 0 || after >= rows.length) continue;
    if (!Number.isFinite(rows[before][field]) || !Number.isFinite(rows[after][field])) continue;

    const gapMinutes = (rows[after].time - rows[before].time) / 60000;
    if (gapMinutes > maxGapMinutes + 1) continue;

    const t0 = rows[before].time.getTime();
    const t1 = rows[after].time.getTime();
    const y0 = rows[before][field];
    const y1 = rows[after][field];

    for (let j = startMissing; j <= endMissing; j += 1) {
      const fraction = (rows[j].time.getTime() - t0) / (t1 - t0);
      rows[j][field] = y0 + fraction * (y1 - y0);
    }
  }
}

function checkContinuity(rows, maxGapMinutes) {
  if (rows.length < 2) return;
  const allowedMs = (maxGapMinutes + 1.5) * 60000;

  for (let i = 1; i < rows.length; i += 1) {
    const gap = rows[i].time - rows[i - 1].time;
    if (gap > allowedMs) {
      throw new Error(
        `Large data gap detected after cleaning: ${formatUtc(rows[i - 1].time)} to ${formatUtc(rows[i].time)}.\n` +
        `Increase the interpolation gap setting, choose another interval, or check the source data.`
      );
    }
  }
}

function plotRun(run) {
  const rows = run.plotted;
  if (!rows.length) throw new Error("No model output rows fall inside the selected plotting interval.");

  const times = rows.map(row => row.time);
  const icKA = run.solution.meta.ic / 1000;
  const titleDate = formatDateRange(run.start, run.end);

  const baseLayout = {
    autosize: true,
    margin: { l: 70, r: 70, t: 48, b: 44 },
    paper_bgcolor: "white",
    plot_bgcolor: "white",
    hovermode: "x unified",
    font: { family: "Inter, Arial, sans-serif", size: 12, color: "#172033" },
    xaxis: {
      title: "UT",
      showgrid: true,
      gridcolor: "#edf1f7",
      zeroline: false
    },
    yaxis: {
      showgrid: true,
      gridcolor: "#edf1f7",
      zeroline: false
    },
    legend: { orientation: "h", x: 0, y: 1.18, xanchor: "left" }
  };

  const config = {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["lasso2d", "select2d"]
  };

  Plotly.react(selectors.plotVbs, [
    {
      x: times,
      y: rows.map(row => row.vbs / 1000),
      type: "scatter",
      mode: "lines",
      name: "vBₛ",
      line: { color: "#1f2937", width: 1.8 },
      hovertemplate: "%{y:.3f} kV<extra>vBₛ</extra>"
    }
  ], {
    ...baseLayout,
    title: { text: `(a) Solar wind input vBₛ — ${titleDate}`, x: 0.02, xanchor: "left", font: { size: 14 } },
    yaxis: { ...baseLayout.yaxis, title: "vBₛ (kV)" }
  }, config);

  Plotly.react(selectors.plotITheta, [
    {
      x: times,
      y: rows.map(row => row.theta),
      type: "scatter",
      mode: "lines",
      name: "θ",
      yaxis: "y2",
      fill: "tozeroy",
      fillcolor: "rgba(112, 173, 71, 0.22)",
      line: { color: "rgba(112, 173, 71, 0.45)", width: 0.5 },
      hovertemplate: "%{y:.3f}<extra>θ</extra>"
    },
    {
      x: times,
      y: rows.map(row => row.I / 1000),
      type: "scatter",
      mode: "lines",
      name: "I",
      line: { color: "#111827", width: 1.8 },
      hovertemplate: "%{y:.3f} kA<extra>I</extra>"
    },
    {
      x: times,
      y: rows.map(() => icKA),
      type: "scatter",
      mode: "lines",
      name: "I<sub>c</sub>",
      line: { color: "#2563eb", width: 1.3, dash: "dash" },
      hovertemplate: `%{y:.3f} kA<extra>I<sub>c</sub></extra>`
    }
  ], {
    ...baseLayout,
    title: { text: `(b) WINDMI magnetotail current I and trigger θ`, x: 0.02, xanchor: "left", font: { size: 14 } },
    yaxis: { ...baseLayout.yaxis, title: "I (kA)" },
    yaxis2: {
      title: "θ",
      overlaying: "y",
      side: "right",
      range: [0, 1],
      showgrid: false,
      zeroline: false
    }
  }, config);

  Plotly.react(selectors.plotI1, [
    {
      x: times,
      y: rows.map(row => row.I1 / 1000),
      type: "scatter",
      mode: "lines",
      name: "I₁",
      line: { color: "#111827", width: 1.8 },
      hovertemplate: "%{y:.3f} kA<extra>I₁</extra>"
    },
    {
      x: times,
      y: rows.map(() => icKA),
      type: "scatter",
      mode: "lines",
      name: "I<sub>c</sub>",
      line: { color: "#2563eb", width: 1.3, dash: "dash" },
      hovertemplate: `%{y:.3f} kA<extra>I<sub>c</sub></extra>`
    }
  ], {
    ...baseLayout,
    title: { text: `(c) WINDMI R1 current I₁`, x: 0.02, xanchor: "left", font: { size: 14 } },
    yaxis: { ...baseLayout.yaxis, title: "I₁ (kA)" }
  }, config);

  selectors.runSummary.innerHTML = `
    <strong>${formatUtc(run.start)} to ${formatUtc(run.end)}</strong><br />
    Source: ${run.loadInfo.sourceLabel}<br />
    I<sub>c</sub>: ${(run.solution.meta.ic / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })} kA<br />
    Points: ${rows.length.toLocaleString()}
  `;

  attachPlotSync();
}

function attachPlotSync() {
  const divs = [selectors.plotVbs, selectors.plotITheta, selectors.plotI1];
  divs.forEach(source => {
    source.removeAllListeners?.("plotly_relayout");
    source.on?.("plotly_relayout", eventData => {
      if (syncInProgress) return;
      const range0 = eventData["xaxis.range[0]"];
      const range1 = eventData["xaxis.range[1]"];
      const autorange = eventData["xaxis.autorange"];

      if (range0 === undefined && range1 === undefined && autorange === undefined) return;

      syncInProgress = true;
      const update = autorange ? { "xaxis.autorange": true } : { "xaxis.range": [range0, range1] };
      Promise.all(divs.filter(div => div !== source).map(div => Plotly.relayout(div, update)))
        .finally(() => { syncInProgress = false; });
    });
  });
}

function exportLatestRun() {
  if (!latestRun || !latestRun.plotted.length) return;

  const columns = [
    "time_utc", "bz_nT", "vx_km_s", "vbs_V", "I_A", "V", "p", "K_parallel",
    "I1_A", "V1", "I2_A", "Wrc", "theta", "Ips_A", "Ic_A"
  ];

  const lines = [columns.join(",")];
  latestRun.plotted.forEach(row => {
    const values = [
      row.time.toISOString(), row.bz, row.vx, row.vbs, row.I, row.V, row.p, row.K,
      row.I1, row.V1, row.I2, row.Wrc, row.theta, row.Ips, row.Ic
    ];
    lines.push(values.map(csvEscape).join(","));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `windmi_output_${compactTime(latestRun.start)}_${compactTime(latestRun.end)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function compactTime(date) {
  const pad = n => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`;
}

function formatUtc(date) {
  return date.toISOString().replace(".000Z", "Z");
}

function formatDateRange(start, end) {
  const sameDay = start.getUTCFullYear() === end.getUTCFullYear()
    && start.getUTCMonth() === end.getUTCMonth()
    && start.getUTCDate() === end.getUTCDate();

  if (sameDay) {
    return start.toLocaleDateString(undefined, { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" });
  }

  return `${start.toLocaleDateString(undefined, { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}–${end.toLocaleDateString(undefined, { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}`;
}
