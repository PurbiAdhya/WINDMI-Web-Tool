const selectors = {};
let latestRun = null;
let syncInProgress = false;

const WINDMI_OUTPUT_META = [
  { key: "I", label: "I", units: "kA", scale: 1 / 1000 },
  { key: "V", label: "V", units: "V", scale: 1 },
  { key: "p", label: "p", units: "", scale: 1 },
  { key: "K", label: "K∥", units: "", scale: 1 },
  { key: "I1", label: "I₁", units: "kA", scale: 1 / 1000 },
  { key: "V1", label: "V₁", units: "V", scale: 1 },
  { key: "I2", label: "I₂", units: "kA", scale: 1 / 1000 },
  { key: "Wrc", label: "Wrc", units: "J", scale: 1 }
];

const DEFAULT_OUTPUT_KEYS = new Set(["I", "I1"]);

window.addEventListener("DOMContentLoaded", () => {
  cacheSelectors();
  buildParameterInputs();
  buildInitialInputs();
  buildOutputChecklist();
  setDefaultTimes();
  wireEvents();
  updateSourceVisibility();
});

function cacheSelectors() {
  const ids = [
    "fileInput", "uploadFieldWrap", "startTime", "endTime", "spinupHours",
    "icConstant", "icPercentile", "parameterGrid", "quickParameterGrid", "initialGrid", "interpolateMissing",
    "maxGapMinutes", "dataPathPattern", "runBtn", "exportBtn", "exportPlotBtn", "resetDefaultsBtn", "resetParamsBtn", "resetParamsBtnTop",
    "prevRangeBtn", "nextRangeBtn", "statusBox", "runSummary", "plotStack", "outputChecklist", "outputSelectionMessage"
  ];

  ids.forEach(id => selectors[id] = document.getElementById(id));
}

function buildParameterInputs() {
  selectors.parameterGrid.innerHTML = "";
  if (selectors.quickParameterGrid) selectors.quickParameterGrid.innerHTML = "";

  const quickKeys = new Set(["L", "C", "sigma"]);

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

    if (selectors.quickParameterGrid && quickKeys.has(key)) {
      const quickWrap = document.createElement("div");
      quickWrap.className = "field param-field quick-param-field";
      quickWrap.innerHTML = `
        <label for="quick-param-${key}">${label} ${units ? `<span class="units">(${units})</span>` : ""}</label>
        <input id="quick-param-${key}" data-quick-param-key="${key}" type="number" step="${stepValue}" value="${nominalValue}" title="Spinner step is 10% of the nominal value." />
      `;
      selectors.quickParameterGrid.appendChild(quickWrap);
    }
  });

  wireParameterSync();
}

