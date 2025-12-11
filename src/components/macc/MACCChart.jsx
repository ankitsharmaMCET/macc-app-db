import React, { useState, useRef, useMemo } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, 
  ComposedChart, ReferenceArea, Customized, Tooltip 
} from "recharts";
import HoverOverlay from './HoverOverlay';
import ColorLegend from '../ui/ColorLegend';
import useLocalStorage from '../../hooks/useLocalStorage';
import { formatNumber, exportContainerSvgToPng } from "../../utils/dataHelpers";
import { PALETTE, UI_CLASSES } from "../../utils/constants";

// Placeholder for Piecewise Fit Data Structure (Assuming calculation happens in MACCAppInner)
const DEFAULT_PIECEWISE_RESULT = { fittedPoints: [], segments: [], r2: null };

// Fixed FX rate: assumes all inputs are INR
const FX_RATE_INR_PER_USD = 80;

export default function MACCChart({ 
  segments, 
  quad, 
  piecewiseFitResult = DEFAULT_PIECEWISE_RESULT, 
  maccData, 
  costModel, 
  mode, 
  totalWidth, 
  yDomain, 
  currency,          // base / internal currency (assumed INR)
  carbonPrice,       // in INR/tCO2
  activeBaseline, 
  targetIntensityPct, 
  budgetToTarget,    // budget currently in INR
  targetX 
}) {
  const maccRef = useRef(null);
  const [hoverInfo, setHoverInfo] = useState(null);

  // Display currency (only affects chart & side panel display)
  const [displayCurrency, setDisplayCurrency] = useLocalStorage(
    'macc_display_currency',
    'INR'
  );
  const fx = displayCurrency === 'INR' ? 1 : 1 / FX_RATE_INR_PER_USD; // INR → USD
  const currencySymbol = displayCurrency === 'INR' ? '₹' : '$';

  const axisData = useMemo(
    () => [{ x: 0 }, { x: totalWidth > 0 ? totalWidth : 1 }],
    [totalWidth]
  );

  // Normalize segment colors & scale cost into display currency
  const enhancedSegments = useMemo(() => {
    if (!Array.isArray(segments)) return [];
    return segments.map((s, idx) => {
      const fallback = s.color || PALETTE[idx % PALETTE.length] || "#4e79a7";
      const finalColor = s.color_hex || fallback;
      const baseCost = Number(s.cost) || 0; // assumed INR/tCO2
      return {
        ...s,
        color: finalColor,
        // cost in display currency (INR or USD)
        cost: baseCost * fx,
      };
    });
  }, [segments, fx]);

  // Determine model status and labels
  const isQuadraticModel = costModel === 'quadratic' && quad;
  const isPiecewiseModel = costModel === 'piecewise' && piecewiseFitResult && piecewiseFitResult.fittedPoints.length > 1;
  const modelToRender = isPiecewiseModel ? 'piecewise' : (isQuadraticModel ? 'quadratic' : 'step');

  // Domain Terminology for Axes
  const xAxisLabel = mode === 'capacity'
    ? 'Cumulative Abatement (tCO₂)'
    : 'Cumulative Intensity Reduction (%)';
  const yAxisLabel = `Marginal Cost (${currencySymbol}/tCO₂)`;

  // Helper for Target percentage prop structure
  const targetPctValue = targetIntensityPct?.value ?? 0;

  // Y-axis domain scaled to display currency
  const scaledYDomain = useMemo(() => {
    if (!yDomain || yDomain.length !== 2) return [0, 1];
    const [yMin, yMax] = yDomain;
    return [
      (Number(yMin) || 0) * fx,
      (Number(yMax) || 0) * fx
    ];
  }, [yDomain, fx]);

  // Function to render the common reference lines
  const renderReferenceElements = (targetLabel = 'Abatement Target') => {
    const cpDisplay = Number(carbonPrice || 0) * fx; // CP in display currency
    return (
      <>
        <ReferenceLine
          y={0}
          stroke="#4b5563"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
        <ReferenceLine
          y={cpDisplay}
          stroke="#f28e2b"
          strokeWidth={1.2}
          strokeDasharray="3 3"
          label={{
            value: `${currencySymbol} ${formatNumber(cpDisplay)} CP`,
            position: 'right',
            fill: '#f28e2b',
            fontSize: 11
          }}
        />
        {(targetX > 0 && targetX <= totalWidth) && (
          <ReferenceLine
            x={targetX}
            stroke="#4e79a7"
            strokeWidth={1.2}
            strokeDasharray="3 3"
            label={{
              value: targetLabel,
              position: 'top',
              fill: '#4e79a7',
              fontSize: 11
            }}
          />
        )}
      </>
    );
  };

  // --- Core Chart Rendering Logic (IIFE to handle mutual exclusion safely) ---
  const ChartComponent = (() => {
    // Shared Axis Props for the MACC visualization
    const sharedAxisProps = {
      dataKey: "x",
      type: "number",
      domain: [0, totalWidth],
      tickFormatter: (v) =>
        mode === 'capacity' ? formatNumber(v) : Number(v).toFixed(1) + '%',
      label: {
        value: xAxisLabel,
        position: 'insideBottom',
        dy: 28,
        fill: '#374151',
        fontWeight: '500'
      },
      tickLine: false,
      axisLine: { stroke: '#d1d5db' },
      tick: { fill: '#4b5563', fontSize: 12 },
    };
    const sharedYAxisProps = {
      tickFormatter: (v) => `${currencySymbol} ${formatNumber(v)}`,
      label: {
        value: yAxisLabel,
        angle: -90,
        position: 'insideLeft',
        fill: '#374151',
        style: { textAnchor: 'middle', fontWeight: '500' }
      },
      tickLine: false,
      axisLine: { stroke: '#d1d5db' },
      tick: { fill: '#4b5563', fontSize: 12 },
      domain: scaledYDomain,
    };
    const sharedMargin = { top: 20, right: 30, left: 24, bottom: 48 };

    // --- 1. PIECEWISE / QUADRATIC (Line Charts) ---
    if (modelToRender === 'piecewise' || modelToRender === 'quadratic') {
      const isPiecewise = modelToRender === 'piecewise';
      const fitResult = isPiecewise ? piecewiseFitResult : quad;

      // Scale fitted y values into display currency
      const lineData = (fitResult?.fitted || []).map((pt) => ({
        ...pt,
        y: (Number(pt.y) || 0) * fx,
      }));

      return (
        <LineChart data={lineData} margin={sharedMargin}>
          <defs>
            <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.12" />
            </filter>
          </defs>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
          <XAxis {...sharedAxisProps} />
          <YAxis {...sharedYAxisProps} />
          {renderReferenceElements('Abatement Target')}
          <Tooltip
            formatter={(value) => `${currencySymbol} ${formatNumber(value)}`}
          />
          <Line
            type={isPiecewise ? "linear" : "monotone"}
            dataKey="y"
            name={
              isPiecewise
                ? `Piecewise Linear MACC${
                    fitResult?.r2 != null && Number.isFinite(fitResult.r2)
                      ? ` (R² = ${fitResult.r2.toFixed(3)})`
                      : ""
                  }`
                : `Quadratic Trendline${
                    fitResult?.r2 != null && Number.isFinite(fitResult.r2)
                      ? ` (R² = ${fitResult.r2.toFixed(3)})`
                      : ""
                  }`
            }
            dot={false}
            stroke={isPiecewise ? PALETTE[2] : PALETTE[0]}
            strokeWidth={3}
            filter="url(#softShadow)"
          />
        </LineChart>
      );
    }

    // --- 2. STEP FUNCTION (Composed Chart) ---
    return (
      <ComposedChart data={axisData} margin={sharedMargin}>
        <defs>
          <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.12" />
          </filter>
        </defs>
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
        <XAxis {...sharedAxisProps} />
        <YAxis {...sharedYAxisProps} />
        {renderReferenceElements("Abatement Target")}

        {enhancedSegments.map((s) => (
          <ReferenceArea
            key={s.id}
            x1={s.x1_plot}
            x2={s.x2_plot}
            y1={0}
            y2={s.cost}           // already in display currency
            fill={s.color}
            fillOpacity={0.9}
            stroke="#ffffff"
            strokeOpacity={0.7}
            filter="url(#softShadow)"
          />
        ))}

        <Customized
          component={(props) => (
            <HoverOverlay
              {...props}
              segments={enhancedSegments} // uses display-currency costs
              maccRef={maccRef}
              setHoverInfo={setHoverInfo}
            />
          )}
        />
      </ComposedChart>
    );
  })();

  return (
    <section className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-gray-800">
          Sectoral MACC  — Marginal Abatement Cost Curve
        </h2>
        <div className="flex items-center gap-3">
          {/* Currency toggle */}
          <div className="hidden sm:flex items-center gap-1 text-xs text-gray-500">
            <span>Cost units:</span>
            <div className="inline-flex rounded-lg border border-gray-300 bg-gray-50 overflow-hidden">
              <button
                type="button"
                className={`px-2 py-1 text-[11px] ${
                  displayCurrency === 'INR'
                    ? 'bg-white text-gray-800 font-semibold'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
                onClick={() => setDisplayCurrency('INR')}
              >
                ₹ INR
              </button>
              <button
                type="button"
                className={`px-2 py-1 text-[11px] ${
                  displayCurrency === 'USD'
                    ? 'bg-white text-gray-800 font-semibold'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
                onClick={() => setDisplayCurrency('USD')}
              >
                $ USD
              </button>
            </div>
          </div>

          <button
            className={UI_CLASSES.SecondaryButton}
            onClick={() => exportContainerSvgToPng(maccRef.current, "macc.png")}
          >
            Export Chart PNG
          </button>
        </div>
      </div>
      
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Chart area */}
        <div className="flex-1 relative" ref={maccRef}>
          <ResponsiveContainer width="100%" height={450}>
            {ChartComponent}
          </ResponsiveContainer>

          {/* Hover tooltip */}
          {hoverInfo && hoverInfo.seg && (
            <div
              className="absolute z-50 bg-white/95 backdrop-blur-sm border border-gray-300 rounded-lg shadow-xl p-3 text-xs pointer-events-none"
              style={{ left: Math.max(8, hoverInfo.x), top: Math.max(8, hoverInfo.y) }}
            >
              <div className="font-bold text-gray-800">{hoverInfo.seg.name}</div>
              <div className="text-gray-600 border-b border-gray-200 pb-1 mb-1">
                Sector: {hoverInfo.seg.sector}
              </div>
              <div>
                Abatement Potential:{' '}
                <b className="text-blue-700">
                  {formatNumber(hoverInfo.seg.abatement)}
                </b>{' '}
                tCO₂
              </div>
              <div>
                Marginal Cost:{' '}
                <b className="text-red-600">
                  {currencySymbol} {formatNumber(hoverInfo.seg.cost)}
                </b>{' '}
                /tCO₂
              </div>
            </div>
          )}

          <ColorLegend items={enhancedSegments} max={16} />
        </div>

        {/* Target & Budget Side Panel */}
        <div className="w-full lg:w-[380px] bg-gray-50 rounded-xl p-4 border border-gray-200 shadow-inner">
          <h3 className="text-base font-semibold mb-3 border-b border-gray-200 pb-2 text-gray-800">
            Target & Budget
          </h3>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Set Abatement Target
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={targetPctValue}
              onChange={(e) => targetIntensityPct.setter(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-lg"
            />
            <div className="w-24 text-right font-semibold text-lg text-blue-700">
              {targetPctValue}%
            </div>
          </div>
          <div className="mt-2 text-[11px] text-gray-500">
            In <b>Intensity Reduction (%)</b> mode, % refers to share of baseline emissions per{' '}
            <b>{activeBaseline.production_label}</b>.
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Abatement Target Reached:</span>
              <b className="text-gray-800">
                {mode === 'capacity'
                  ? formatNumber(budgetToTarget.targetReached) + ' tCO₂'
                  : budgetToTarget.targetReached.toFixed(2) + '%'}
              </b>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">
                Cost to Achieve Target (Σ cost×tCO₂):
              </span>
              <b className="text-red-600">
                {currencySymbol}{' '}
                {formatNumber((budgetToTarget.budget || 0) * fx)}
              </b>
            </div>
          </div>

          {/* Summary for QUADRATIC Trendline */}
          {modelToRender === 'quadratic' && quad && (
            <div className="mt-5 pt-3 border-t border-gray-200">
              <h4 className="font-semibold text-gray-800">Quadratic Fit Equation</h4>
              {(() => {
                const aDisp = Number.isFinite(quad.a) ? quad.a * fx : null;
                const bDisp = Number.isFinite(quad.b) ? quad.b * fx : null;
                const cDisp = Number.isFinite(quad.c) ? quad.c * fx : null;
                return (
                  <code className="text-xs bg-gray-100 p-2 rounded-lg block mt-2 whitespace-pre-wrap">
                    cost(x) ={' '}
                    {aDisp != null ? aDisp.toFixed(4) : '—'}
                    {bDisp != null ? (bDisp >= 0 ? ' + ' : ' − ') : ' ± '}
                    {bDisp != null ? Math.abs(bDisp).toFixed(4) : '—'}·x
                    {cDisp != null ? (cDisp >= 0 ? ' + ' : ' − ') : ' ± '}
                    {cDisp != null ? Math.abs(cDisp).toFixed(6) : '—'}·x²
                  </code>
                );
              })()}
              <div className="text-sm text-gray-700 mt-2">
                R² ={' '}
                <span className="font-semibold text-blue-700">
                  {quad.r2 != null && Number.isFinite(quad.r2)
                    ? quad.r2.toFixed(4)
                    : '—'}
                </span>
              </div>
            </div>
          )}

          {/* Summary for PIECEWISE LINEAR Fit */}
          {modelToRender === 'piecewise' && isPiecewiseModel && (
            <div className="mt-5 pt-3 border-t border-gray-200">
              <h4 className="font-semibold text-gray-800">
                Piecewise Linear Fit Equation
              </h4>
              {piecewiseFitResult.segments.map((seg, index) => {
                const cDisp = (seg.fit?.c ?? 0) * fx;
                const mDisp = (seg.fit?.m ?? 0) * fx;
                return (
                  <code
                    key={index}
                    className="text-xs bg-gray-100 p-2 rounded-lg block mt-2 whitespace-pre-wrap"
                  >
                    Segment {index + 1} (x: {formatNumber(seg.start_x)} to{' '}
                    {formatNumber(seg.end_x)}):{'\n'}
                    cost(x) = {cDisp.toFixed(4)}{' '}
                    {mDisp >= 0 ? ' + ' : ' − '}{' '}
                    {Math.abs(mDisp).toFixed(4)}·x
                  </code>
                );
              })}
              <div className="text-sm text-gray-700 mt-2">
                Combined R² ={' '}
                <span className="font-semibold text-blue-700">
                  {piecewiseFitResult.r2 != null &&
                  Number.isFinite(piecewiseFitResult.r2)
                    ? piecewiseFitResult.r2.toFixed(4)
                    : '—'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-4">
        * Marginal Cost reflects Saved Cost minus Carbon Price. All costs shown here
        are in {displayCurrency === 'INR' ? 'Indian Rupees (₹)' : 'US Dollars ($)'}.
      </p>
    </section>
  );
}





// import React, { useState, useRef, useMemo } from 'react';
// import { 
//   XAxis, YAxis, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, 
//   ComposedChart, ReferenceArea, Customized, Tooltip 
// } from "recharts";
// import HoverOverlay from './HoverOverlay';
// import ColorLegend from '../ui/ColorLegend';
// import { formatNumber, exportContainerSvgToPng } from "../../utils/dataHelpers";
// import { PALETTE, UI_CLASSES } from "../../utils/constants";

// // Placeholder for Piecewise Fit Data Structure (Assuming calculation happens in MACCAppInner)
// const DEFAULT_PIECEWISE_RESULT = { fittedPoints: [], segments: [], r2: null };

// export default function MACCChart({ 
//   segments, 
//   quad, 
//   piecewiseFitResult = DEFAULT_PIECEWISE_RESULT, 
//   maccData, 
//   costModel, 
//   mode, 
//   totalWidth, 
//   yDomain, 
//   currency, 
//   carbonPrice, 
//   activeBaseline, 
//   targetIntensityPct, 
//   budgetToTarget, 
//   targetX 
// }) {
//   const maccRef = useRef(null);
//   const [hoverInfo, setHoverInfo] = useState(null);
  
//   const axisData = useMemo(
//     () => [{ x: 0 }, { x: totalWidth > 0 ? totalWidth : 1 }],
//     [totalWidth]
//   );

//   // Normalize segment colors: prefer user-defined color_hex, then existing color, then PALETTE fallback
//   const enhancedSegments = useMemo(() => {
//     if (!Array.isArray(segments)) return [];
//     return segments.map((s, idx) => {
//       // 1) user-defined override (from measure.color_hex / wizard)
//       const userColor =
//         s.color_hex ||
//         s.user_color ||      // in case you ever store it with a different key
//         null;

//       // 2) any existing base/sector color
//       const baseColor =
//         s.color ||
//         s.sectorColor ||
//         null;

//       // 3) palette fallback
//       const paletteColor = PALETTE[idx % PALETTE.length] || "#4e79a7";

//       const finalColor = userColor || baseColor || paletteColor;

//       return {
//         ...s,
//         color: finalColor,    // everything downstream uses this
//       };
//     });
//   }, [segments]);


//   // Determine model status and labels
//   const isQuadraticModel = costModel === 'quadratic' && quad;
//   const isPiecewiseModel = costModel === 'piecewise' && piecewiseFitResult && piecewiseFitResult.fittedPoints.length > 1;
//   const modelToRender = isPiecewiseModel ? 'piecewise' : (isQuadraticModel ? 'quadratic' : 'step');

//   // Domain Terminology for Axes
//   const xAxisLabel = mode === 'capacity'
//     ? 'Cumulative Abatement (tCO₂)'
//     : 'Cumulative Intensity Reduction (%)';
//   const yAxisLabel = `Marginal Cost (${currency}/tCO₂)`;
  
//   // Helper for Target percentage prop structure
//   const targetPctValue = targetIntensityPct?.value ?? 0;

//   // Function to render the common reference lines
//   const renderReferenceElements = (targetLabel = 'Abatement Target') => (
//     <React.Fragment>
//       <ReferenceLine
//         y={0}
//         stroke="#4b5563"
//         strokeWidth={1.5}
//         strokeDasharray="4 4"
//       />
//       <ReferenceLine
//         y={carbonPrice}
//         stroke="#f28e2b"
//         strokeWidth={1.2}
//         strokeDasharray="3 3"
//         label={{
//           value: `${currency} ${formatNumber(carbonPrice)} CP`,
//           position: 'right',
//           fill: '#f28e2b',
//           fontSize: 11,
//         }}
//       />
//       {(targetX > 0 && targetX <= totalWidth) && (
//         <ReferenceLine
//           x={targetX}
//           stroke="#4e79a7"
//           strokeWidth={1.2}
//           strokeDasharray="3 3"
//           label={{
//             value: targetLabel,
//             position: 'top',
//             fill: '#4e79a7',
//             fontSize: 11,
//           }}
//         />
//       )}
//     </React.Fragment>
//   );

//   // --- Core Chart Rendering Logic (IIFE to handle mutual exclusion safely) ---
//   const ChartComponent = (() => {
//     // Shared Axis Props for the MACC visualization
//     const sharedAxisProps = {
//       dataKey: "x",
//       type: "number",
//       domain: [0, totalWidth],
//       tickFormatter: (v) =>
//         mode === 'capacity' ? formatNumber(v) : Number(v).toFixed(1) + '%',
//       label: {
//         value: xAxisLabel,
//         position: 'insideBottom',
//         dy: 28,
//         fill: '#374151',
//         fontWeight: '500',
//       },
//       tickLine: false,
//       axisLine: { stroke: '#d1d5db' },
//       tick: { fill: '#4b5563', fontSize: 12 },
//     };

//     const sharedYAxisProps = {
//       tickFormatter: (v) => `${currency} ${formatNumber(v)}`,
//       label: {
//         value: yAxisLabel,
//         angle: -90,
//         position: 'insideLeft',
//         fill: '#374151',
//         style: { textAnchor: 'middle', fontWeight: '500' },
//       },
//       tickLine: false,
//       axisLine: { stroke: '#d1d5db' },
//       tick: { fill: '#4b5563', fontSize: 12 },
//       domain: yDomain,
//     };

//     const sharedMargin = { top: 20, right: 30, left: 24, bottom: 48 };

//     // --- 1. PIECEWISE / QUADRATIC (Line Charts) ---
//     if (modelToRender === 'piecewise' || modelToRender === 'quadratic') {
//       const isPiecewise = modelToRender === 'piecewise';
//       const fitResult = isPiecewise ? piecewiseFitResult : quad;
      
//       return (
//         <LineChart data={fitResult.fitted} margin={sharedMargin}>
//           <defs>
//             <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
//               <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.12" />
//             </filter>
//           </defs>
//           <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
//           <XAxis {...sharedAxisProps} />
//           <YAxis {...sharedYAxisProps} />
//           {renderReferenceElements('Abatement Target')}
//           <Tooltip formatter={(value) => `${currency} ${formatNumber(value)}`} />
//           <Line
//             type={isPiecewise ? "linear" : "monotone"}
//             dataKey="y"
//             name={
//               isPiecewise
//                 ? `Piecewise Linear MACC${
//                     fitResult?.r2 != null && Number.isFinite(fitResult.r2)
//                       ? ` (R² = ${fitResult.r2.toFixed(3)})`
//                       : ""
//                   }`
//                 : `Quadratic Trendline${
//                     fitResult?.r2 != null && Number.isFinite(fitResult.r2)
//                       ? ` (R² = ${fitResult.r2.toFixed(3)})`
//                       : ""
//                   }`
//             }
//             dot={false}
//             stroke={isPiecewise ? PALETTE[2] : PALETTE[0]}
//             strokeWidth={3}
//             filter="url(#softShadow)"
//           />
//         </LineChart>
//       );
//     }
    
//     // --- 2. STEP FUNCTION (Composed Chart) ---
//     return (
//       <ComposedChart data={axisData} margin={sharedMargin}>
//         <defs>
//           <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
//             <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.12" />
//           </filter>
//         </defs>
//         <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
//         <XAxis {...sharedAxisProps} />
//         <YAxis {...sharedYAxisProps} />
//         {renderReferenceElements("Abatement Target")}

//         {enhancedSegments.map((s) => (
//           <ReferenceArea
//             key={s.id}
//             x1={s.x1_plot}
//             x2={s.x2_plot}
//             y1={0}
//             y2={s.cost}
//             fill={s.color}          // now guaranteed to be final color
//             fillOpacity={0.9}
//             stroke="#ffffff"
//             strokeOpacity={0.7}
//             filter="url(#softShadow)"
//           />
//         ))}

//         <Customized
//           component={(props) => (
//             <HoverOverlay
//               {...props}
//               segments={enhancedSegments}  // make hover use the same colors
//               maccRef={maccRef}
//               setHoverInfo={setHoverInfo}
//             />
//           )}
//         />
//       </ComposedChart>
//     );
//   })(); // end IIFE

//   return (
//     <section className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 space-y-4">
//       <div className="flex items-center justify-between">
//         <h2 className="text-xl font-semibold text-gray-800">
//           Sectoral MACC — Marginal Abatement Cost Curve
//         </h2>
//         <button
//           className={UI_CLASSES.SecondaryButton}
//           onClick={() => exportContainerSvgToPng(maccRef.current, "macc.png")}
//         >
//           Export Chart PNG
//         </button>
//       </div>
      
//       <div className="flex flex-col lg:flex-row gap-6">
//         <div className="flex-1 relative" ref={maccRef}>
//           <ResponsiveContainer width="100%" height={450}>
//             {ChartComponent}
//           </ResponsiveContainer>

//           {/* Hover tooltip */}
//           {hoverInfo && hoverInfo.seg && (
//             <div
//               className="absolute z-50 bg-white/95 backdrop-blur-sm border border-gray-300 rounded-lg shadow-xl p-3 text-xs pointer-events-none"
//               style={{ left: Math.max(8, hoverInfo.x), top: Math.max(8, hoverInfo.y) }}
//             >
//               <div className="font-bold text-gray-800">{hoverInfo.seg.name}</div>
//               <div className="text-gray-600 border-b border-gray-200 pb-1 mb-1">
//                 Sector: {hoverInfo.seg.sector}
//               </div>
//               <div>
//                 Abatement Potential:{' '}
//                 <b className="text-blue-700">
//                   {formatNumber(hoverInfo.seg.abatement)}
//                 </b>{' '}
//                 tCO₂
//               </div>
//               <div>
//                 Marginal Cost:{' '}
//                 <b className="text-red-600">
//                   {currency} {formatNumber(hoverInfo.seg.cost)}
//                 </b>{' '}
//                 /tCO₂
//               </div>
//             </div>
//           )}

//           <ColorLegend items={enhancedSegments} max={16} />
//         </div>

//         {/* Target & Budget Side Panel */}
//         <div className="w-full lg:w-[380px] bg-gray-50 rounded-xl p-4 border border-gray-200 shadow-inner">
//           <h3 className="text-base font-semibold mb-3 border-b border-gray-200 pb-2 text-gray-800">
//             Target & Budget
//           </h3>

//           <label className="block text-sm font-medium text-gray-700 mb-2">
//             Set Abatement Target
//           </label>
//           <div className="flex items-center gap-3">
//             <input
//               type="range"
//               min={0}
//               max={100} // Range is max 100% reduction
//               step={1}
//               value={targetPctValue}
//               onChange={(e) => targetIntensityPct.setter(Number(e.target.value))}
//               className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-lg"
//             />
//             <div className="w-24 text-right font-semibold text-lg text-blue-700">
//               {targetPctValue}%
//             </div>
//           </div>
//           <div className="mt-2 text-[11px] text-gray-500">
//             In <b>Intensity Reduction (%)</b> mode, % refers to share of baseline
//             emissions per <b>{activeBaseline.production_label}</b>.
//           </div>

//           <div className="mt-4 space-y-2 text-sm">
//             <div className="flex justify-between">
//               <span className="text-gray-600">Abatement Target Reached:</span>
//               <b className="text-gray-800">
//                 {mode === 'capacity'
//                   ? formatNumber(budgetToTarget.targetReached) + ' tCO₂'
//                   : budgetToTarget.targetReached.toFixed(2) + '%'}
//               </b>
//             </div>
//             <div className="flex justify-between">
//               <span className="text-gray-600">
//                 Cost to Achieve Target (Σ cost×tCO₂):
//               </span>
//               <b className="text-red-600">
//                 {currency} {formatNumber(budgetToTarget.budget)}
//               </b>
//             </div>
//           </div>

//           {/* Summary for QUADRATIC Trendline */}
//           {modelToRender === 'quadratic' && quad && (
//             <div className="mt-5 pt-3 border-t border-gray-200">
//               <h4 className="font-semibold text-gray-800">Quadratic Fit Equation</h4>
//               <code className="text-xs bg-gray-100 p-2 rounded-lg block mt-2 whitespace-pre-wrap">
//                 cost(x) = {Number.isFinite(quad.a) ? quad.a.toFixed(4) : "—"}
//                 {Number.isFinite(quad.b) ? (quad.b >= 0 ? " + " : " − ") : " ± "}
//                 {Number.isFinite(quad.b) ? Math.abs(quad.b).toFixed(4) : "—"}·x
//                 {Number.isFinite(quad.c) ? (quad.c >= 0 ? " + " : " − ") : " ± "}
//                 {Number.isFinite(quad.c) ? Math.abs(quad.c).toFixed(6) : "—"}·x²
//               </code>
//               <div className="text-sm text-gray-700 mt-2">
//                 R² ={" "}
//                 <span className="font-semibold text-blue-700">
//                   {quad.r2 != null && Number.isFinite(quad.r2)
//                     ? quad.r2.toFixed(4)
//                     : "—"}
//                 </span>
//               </div>
//             </div>
//           )}

//           {/* Summary for PIECEWISE LINEAR Fit */}
//           {modelToRender === 'piecewise' && isPiecewiseModel && (
//             <div className="mt-5 pt-3 border-t border-gray-200">
//               <h4 className="font-semibold text-gray-800">
//                 Piecewise Linear Fit Equation
//               </h4>
//               {piecewiseFitResult.segments.map((seg, index) => (
//                 <code
//                   key={index}
//                   className="text-xs bg-gray-100 p-2 rounded-lg block mt-2 whitespace-pre-wrap"
//                 >
//                   Segment {index + 1} (x: {formatNumber(seg.start_x)} to{" "}
//                   {formatNumber(seg.end_x)}):{"\n"}
//                   cost(x) = {seg.fit.c.toFixed(4)}{" "}
//                   {seg.fit.m >= 0 ? " + " : " − "} {Math.abs(seg.fit.m).toFixed(4)}·x
//                 </code>
//               ))}
//               <div className="text-sm text-gray-700 mt-2">
//                 Combined R² ={" "}
//                 <span className="font-semibold text-blue-700">
//                   {piecewiseFitResult.r2 != null &&
//                   Number.isFinite(piecewiseFitResult.r2)
//                     ? piecewiseFitResult.r2.toFixed(4)
//                     : "—"}
//                 </span>
//               </div>
//             </div>
//           )}
//         </div>
//       </div>

//       <p className="text-xs text-gray-500 mt-4">
//         * Marginal Cost reflects Saved Cost minus Carbon Price.
//       </p>
//     </section>
//   );
// }
