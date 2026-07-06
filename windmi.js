/* WINDMI numerical model translated from the user's MATLAB/Simulink workflow.
   The system state is: I, V, p, Kpar, I1, V1, I2, Wrc.
   Units follow the parameter set supplied in the MATLAB code. */

const WINDMI_DEFAULT_PARAMS = Object.freeze({
  L: 90,
  L1: 20,
  L2: 8,
  L_y: 3.2e7,
  C: 50000,
  C1: 800,
  R_prc: 0.1,
  R_A2: 0.3,
  M: 0.1,
  DeltaI: 1.25e5,
  Sigma: 8,
  Sigma1: 3,
  Mu0: 4.2e-9,
  A_eff: 8.14e13,
  B_tr: 5e-9,
  Omega_cps: 2.6e24,
  Tau_E: 30 * 60,
  Tau_p: 10 * 60,
  Tau_rc: 12 * 3600,
  Alpha: 8e11,
  V0: 4000,
  driverLyRe: 10,
  R_E: 6380e3
});

const WINDMI_DEFAULT_INITIAL = Object.freeze({
  I: 0,
  V: 0,
  p: 0,
  Kpar: 0,
  I1: 0,
  V1: 0,
  I2: 0,
  Wrc: 0
});

function copyState(s) {
  return {
    I: Number(s.I) || 0,
    V: Number(s.V) || 0,
    p: Number(s.p) || 0,
    Kpar: Number(s.Kpar) || 0,
    I1: Number(s.I1) || 0,
    V1: Number(s.V1) || 0,
    I2: Number(s.I2) || 0,
    Wrc: Number(s.Wrc) || 0
  };
}

function thetaFunction(I, Ic, DeltaI) {
  return 0.5 * (1 + Math.tanh((I - Ic) / DeltaI));
}

function pressureCurrent(p, params) {
  return params.Alpha * Math.sqrt(Math.max(p, 0));
}

function windmiAuxiliary(state, params, Ic, Vbs) {
  const pSafe = Math.max(state.p, 0);
  const kSafe = Math.max(state.Kpar, 0);
  const Ips = pressureCurrent(pSafe, params);
  const Theta = thetaFunction(state.I, Ic, params.DeltaI);
  const injectionPower = (pSafe * state.V * params.A_eff) / (params.B_tr * params.L_y);

  return {
    Ips,
    Theta,
    injectionPower,
    Vbs
  };
}

function windmiDerivatives(state, Vsw, params, Ic) {
  const pSafe = Math.max(state.p, 0);
  const kSafe = Math.max(state.Kpar, 0);
  const Ips = pressureCurrent(pSafe, params);
  const Theta = thetaFunction(state.I, Ic, params.DeltaI);

  // Coupled equations:
  // L dI/dt = Vsw - V + M dI1/dt
  // L1 dI1/dt = V - V1 + M dI/dt
  const A = Vsw - state.V;
  const B = state.V - state.V1;
  const det = params.L * params.L1 - params.M * params.M;

  if (Math.abs(det) < 1e-12) {
    throw new Error("Invalid parameters: L * L1 - M^2 is too close to zero.");
  }

  const dI = (params.L1 * A + params.M * B) / det;
  const dI1 = (params.M * A + params.L * B) / det;

  const dV = (state.I - state.I1 - Ips - params.Sigma * state.V) / params.C;

  const pressureHeating = (params.Sigma * state.V * state.V) / params.Omega_cps;
  const unloadingLoss = params.Mu0 * pSafe * Math.sqrt(kSafe) * Theta;
  const injectionLoss = (pSafe * state.V * params.A_eff) / (params.Omega_cps * params.B_tr * params.L_y);
  const thermalLoss = (3 * pSafe) / (2 * params.Tau_E);
  const dp = (2 / 3) * (pressureHeating - unloadingLoss - injectionLoss - thermalLoss);

  const dKpar = Ips * state.V - state.Kpar / params.Tau_p;
  const dV1 = (state.I1 - state.I2 - params.Sigma1 * state.V1) / params.C1;
  const dI2 = (state.V1 - (params.R_prc + params.R_A2) * state.I2) / params.L2;
  const dWrc = params.R_prc * state.I2 * state.I2 +
    (pSafe * state.V * params.A_eff) / (params.B_tr * params.L_y) -
    state.Wrc / params.Tau_rc;

  return { dI, dV, dp, dKpar, dI1, dV1, dI2, dWrc };
}

function addScaledState(state, deriv, scale) {
  return {
    I: state.I + scale * deriv.dI,
    V: state.V + scale * deriv.dV,
    p: state.p + scale * deriv.dp,
    Kpar: state.Kpar + scale * deriv.dKpar,
    I1: state.I1 + scale * deriv.dI1,
    V1: state.V1 + scale * deriv.dV1,
    I2: state.I2 + scale * deriv.dI2,
    Wrc: state.Wrc + scale * deriv.dWrc
  };
}