function wireParameterSync() {
  document.querySelectorAll("[data-quick-param-key]").forEach(input => {
    input.addEventListener("input", () => {
      const full = document.querySelector(`[data-param-key="${input.dataset.quickParamKey}"]`);
      if (full && full.value !== input.value) full.value = input.value;
    });
  });

  document.querySelectorAll("[data-param-key]").forEach(input => {
    input.addEventListener("input", () => {
      const quick = document.querySelector(`[data-quick-param-key="${input.dataset.paramKey}"]`);
      if (quick && quick.value !== input.value) quick.value = input.value;
    });
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

function buildOutputChecklist() {
  if (!selectors.outputChecklist) return;
  selectors.outputChecklist.innerHTML = "";

  WINDMI_OUTPUT_META.forEach(meta => {
    const label = document.createElement("label");
    const checked = DEFAULT_OUTPUT_KEYS.has(meta.key) ? "checked" : "";
    label.innerHTML = `
      <input type="checkbox" data-output-key="${meta.key}" ${checked} />
      <span>${meta.label}${meta.units ? ` <small>(${meta.units})</small>` : ""}</span>
    `;
    selectors.outputChecklist.appendChild(label);
  });

  wireOutputSelectionRules();
}

function wireOutputSelectionRules() {
  document.querySelectorAll("[data-output-key]").forEach(input => {
    input.addEventListener("change", () => {
      const checked = document.querySelectorAll("[data-output-key]:checked");

      if (checked.length < 1) {
        input.checked = true;
        showOutputSelectionMessage("At least one state variable must be selected.", "warning");
      } else if (checked.length > 4) {
        input.checked = false;
        showOutputSelectionMessage("Select at most four state variables.", "warning");
      } else {
        showOutputSelectionMessage("Select at least one and at most four state variables.", "neutral");
      }

      updateOutputChecklistAvailability();
    });
  });

  updateOutputChecklistAvailability();
}

function updateOutputChecklistAvailability() {
  const checked = document.querySelectorAll("[data-output-key]:checked");
  const atMax = checked.length >= 4;

  document.querySelectorAll("[data-output-key]").forEach(input => {
    input.disabled = atMax && !input.checked;
  });
}

function showOutputSelectionMessage(message, mode = "neutral") {
  if (!selectors.outputSelectionMessage) return;
  selectors.outputSelectionMessage.textContent = message;
  selectors.outputSelectionMessage.classList.toggle("warning", mode === "warning");
}

function collectOutputSelection() {
  return Array.from(document.querySelectorAll("[data-output-key]:checked"))
    .map(input => input.dataset.outputKey);
}

function getValidatedOutputSelection() {
  const selected = collectOutputSelection();
  if (selected.length < 1 || selected.length > 4) {
    throw new Error("Please select at least one and at most four WINDMI state variables in Model Parameters → Output to show.");
  }
  return selected;
}

function getOutputMeta(key) {
  return WINDMI_OUTPUT_META.find(item => item.key === key);
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

  document.querySelectorAll("input[name='icModeRadio']").forEach(input => {
    input.addEventListener("change", updateTriggerVisibility);
  });
  updateTriggerVisibility();

  document.querySelectorAll("[data-view]").forEach(control => {
    control.addEventListener("click", event => {
      event.preventDefault();
      showView(control.dataset.view);
    });
  });

  selectors.runBtn.addEventListener("click", runModel);
  selectors.exportBtn.addEventListener("click", exportLatestRun);
  selectors.exportPlotBtn.addEventListener("click", exportPlotImage);
  if (selectors.prevRangeBtn) selectors.prevRangeBtn.addEventListener("click", () => shiftDateRange(-1));
  if (selectors.nextRangeBtn) selectors.nextRangeBtn.addEventListener("click", () => shiftDateRange(1));
  selectors.resetDefaultsBtn.addEventListener("click", resetDefaults);
  selectors.resetParamsBtn.addEventListener("click", resetNominalParameters);
  if (selectors.resetParamsBtnTop) {
    selectors.resetParamsBtnTop.addEventListener("click", resetNominalParameters);
  }
}

function updateSourceVisibility() {
  const source = selectedDataSource();
  if (selectors.uploadFieldWrap) selectors.uploadFieldWrap.style.opacity = source === "upload" ? "1" : "0.55";
  if (selectors.fileInput) selectors.fileInput.disabled = source !== "upload";
}

function selectedDataSource() {
  return document.querySelector("input[name='dataSource']:checked")?.value || "repo";
}

function selectedTriggerMode() {
  return document.querySelector("input[name='icModeRadio']:checked")?.value || "off";
}

function updateTriggerVisibility() {
  const mode = selectedTriggerMode();
  if (selectors.icConstant) selectors.icConstant.disabled = mode !== "constant";
  if (selectors.icPercentile) selectors.icPercentile.disabled = mode !== "percentile";
}

function resetDefaults() {
  buildParameterInputs();
  buildInitialInputs();
  buildOutputChecklist();
  const offRadio = document.querySelector("input[name='icModeRadio'][value='off']");
  if (offRadio) offRadio.checked = true;
  selectors.icConstant.value = "200";
  selectors.icPercentile.value = "70";
  updateTriggerVisibility();
  selectors.spinupHours.value = "2";
  selectors.interpolateMissing.checked = true;
  selectors.maxGapMinutes.value = "120";
  selectors.dataPathPattern.value = "data/omni_{year}.csv";
  setDefaultTimes();
  showView("runView");
  setStatus("Setup restored.", "neutral");
}

function resetNominalParameters() {
  buildParameterInputs();
  setStatus("Model parameters reset to nominal values.", "neutral");
}

function showView(viewId) {
  document.querySelectorAll(".view").forEach(view => {
    view.classList.toggle("active", view.id === viewId);
  });
  document.querySelectorAll(".nav-link").forEach(link => {
    link.classList.toggle("active", link.dataset.view === viewId);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => {
    getActivePlotDivs().forEach(el => {
      if (el && window.Plotly) Plotly.Plots.resize(el);
    });
    if (viewId === "aboutWindmiView" && window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise([document.getElementById("aboutWindmiView")]).catch(() => {});
    }
  }, 80);
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


function shiftDateRange(direction) {
  const start = parseUtcDatetimeLocal(selectors.startTime.value);
  const end = parseUtcDatetimeLocal(selectors.endTime.value);
  if (!start || !end || end <= start) {
    setStatus("Enter a valid date range before using Previous range or Next range.", "warning");
    return;
  }

  const durationMs = end.getTime() - start.getTime();
  const newStart = new Date(start.getTime() + direction * durationMs);
  const newEnd = new Date(end.getTime() + direction * durationMs);

  selectors.startTime.value = toDatetimeLocalValueUTC(newStart);
  selectors.endTime.value = toDatetimeLocalValueUTC(newEnd);
  setStatus(`${direction > 0 ? "Next" : "Previous"} range selected. Click Run WINDMI to update the plot.`, "neutral");
}

function collectParams() {
  const params = {};
  document.querySelectorAll("[data-param-key]").forEach(input => {
    params[input.dataset.paramKey] = Number(input.value);
  });
  document.querySelectorAll("[data-quick-param-key]").forEach(input => {
    params[input.dataset.quickParamKey] = Number(input.value);
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
    selectors.exportPlotBtn.disabled = true;
    latestRun = null;

    const start = parseUtcDatetimeLocal(selectors.startTime.value);
    const end = parseUtcDatetimeLocal(selectors.endTime.value);
    const spinupHours = Math.max(0, Number(selectors.spinupHours.value) || 0);
    const params = collectParams();
    const initialState = collectInitialState();
    const outputKeys = getValidatedOutputSelection();

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

    const triggerMode = selectedTriggerMode();
    const solution = solveWindmi(loadInfo.rows, {
      params,
      initialState,
      icMode: triggerMode,
      // UI input is in kA; WINDMI internals use A.
      icConstant: Number(selectors.icConstant.value) * 1000,
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
      triggerMode,
      outputKeys,
      plotted
    };

    showView("runView");
    await new Promise(resolve => setTimeout(resolve, 60));
    plotRun(latestRun);
    selectors.exportBtn.disabled = false;
    selectors.exportPlotBtn.disabled = false;

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

  const maxGapMinutes = Math.max(1, Number(selectors.maxGapMinutes.value) || 120);

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

  const stack = selectors.plotStack || document.getElementById("plotStack") || document.querySelector(".plot-stack");
  if (!stack) {
    throw new Error("Plot container was not found. Please replace index.html, style.css, and script.js together from the latest package.");
  }
  if (!window.Plotly) {
    throw new Error("Plotly did not load. Check your internet connection or CDN access.");
  }

  const plotTimes = rows.map(row => utcPlotString(row.time));
  const utcLabels = rows.map(row => formatUtc(row.time));
  const icKA = run.solution.meta.ic / 1000;
  const vbsSmoothedKV = runningAverage(rows.map(row => row.vbs / 1000), 5);
  const outputKeys = run.outputKeys && run.outputKeys.length ? run.outputKeys : getValidatedOutputSelection();

  if (outputKeys.length < 1 || outputKeys.length > 4) {
    throw new Error("Please select at least one and at most four state variables.");
  }

  const colors = {
    navy: "#073763",
    blue: "#2368a2",
    teal: "#0f9fb3",
    tealFill: "rgba(15, 159, 179, 0.20)",
    orange: "#d96c13",
    purple: "#6d5dfc",
    green: "#0f766e",
    amber: "#a16207",
    rose: "#be123c",
    slate: "#596579",
    grid: "#e8eef5",
    ink: "#111827"
  };

  stack.innerHTML = "";
  const plotDiv = document.createElement("div");
  plotDiv.className = "plot-panel combined-plot-panel";
  const rowCount = 1 + outputKeys.length;
  plotDiv.style.height = `${Math.max(500, 180 * rowCount + 70)}px`;
  stack.appendChild(plotDiv);

  const traces = [];
  const layout = makeCombinedPlotLayout(colors, rowCount);
  const domains = calculateYDomains(rowCount, 0.07);
  const palette = [colors.navy, colors.blue, colors.purple, colors.green, colors.amber, colors.rose, colors.slate];

  function axisId(prefix, rowNumber) {
    return rowNumber === 1 ? prefix : `${prefix}${rowNumber}`;
  }

  function layoutAxisKey(prefix, rowNumber) {
    return rowNumber === 1 ? `${prefix}axis` : `${prefix}axis${rowNumber}`;
  }

  function addSubplotAxes(rowNumber, yTitle, titleText, options = {}) {
    const xKey = layoutAxisKey("x", rowNumber);
    const yKey = layoutAxisKey("y", rowNumber);
    const showXAxisTitle = rowNumber === rowCount;

    layout[xKey] = {
      ...(layout[xKey] || {}),
      domain: [0, 1],
      anchor: axisId("y", rowNumber),
      matches: rowNumber === 1 ? undefined : "x",
      title: showXAxisTitle ? { text: "UT", font: { size: 14, color: colors.ink }, standoff: 18 } : { text: "" },
      showgrid: true,
      gridcolor: colors.grid,
      zeroline: false,
      showline: false,
      ticks: showXAxisTitle ? "outside" : "",
      tickfont: { size: 13, color: colors.ink },
      automargin: true,
      tickformat: showXAxisTitle ? "%H:%M<br>%b %-d, %Y" : "%H:%M",
      showticklabels: showXAxisTitle,
      nticks: showXAxisTitle ? 8 : undefined
    };

    layout[yKey] = {
      ...(layout[yKey] || {}),
      domain: domains[rowNumber - 1],
      anchor: axisId("x", rowNumber),
      title: { text: yTitle, font: { size: 14, color: colors.ink }, standoff: 10 },
      showgrid: true,
      gridcolor: colors.grid,
      zeroline: false,
      showline: false,
      ticks: "outside",
      tickfont: { size: 12.5, color: colors.ink },
      automargin: true,
      rangemode: options.rangemode || "normal"
    };

    layout.annotations.push({
      x: 0.5,
      y: Math.min(0.995, domains[rowNumber - 1][1] + 0.014),
      xref: "paper",
      yref: "paper",
      xanchor: "center",
      yanchor: "bottom",
      showarrow: false,
      text: `<b>${titleText}</b>`,
      font: { size: 16, color: colors.navy }
    });
  }

  addSubplotAxes(1, "vBₛ (kV)", "Solar wind input vBₛ", { rangemode: "tozero" });
  traces.push({
    x: plotTimes,
    y: vbsSmoothedKV,
    customdata: utcLabels,
    xaxis: axisId("x", 1),
    yaxis: axisId("y", 1),
    type: "scatter",
    mode: "lines",
    name: "5-min vBₛ",
    line: { color: colors.orange, width: 2.2 },
    hovertemplate: "%{customdata}<br>%{y:.3f} kV<extra>5-min vBₛ</extra>"
  });

  outputKeys.forEach((key, index) => {
    const rowNumber = index + 2;
    const meta = getOutputMeta(key);
    if (!meta) return;

    const scale = meta.scale || 1;
    const label = meta.label || key;
    const units = meta.units || "";
    const color = key === "I" ? colors.navy : palette[index % palette.length];
    const yValues = rows.map(row => row[key] * scale);
    const yAxisTitle = `${label}${units ? ` (${units})` : ""}`;
    const subplotTitle = key === "I" ? "Magnetotail current I and trigger θ" : label;

    addSubplotAxes(rowNumber, yAxisTitle, subplotTitle);

    if (key === "I") {
      const thetaAxisNumber = rowCount + 1;
      const thetaAxisId = axisId("y", thetaAxisNumber);
      const thetaLayoutKey = layoutAxisKey("y", thetaAxisNumber);
      layout[thetaLayoutKey] = {
        title: { text: "θ", font: { size: 14, color: colors.teal }, standoff: 10 },
        overlaying: axisId("y", rowNumber),
        side: "right",
        range: [0, 1],
        showgrid: false,
        zeroline: false,
        showline: false,
        ticks: "outside",
        tickfont: { size: 13, color: colors.teal },
        automargin: true
      };

      traces.push({
        x: plotTimes,
        y: rows.map(row => row.theta),
        customdata: utcLabels,
        xaxis: axisId("x", rowNumber),
        yaxis: thetaAxisId,
        type: "scatter",
        mode: "lines",
        name: "θ",
        fill: "tozeroy",
        fillcolor: colors.tealFill,
        line: { color: "rgba(15, 159, 179, 0.60)", width: 1.1 },
        hovertemplate: "%{customdata}<br>θ = %{y:.3f}<extra>θ</extra>"
      });
    }

    traces.push({
      x: plotTimes,
      y: yValues,
      customdata: utcLabels,
      xaxis: axisId("x", rowNumber),
      yaxis: axisId("y", rowNumber),
      type: "scatter",
      mode: "lines",
      name: label,
      line: { color, width: 2.1 },
      hovertemplate: `%{customdata}<br>%{y:.4g}${units ? ` ${units}` : ""}<extra>${label}</extra>`
    });

    if (key === "I" && run.triggerMode !== "off") {
      traces.push({
        x: plotTimes,
        y: rows.map(() => icKA),
        customdata: utcLabels,
        xaxis: axisId("x", rowNumber),
        yaxis: axisId("y", rowNumber),
        type: "scatter",
        mode: "lines",
        name: "I<sub>c</sub>",
        line: { color: colors.slate, width: 1.25, dash: "dash" },
        hovertemplate: `%{customdata}<br>%{y:.3f} kA<extra>I<sub>c</sub></extra>`
      });
    }
  });

  layout.showlegend = outputKeys.includes("I");
  if (layout.showlegend) {
    layout.legend = {
      orientation: "h",
      x: 0,
      y: 1.045,
      xanchor: "left",
      yanchor: "bottom",
      font: { size: 13 }
    };
  }

  const config = {
    responsive: true,
    displaylogo: false,
    displayModeBar: false,
    modeBarButtonsToRemove: ["lasso2d", "select2d"]
  };

  Plotly.react(plotDiv, traces, layout, config);

  selectors.runSummary.innerHTML = "";
  selectors.runSummary.classList.add("hidden");
}

function calculateYDomains(rowCount, gap = 0.045) {
  const usable = 1 - gap * (rowCount - 1);
  const rowHeight = usable / rowCount;
  const domains = [];
  for (let index = 0; index < rowCount; index += 1) {
    const top = 1 - index * (rowHeight + gap);
    const bottom = top - rowHeight;
    domains.push([Math.max(0, bottom), Math.min(1, top)]);
  }
  return domains;
}

function makeCombinedPlotLayout(colors, rowCount) {
  return {
    autosize: true,
    height: Math.max(500, 180 * rowCount + 70),
    margin: { l: 76, r: 70, t: 38, b: 74 },
    paper_bgcolor: "white",
    plot_bgcolor: "white",
    hovermode: "x unified",
    font: { family: "Inter, Arial, sans-serif", size: 13, color: colors.ink },
    annotations: [],
    showlegend: false
  };
}

function makeBasePlotLayout(colors) {
  return {
    autosize: true,
    margin: { l: 64, r: 58, t: 38, b: 36 },
    paper_bgcolor: "white",
    plot_bgcolor: "white",
    hovermode: "x unified",
    font: { family: "Inter, Arial, sans-serif", size: 12.5, color: colors.ink },
    xaxis: {
      title: { text: "UT", font: { size: 12.5, color: colors.ink } },
      showgrid: true,
      gridcolor: colors.grid,
      zeroline: false,
      showline: false,
      mirror: false,
      ticks: "outside",
      tickfont: { size: 11.5, color: colors.ink },
      automargin: true,
      tickformat: "%H:%M<br>%b %-d, %Y"
    },
    yaxis: {
      showgrid: true,
      gridcolor: colors.grid,
      zeroline: false,
      showline: false,
      mirror: false,
      ticks: "outside",
      tickfont: { size: 11.5, color: colors.ink },
      automargin: true,
      titlefont: { size: 12.5, color: colors.ink }
    },
    showlegend: false
  };
}

function letterForIndex(index) {
  return String.fromCharCode(96 + index);
}

function utcPlotString(date) {
  const pad = n => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function utcDateForPlot(date) {
  return new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds()
  );
}

function runningAverage(values, windowSize = 5) {
  const halfWindow = Math.floor(windowSize / 2);
  return values.map((_, index) => {
    let sum = 0;
    let count = 0;
    const start = Math.max(0, index - halfWindow);
    const end = Math.min(values.length - 1, index + halfWindow);
    for (let i = start; i <= end; i += 1) {
      const value = Number(values[i]);
      if (Number.isFinite(value)) {
        sum += value;
        count += 1;
      }
    }
    return count ? sum / count : null;
  });
}

function getActivePlotDivs() {
  return Array.from((selectors.plotStack || document).querySelectorAll(".plot-panel"));
}

function attachPlotSync(divs = getActivePlotDivs()) {
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


async function exportPlotImage() {
  if (!latestRun || !latestRun.plotted.length) return;

  try {
    selectors.exportPlotBtn.disabled = true;
    selectors.exportPlotBtn.textContent = "Preparing PNG...";

    const divs = getActivePlotDivs();
    const images = [];

    for (const div of divs) {
      const url = await Plotly.toImage(div, {
        format: "png",
        width: Math.max(900, div.clientWidth || 900),
        height: div.clientHeight || 150,
        scale: 2
      });
      images.push(await loadImage(url));
    }

    const padding = 24;
    const gap = 16;
    const width = Math.max(...images.map(img => img.width)) + padding * 2;
    const height = images.reduce((sum, img) => sum + img.height, 0) + gap * (images.length - 1) + padding * 2;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    let y = padding;
    for (const img of images) {
      ctx.drawImage(img, padding, y);
      y += img.height + gap;
    }

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `windmi_plot_${formatUtc(latestRun.start).slice(0, 10)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    selectors.exportPlotBtn.disabled = false;
    selectors.exportPlotBtn.textContent = "Export plot PNG";
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

