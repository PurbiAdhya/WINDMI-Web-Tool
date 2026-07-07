/*
  WINDMI numerical model utilities.
  This file is deliberately framework-free so the site can run on GitHub Pages.
*/

const WINDMI_DEFAULT_PARAMS = {
  L: 90,
  L1: 20,
  L2: 8,
  Ly: 3.2e7,
  C: 50000,
  C1: 800,
  Rprc: 0.1,
  RA2: 0.3,
  M: 0.1,
  deltaI: 1.25e5,
  sigma: 8,
  sigma1: 3,
  mu0: 4.2e-9,
  Aeff: 8.14e13,
  Btr: 5e-9,
  omegaCps: 2.6e24,
  tauE: 30 * 60,
  tauParallel: 10 * 60,
  tauRc: 12 * 3600,
  alpha: 8e11,
  v0: 4000,
  vbsLyRE: 10,
  earthRadiusMeters: 6380e3
};

const WINDMI_PARAM_META = [
  ["L", "L", ""],
  ["L1", "L₁", ""],
  ["L2", "L₂", ""],
  ["Ly", "Lᵧ", "m"],
  ["C", "C", ""],
  ["C1", "C₁", ""],
  ["Rprc", "R_prc", ""],
  ["RA2", "R_A2", ""],
  ["M", "M", ""],
  ["deltaI", "ΔI", "A"],
  ["sigma", "Σ", ""],
  ["sigma1", "Σ₁", ""],
  ["mu0", "μ₀ / ω₀ factor", ""],
  ["Aeff", "A_eff", "m²"],
  ["Btr", "B_tr", "T"],
  ["omegaCps", "Ω_cps", ""],
  ["tauE", "τ_E", "s"],
  ["tauParallel", "τ_parallel", "s"],
  ["tauRc", "τ_rc", "s"],
  ["alpha", "α for I_ps = α√p", ""],
  ["v0", "V₀ for vB_s", "V"],
  ["vbsLyRE", "vB_s Lᵧ multiplier", "R_E"],
  ["earthRadiusMeters", "R_E", "m"]
];

const WINDMI_DEFAULT_INITIAL = {
  I: 0,
  V: 0,
  p: 0,
  K: 0,
  I1: 0,
  V1: 0,
  I2: 0,
  Wrc: 0
};

const WINDMI_INITIAL_META = [
  ["I", "I", "A"],
  ["V", "V", "V"],
  ["p", "p", ""],
  ["K", "K_parallel", ""],
  ["I1", "I₁", "A"],
  ["V1", "V₁", "V"],
  ["I2", "I₂", "A"],
  ["Wrc", "W_rc", "J"]
];

function cloneParams(params) {
  return { ...WINDMI_DEFAULT_PARAMS, ...params };
}

function thetaTrigger(I, Ic, deltaI) {
  if (!Number.isFinite(deltaI) || deltaI === 0) return I >= Ic ? 1 : 0;
  return 0.5 * (1 + Math.tanh((I - Ic) / deltaI));
}

function computeVbs(bzNt, vxKmS, params = WINDMI_DEFAULT_PARAMS) {
  const p = cloneParams(params);
  if (!Number.isFinite(bzNt) || !Number.isFinite(vxKmS)) return NaN;

  if (bzNt < 0) {
    const drivingLyMeters = p.vbsLyRE * p.earthRadiusMeters;
    return p.v0 + drivingLyMeters * 1e-6 * Math.abs(vxKmS * bzNt);
  }

  return p.v0;
}

function stateObjectToArray(initial) {
  return [
    Number(initial.I) || 0,
    Number(initial.V) || 0,
    Number(initial.p) || 0,
    Number(initial.K) || 0,
    Number(initial.I1) || 0,
    Number(initial.V1) || 0,
    Number(initial.I2) || 0,
    Number(initial.Wrc) || 0
  ];
}

