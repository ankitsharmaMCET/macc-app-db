/* Advanced math and finance helpers */

export function quadraticFit(xs, ys) {
  const n = xs.length;
  if (n < 3) return { a: 0, b: 0, c: 0, r2: null };

  let Sx = 0, Sx2 = 0, Sx3 = 0, Sx4 = 0, Sy = 0, Sxy = 0, Sx2y = 0;
  for (let i = 0; i < n; i++) {
    const x = Number(xs[i]);
    const y = Number(ys[i]);
    const x2 = x * x;
    Sx += x; Sx2 += x2; Sx3 += x2 * x; Sx4 += x2 * x2;
    Sy += y; Sxy += x * y; Sx2y += x2 * y;
  }

  const det = (m) => 
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

  const M = [[n, Sx, Sx2], [Sx, Sx2, Sx3], [Sx2, Sx3, Sx4]];
  const My = [[Sy, Sx, Sx2], [Sxy, Sx2, Sx3], [Sx2y, Sx3, Sx4]];
  const Mb = [[n, Sy, Sx2], [Sx, Sxy, Sx3], [Sx2, Sx2y, Sx4]];
  const Mc = [[n, Sx, Sy ], [Sx, Sx2, Sxy], [Sx2, Sx3, Sx2y]];

  const D = det(M);
  if (Math.abs(D) < 1e-12) return { a: 0, b: 0, c: 0, r2: null };

  const a = det(My) / D;
  const b = det(Mb) / D;
  const c = det(Mc) / D;

  const yMean = ys.reduce((s, y) => s + Number(y), 0) / n;
  let sse = 0, sst = 0;
  for (let i = 0; i < n; i++) {
    const x = Number(xs[i]);
    const y = Number(ys[i]);
    const yhat = a + b * x + c * x * x;
    sse += (y - yhat) ** 2;
    sst += (y - yMean) ** 2;
  }
  const r2 = sst > 0 ? 1 - (sse / sst) : null;
  return { a, b, c, r2 };
}

/* Interpolation across steps */
export function interpolateSeries(series) {
  const s = [...series];
  let lastIdx = null;
  for (let i = 0; i < s.length; i++) {
    const val = s[i];
    if (val === "" || val == null || !Number.isFinite(Number(val))) continue;
    
    if (lastIdx === null) {
      lastIdx = i;
      continue;
    }

    const dv = (Number(val) - Number(s[lastIdx])) / (i - lastIdx);
    for (let k = lastIdx + 1; k < i; k++) {
      s[k] = Number(s[lastIdx]) + dv * (k - lastIdx);
    }
    lastIdx = i;
  }
  return s;
}

export function annuityFactor(r, n) {
  const R = Number(r), N = Number(n);
  if (!Number.isFinite(R) || !Number.isFinite(N) || N <= 0) return 0;
  if (Math.abs(R) < 1e-9) return 1 / N;
  return (R * Math.pow(1 + R, N)) / (Math.pow(1 + R, N) - 1);
}

// Net Present Value (NPV) calculation
export function npv(rate, cashFlows, years, baseYear) {
  const R = Number(rate);
  let result = 0;

  for (let i = 0; i < cashFlows.length; i++) {
    const flow = Number(cashFlows[i] || 0);
    const year = years[i];
    const t = Math.max(0, year - baseYear); // time from base year
    
    // Discount factor: 1 / (1 + r)^t
    const discountFactor = t === 0 ? 1 : 1 / Math.pow(1 + R, t);
    result += flow * discountFactor;
  }

  return result;
}


// src/utils/mathHelpers.js

/**
 * Calculates a piecewise linear fit (segmented regression) for the MACC data.
 * For simplicity, this version calculates a 2-segment fit: one line for points where cost <= 0, 
 * and another line for points where cost > 0.
 */
export function calculatePiecewiseLinearFit(dataPoints) {
  if (dataPoints.length < 4) return { segments: [], r2: null }; 

  const negativeCostPoints = dataPoints.filter(p => p.cost <= 0);
  const positiveCostPoints = dataPoints.filter(p => p.cost > 0);

  // Helper to run simple linear regression (requires a dedicated utility, assuming its existence)
  const linearRegression = (points) => { /* ... returns { m, c, r2 } ... */ return { m: 0, c: 0, r2: 0 }; }; 

  let segments = [];
  
  if (negativeCostPoints.length >= 2) {
    const negFit = linearRegression(negativeCostPoints);
    segments.push({
      start_x: negativeCostPoints[0].x,
      end_x: negativeCostPoints[negativeCostPoints.length - 1].x,
      fit: negFit,
      // The function to map x -> y
      cost_func: (x) => negFit.m * x + negFit.c
    });
  }

  if (positiveCostPoints.length >= 2) {
    const posFit = linearRegression(positiveCostPoints);
    segments.push({
      start_x: positiveCostPoints[0].x,
      end_x: positiveCostPoints[positiveCostPoints.length - 1].x,
      fit: posFit,
      cost_func: (x) => posFit.m * x + posFit.c
    });
  }
  
  // Create a continuous array of plotted points (50 steps across the full X-axis range)
  // ... (Mapping points using the cost_func based on their x-position) ...
  const fittedPoints = [ /* ... array of { x, y } ... */ ];

  // A proper R² would compare the combined segmented lines against the data variance
  const combinedR2 = 0; // Simplified
  
  return { segments, fittedPoints, r2: combinedR2 };
}