function rk4Step(state, Vsw, dt, params, Ic) {
  const k1 = windmiDerivatives(state, Vsw, params, Ic);
  const k2 = windmiDerivatives(addScaledState(state, k1, dt / 2), Vsw, params, Ic);
  const k3 = windmiDerivatives(addScaledState(state, k2, dt / 2), Vsw, params, Ic);
  const k4 = windmiDerivatives(addScaledState(state, k3, dt), Vsw, params, Ic);

  const next = {
    I: state.I + (dt / 6) * (k1.dI + 2 * k2.dI + 2 * k3.dI + k4.dI),
    V: state.V + (dt / 6) * (k1.dV + 2 * k2.dV + 2 * k3.dV + k4.dV),
    p: state.p + (dt / 6) * (k1.dp + 2 * k2.dp + 2 * k3.dp + k4.dp),
    Kpar: state.Kpar + (dt / 6) * (k1.dKpar + 2 * k2.dKpar + 2 * k3.dKpar + k4.dKpar),
    I1: state.I1 + (dt / 6) * (k1.dI1 + 2 * k2.dI1 + 2 * k3.dI1 + k4.dI1),
    V1: state.V1 + (dt / 6) * (k1.dV1 + 2 * k2.dV1 + 2 * k3.dV1 + k4.dV1),
    I2: state.I2 + (dt / 6) * (k1.dI2 + 2 * k2.dI2 + 2 * k3.dI2 + k4.dI2),
    Wrc: state.Wrc + (dt / 6) * (k1.dWrc + 2 * k2.dWrc + 2 * k3.dWrc + k4.dWrc)
  };

  // Physical reservoirs should not become negative. This also protects against
  // occasional RK overshoot at sharp transitions.
  next.p = Math.max(next.p, 0);
  next.Kpar = Math.max(next.Kpar, 0);
  next.Wrc = Math.max(next.Wrc, 0);

  for (const key of Object.keys(next)) {
    if (!Number.isFinite(next[key])) {
      throw new Error(`Numerical instability: ${key} became ${next[key]}. Try a smaller RK4 step.`);
    }
  }

  return next;
}

function computeVbs(bz, vx, params) {
  const bzNeg = bz > 0 ? 0 : bz;
  const driverLy = params.driverLyRe * params.R_E;
  return params.V0 + driverLy * 1e-6 * Math.abs(vx * bzNeg);
}

function solveWindmiSeries(inputRows, params, Ic, initialState, options = {}) {
  if (!Array.isArray(inputRows) || inputRows.length < 2) {
    throw new Error("At least two OMNI rows are required for integration.");
  }

  const maxStepSeconds = Math.max(1, Number(options.maxStepSeconds) || 60);
  const rows = [];
  let state = copyState(initialState);

  for (let i = 0; i < inputRows.length; i++) {
    const row = inputRows[i];
    const Vbs = Number(row.vbs);
    const aux = windmiAuxiliary(state, params, Ic, Vbs);
    rows.push({
      time: row.time,
      timeISO: row.time.toISOString(),
      Bz: row.bz,
      Vx: row.vx,
      Vbs,
      I: state.I,
      V: state.V,
      p: state.p,
      Kpar: state.Kpar,
      I1: state.I1,
      V1: state.V1,
      I2: state.I2,
      Wrc: state.Wrc,
      Ips: aux.Ips,
      Theta: aux.Theta,
      Ic
    });

    if (i === inputRows.length - 1) break;

    const dtTotal = (inputRows[i + 1].time.getTime() - row.time.getTime()) / 1000;
    if (!Number.isFinite(dtTotal) || dtTotal <= 0) continue;

    const steps = Math.ceil(dtTotal / maxStepSeconds);
    const dt = dtTotal / steps;

    for (let j = 0; j < steps; j++) {
      state = rk4Step(state, Vbs, dt, params, Ic);
    }
  }

  return rows;
}

function percentile(values, p) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (clean.length === 0) return NaN;
  const q = Math.min(100, Math.max(0, Number(p))) / 100;
  const idx = (clean.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return clean[lo];
  return clean[lo] + (clean[hi] - clean[lo]) * (idx - lo);
}

function findThetaSegments(rows, threshold = 0.1) {
  const segments = [];
  let start = null;
  let peak = -Infinity;

  for (const row of rows) {
    if (row.Theta >= threshold) {
      if (!start) {
        start = row.time;
        peak = row.Theta;
      } else {
        peak = Math.max(peak, row.Theta);
      }
    } else if (start) {
      segments.push({ start, end: row.time, peakTheta: peak });
      start = null;
      peak = -Infinity;
    }
  }

  if (start) {
    segments.push({ start, end: rows[rows.length - 1].time, peakTheta: peak });
  }

  return segments;
}