function derivatives(y, vbs, params) {
  const p = params;

  const I = y[0];
  const V = y[1];
  const pressure = Math.max(y[2], 0);
  const Kparallel = Math.max(y[3], 0);
  const I1 = y[4];
  const V1 = y[5];
  const I2 = y[6];
  const Wrc = y[7];

  const Ic = p.Ic;
  const theta = thetaTrigger(I, Ic, p.deltaI);
  const Ips = p.alpha * Math.sqrt(pressure);

  // Equations (1) and (5) form a coupled 2x2 linear system for dI/dt and dI1/dt.
  const a = vbs - V;
  const b = V - V1;
  const determinant = p.L * p.L1 - p.M * p.M;

  if (Math.abs(determinant) < 1e-12) {
    throw new Error("Invalid WINDMI parameters: L*L1 - M^2 is too close to zero.");
  }

  const dI = (p.L1 * a + p.M * b) / determinant;
  const dI1 = (p.M * a + p.L * b) / determinant;

  const dV = (I - I1 - Ips - p.sigma * V) / p.C;

  const sqrtK = Math.sqrt(Kparallel);
  const pressureSource = (p.sigma * V * V) / p.omegaCps;
  const unloadingLoss = p.mu0 * pressure * sqrtK * theta;
  const injectionLoss = (pressure * V * p.Aeff) / (p.omegaCps * p.Btr * p.Ly);
  const energyLoss = (3 * pressure) / (2 * p.tauE);
  const dPressure = (2 / 3) * (pressureSource - unloadingLoss - injectionLoss - energyLoss);

  const dK = Ips * V - Kparallel / p.tauParallel;
  const dV1 = (I1 - I2 - p.sigma1 * V1) / p.C1;
  const dI2 = (V1 - (p.Rprc + p.RA2) * I2) / p.L2;
  const dWrc = p.Rprc * I2 * I2 + (pressure * V * p.Aeff) / (p.Btr * p.Ly) - Wrc / p.tauRc;

  return {
    dy: [dI, dV, dPressure, dK, dI1, dV1, dI2, dWrc],
    aux: { theta, Ips }
  };
}

function addScaled(y, dy, scale) {
  return y.map((value, i) => value + dy[i] * scale);
}

function rk4Step(y, v0, vHalf, v1, dt, params) {
  const k1 = derivatives(y, v0, params).dy;
  const k2 = derivatives(addScaled(y, k1, dt / 2), vHalf, params).dy;
  const k3 = derivatives(addScaled(y, k2, dt / 2), vHalf, params).dy;
  const k4 = derivatives(addScaled(y, k3, dt), v1, params).dy;

  return y.map((value, i) => value + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

function percentile(values, pct) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return NaN;
  if (pct <= 0) return clean[0];
  if (pct >= 100) return clean[clean.length - 1];

  const rank = (pct / 100) * (clean.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const weight = rank - lo;
  return clean[lo] * (1 - weight) + clean[hi] * weight;
}

function runSingleWindmiPass(rows, params, initialState) {
  if (!rows || rows.length < 2) {
    throw new Error("Need at least two OMNI rows to run the model.");
  }

  const y0 = stateObjectToArray(initialState);
  let y = y0.slice();
  const output = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const aux = derivatives(y, row.vbs, params).aux;

    output.push({
      time: row.time,
      bz: row.bz,
      vx: row.vx,
      vbs: row.vbs,
      I: y[0],
      V: y[1],
      p: Math.max(y[2], 0),
      K: Math.max(y[3], 0),
      I1: y[4],
      V1: y[5],
      I2: y[6],
      Wrc: y[7],
      theta: aux.theta,
      Ips: aux.Ips,
      Ic: params.Ic
    });

    if (i === rows.length - 1) break;

    const dt = (rows[i + 1].time.getTime() - row.time.getTime()) / 1000;
    if (!Number.isFinite(dt) || dt <= 0) continue;

    const v0 = row.vbs;
    const v1 = rows[i + 1].vbs;
    const vHalf = (v0 + v1) / 2;
    y = rk4Step(y, v0, vHalf, v1, dt, params);

    // Keep pressure-like quantities non-negative for numerical stability.
    if (y[2] < 0) y[2] = 0;
    if (y[3] < 0) y[3] = 0;
  }

  return output;
}

function solveWindmi(rows, options) {
  const paramsBase = cloneParams(options.params || {});
  const initialState = { ...WINDMI_DEFAULT_INITIAL, ...(options.initialState || {}) };
  const icMode = options.icMode || "off";
  const icConstant = Number(options.icConstant);
  const icPercentile = Number(options.icPercentile);

  let finalIc = Number.isFinite(icConstant) ? icConstant : 2e7;
  let prepassOutput = null;

  if (icMode === "off") {
    finalIc = 1e8;
  }

  if (icMode === "percentile") {
    const prepassParams = { ...paramsBase, Ic: finalIc };
    prepassOutput = runSingleWindmiPass(rows, prepassParams, initialState);
    finalIc = percentile(prepassOutput.map(row => row.I), Number.isFinite(icPercentile) ? icPercentile : 70);
    if (!Number.isFinite(finalIc)) {
      throw new Error("Could not calculate percentile Ic from the prepass output.");
    }
  }

  const finalParams = { ...paramsBase, Ic: finalIc };
  const output = runSingleWindmiPass(rows, finalParams, initialState);

  return {
    output,
    prepassOutput,
    meta: {
      icMode,
      ic: finalIc,
      icPercentile: icMode === "percentile" ? icPercentile : null,
      points: output.length
    }
  };
}
