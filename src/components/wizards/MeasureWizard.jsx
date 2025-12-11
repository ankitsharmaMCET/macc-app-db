import React, { useMemo, useState, useEffect } from "react";
import useLocalStorage from '../../hooks/useLocalStorage';
import { annuityFactor, interpolateSeries, npv } from '../../utils/mathHelpers';
import { formatNumber } from '../../utils/dataHelpers';
import { 
  getUnitPrice, getEFperUnit, getElecPricePerMWh, getElecEFperMWh 
} from '../../utils/catalogHelpers';
import { YEARS, BASE_YEAR, UI_CLASSES } from '../../utils/constants';
import CollapsibleSection from '../ui/CollapsibleSection';
import MeasureWizardSeriesRow from './MeasureWizardSeriesRow';
import InfoTip from '../ui/InfoTip';

// Helper to create a series of zeros for all years
const makeZeros = () => YEARS.map(() => 0);
// Helper to create a series of empty strings for all years
const makeEmptyEf = () => YEARS.map(() => "");

// Helper to make a clean default adoption profile (0, 0.2, 0.4, ..., 1.0)
const makeDefaultAdoption = () => {
  const n = YEARS.length;
  if (n <= 1) return YEARS.map(() => 1);
  return YEARS.map((_, i) => {
    const v = i / (n - 1);         // 0 ... 1
    return parseFloat(v.toFixed(1)); // round to 1 decimal like 0.0, 0.2, ...
  });
};

export default function MeasureWizard({
  onClose,
  onSave,
  sectors,
  currency,
  carbonPrice,
  dataSources,
  initialMeasure
}) {
  const { 
    fuels: DS_FUELS, raw: DS_RAW, transport: DS_TRANSPORT, 
    waste: DS_WASTE, electricity: DS_ELECTRICITY 
  } = dataSources;

  // Local UI state
  const [tab, setTab] = useState("template");
  const [showQuickAdvanced, setShowQuickAdvanced] = useState(false);

  const [applyCarbonPriceInSave, setApplyCarbonPriceInSave] = useLocalStorage(
    "macc_apply_cp_in_save",
    false
  );

  // Quick mode state
  const [q, setQ] = useState({ 
    name: "New Measure",
    sector: sectors[0] || "Power",
    abatement_tco2: 0,
    cost_per_tco2: 0,
    selected: true,
    color_hex: ""   // optional MACC color override (hex)
  });

  // Template mode metadata
  const [meta, setMeta] = useState({ 
    project_name: "Industrial Efficiency Project",
    sector: sectors[0] || "Power",
    discount_rate: 0.10,
    project_life_years: 30 
  });

  // Template mode series data
  const [adoption, setAdoption] = useState(() => makeDefaultAdoption());
  const [otherDirectT, setOtherDirectT] = useState(makeZeros());
  
  const [fuelLines, setFuelLines] = useState([
    {
      id: 1,
      name: DS_FUELS[0]?.name || "",
      priceOv: null,
      efOv: null,
      priceEscPctYr: 0,
      efEscPctYr: 0,
      delta: makeZeros()
    }
  ]);
  const [rawLines, setRawLines] = useState([
    {
      id: 1,
      name: DS_RAW[0]?.name || "",
      priceOv: null,
      efOv: null,
      priceEscPctYr: 0,
      efEscPctYr: 0,
      delta: makeZeros()
    }
  ]);
  const [transLines, setTransLines] = useState([
    {
      id: 1,
      name: DS_TRANSPORT[0]?.name || "",
      priceOv: null,
      efOv: null,
      priceEscPctYr: 0,
      efEscPctYr: 0,
      delta: makeZeros()
    }
  ]);
  const [wasteLines, setWasteLines] = useState([
    {
      id: 1,
      name: DS_WASTE[0]?.name || "",
      priceOv: null,
      efOv: null,
      priceEscPctYr: 0,
      efEscPctYr: 0,
      delta: makeZeros()
    }
  ]);
  const [elecLines, setElecLines] = useState([ 
    {
      id: 1,
      state: DS_ELECTRICITY[0]?.state || "India",
      priceOv: null,
      priceEscPctYr: 0,
      efEscPctYr: 0,
      efOvPerYear: makeEmptyEf(),
      deltaMWh: makeZeros()
    } 
  ]);

  // User-selected representative year index (overrides auto choice)
  const [repYearIdx, setRepYearIdx] = useState(null);

  // Financial stack state
  const [stack, setStack] = useState({ 
    opex_cr: YEARS.map(() => 0),
    savings_cr: YEARS.map(() => 0),
    other_cr: YEARS.map(() => 0),
    capex_upfront_cr: YEARS.map(() => 0),
    capex_financed_cr: YEARS.map(() => 0),
    financing_tenure_years: YEARS.map(() => 10),
    interest_rate_pct: YEARS.map(() => 7)
  });

  // --- Initial Load Effect ---
  useEffect(() => {
    if (!initialMeasure) return;
    const d = initialMeasure.details || {};

    if (d.mode === "template_db_multiline") {
      setTab("template");
      if (d.meta) setMeta(d.meta);
      if (Array.isArray(d.adoption)) setAdoption([...d.adoption]);

      const zeros = () => YEARS.map(() => 0);
      const empties = () => YEARS.map(() => "");
      const withIds = (arr, build) =>
        (Array.isArray(arr) ? arr : []).map((ln, i) => build(ln, i + 1));

      // Load Fuel Lines
      setFuelLines(
        withIds(d.drivers?.fuel_lines, (ln, id) => ({
          id,
          name: ln.name ?? (dataSources.fuels[0]?.name || ""),
          priceOv: ln.priceOv ?? null,
          efOv: ln.efOv ?? null,
          priceEscPctYr: ln.priceEscPctYr ?? 0,
          efEscPctYr: ln.efEscPctYr ?? 0,
          delta: Array.isArray(ln.delta) ? ln.delta : zeros()
        }))
      );

      // Load Raw Lines
      setRawLines(
        withIds(d.drivers?.raw_lines, (ln, id) => ({
          id,
          name: ln.name ?? (dataSources.raw[0]?.name || ""),
          priceOv: ln.priceOv ?? null,
          efOv: ln.efOv ?? null,
          priceEscPctYr: ln.priceEscPctYr ?? 0,
          efEscPctYr: ln.efEscPctYr ?? 0,
          delta: Array.isArray(ln.delta) ? ln.delta : zeros()
        }))
      );

      // Load Transport Lines
      setTransLines(
        withIds(d.drivers?.transport_lines, (ln, id) => ({
          id,
          name: ln.name ?? (dataSources.transport[0]?.name || ""),
          priceOv: ln.priceOv ?? null,
          efOv: ln.efOv ?? null,
          priceEscPctYr: ln.priceEscPctYr ?? 0,
          efEscPctYr: ln.efEscPctYr ?? 0,
          delta: Array.isArray(ln.delta) ? ln.delta : zeros()
        }))
      );

      // Load Waste Lines
      setWasteLines(
        withIds(d.drivers?.waste_lines, (ln, id) => ({
          id,
          name: ln.name ?? (dataSources.waste[0]?.name || ""),
          priceOv: ln.priceOv ?? null,
          efOv: ln.efOv ?? null,
          priceEscPctYr: ln.priceEscPctYr ?? 0,
          efEscPctYr: ln.efEscPctYr ?? 0,
          delta: Array.isArray(ln.delta) ? ln.delta : zeros()
        }))
      );

      // Load Electricity Lines
      setElecLines(
        withIds(d.drivers?.electricity_lines, (ln, id) => ({
          id,
          state: ln.state ?? (dataSources.electricity[0]?.state || "India"),
          priceOv: ln.priceOv ?? null,
          priceEscPctYr: ln.priceEscPctYr ?? 0,
          efEscPctYr: ln.efEscPctYr ?? 0,
          efOvPerYear: Array.isArray(ln.efOvPerYear) ? ln.efOvPerYear : empties(),
          deltaMWh: Array.isArray(ln.deltaMWh) ? ln.deltaMWh : zeros()
        }))
      );

      if (Array.isArray(d.drivers?.other_direct_t)) {
        setOtherDirectT([...d.drivers.other_direct_t]);
      }
      if (d.stack) setStack(d.stack);
      if (typeof d.representative_index === "number") {
        setRepYearIdx(d.representative_index);
      }
      setApplyCarbonPriceInSave(!!d.saved_cost_includes_carbon_price);
    } else {
      // Quick mode measure
      setTab("quick");
      setQ({
        name: initialMeasure.name || "Measure",
        sector: initialMeasure.sector || sectors[0] || "Power",
        abatement_tco2: Number(initialMeasure.abatement_tco2) || 0,
        cost_per_tco2: Number(initialMeasure.cost_per_tco2) || 0,
        selected: !!initialMeasure.selected,
        color_hex:
          initialMeasure.color_hex ||
          initialMeasure.color ||                      // legacy color field
          initialMeasure.details?.color_hex ||         // color stored inside details
          "",
      });
    }
  }, [initialMeasure, dataSources, sectors, setApplyCarbonPriceInSave]);

  // --- Core Calculation (useMemo) ---
  const computed = useMemo(() => {
    const perYear = YEARS.map((year, i) => {
      const a = Math.max(0, Math.min(1, Number(adoption[i] || 0)));
      const yearsSinceBase = Math.max(0, year - BASE_YEAR);

      // Δ emissions vs BAU for each driver (+ve = more, −ve = reduction)
      let fuel_dE_t = 0;
      let raw_dE_t = 0;
      let trans_dE_t = 0;
      let waste_dE_t = 0;
      let elec_dE_t = 0;

      // Total driver cost / savings (₹ cr)
      let driver_cr = 0;

      // Fuel lines
      for (const ln of fuelLines) {
        const base = DS_FUELS.find(x => x.name === ln.name);
        const basePrice = ln.priceOv ?? getUnitPrice(base) ?? 0;
        const priceEsc = Number(ln.priceEscPctYr || 0) / 100;
        const effPrice = basePrice * Math.pow(1 + priceEsc, yearsSinceBase);

        const baseEf = ln.efOv ?? getEFperUnit(base) ?? 0;
        const efEsc = Number(ln.efEscPctYr || 0) / 100;
        const effEf = baseEf * Math.pow(1 + efEsc, yearsSinceBase);

        const qty = a * Number(ln.delta[i] || 0);
        const dE = qty * effEf;

        fuel_dE_t += dE;
        driver_cr += (qty * effPrice) / 10_000_000;
      }

      // Raw lines
      for (const ln of rawLines) {
        const base = DS_RAW.find(x => x.name === ln.name);
        const basePrice = ln.priceOv ?? getUnitPrice(base) ?? 0;
        const priceEsc = Number(ln.priceEscPctYr || 0) / 100;
        const effPrice = basePrice * Math.pow(1 + priceEsc, yearsSinceBase);

        const baseEf = ln.efOv ?? getEFperUnit(base) ?? 0;
        const efEsc = Number(ln.efEscPctYr || 0) / 100;
        const effEf = baseEf * Math.pow(1 + efEsc, yearsSinceBase);

        const qty = a * Number(ln.delta[i] || 0);
        const dE = qty * effEf;

        raw_dE_t += dE;
        driver_cr += (qty * effPrice) / 10_000_000;
      }
      
      // Transport lines
      for (const ln of transLines) {
        const base = DS_TRANSPORT.find(x => x.name === ln.name);
        const basePrice = ln.priceOv ?? getUnitPrice(base) ?? 0;
        const priceEsc = Number(ln.priceEscPctYr || 0) / 100;
        const effPrice = basePrice * Math.pow(1 + priceEsc, yearsSinceBase);

        const baseEf = ln.efOv ?? getEFperUnit(base) ?? 0;
        const efEsc = Number(ln.efEscPctYr || 0) / 100;
        const effEf = baseEf * Math.pow(1 + efEsc, yearsSinceBase);

        const qty = a * Number(ln.delta[i] || 0);
        const dE = qty * effEf;

        trans_dE_t += dE;
        driver_cr += (qty * effPrice) / 10_000_000;
      }

      // Water & waste lines
      for (const ln of wasteLines) {
        const base = DS_WASTE.find(x => x.name === ln.name);
        const basePrice = ln.priceOv ?? getUnitPrice(base) ?? 0;
        const priceEsc = Number(ln.priceEscPctYr || 0) / 100;
        const effPrice = basePrice * Math.pow(1 + priceEsc, yearsSinceBase);

        const baseEf = ln.efOv ?? getEFperUnit(base) ?? 0;
        const efEsc = Number(ln.efEscPctYr || 0) / 100;
        const effEf = baseEf * Math.pow(1 + efEsc, yearsSinceBase);

        const qty = a * Number(ln.delta[i] || 0);
        const dE = qty * effEf;

        waste_dE_t += dE;
        driver_cr += (qty * effPrice) / 10_000_000;
      }

      // Electricity lines
      for (const ln of elecLines) {
        const base =
          DS_ELECTRICITY.find(x => x.state === ln.state) || DS_ELECTRICITY[0];
        const basePrice = ln.priceOv ?? getElecPricePerMWh(base) ?? 0;
        const priceEsc = Number(ln.priceEscPctYr || 0) / 100;
        const effPrice = basePrice * Math.pow(1 + priceEsc, yearsSinceBase);
        
        const efEsc = Number(ln.efEscPctYr || 0) / 100;
        const hasPerYearOv =
          ln.efOvPerYear[i] !== "" && ln.efOvPerYear[i] != null;
        const baseEf = getElecEFperMWh(base) ?? 0;
        const effEf = hasPerYearOv
          ? Number(ln.efOvPerYear[i])
          : baseEf * Math.pow(1 + efEsc, yearsSinceBase);
        
        const mwh = a * Number(ln.deltaMWh[i] || 0);
        const dE = mwh * effEf;

        elec_dE_t += dE;
        driver_cr += (mwh * effPrice) / 10_000_000;
      }

      // Total Δ emissions vs BAU (tCO₂)
      const deltaE_t = fuel_dE_t + raw_dE_t + trans_dE_t + waste_dE_t + elec_dE_t;

      // Other direct reduction (+ve = reduction)
      const other_t = a * Number(otherDirectT[i] || 0);

      // Net abatement this year (+ve = reduction vs BAU)
      const direct_t = -deltaE_t + other_t;

      // Stack & financing
      const opex_cr = Number(stack.opex_cr[i] || 0);
      const savings_cr = Number(stack.savings_cr[i] || 0);
      const other_cr = Number(stack.other_cr[i] || 0);
      const capex_upfront_cr = Number(stack.capex_upfront_cr[i] || 0);
      const capex_financed_cr = Number(stack.capex_financed_cr[i] || 0);
      
      const i_nominal = Number(stack.interest_rate_pct[i] || 0) / 100;
      const n_tenure = Number(stack.financing_tenure_years[i] || 0);
      
      const financedAnnual_cr =
        capex_financed_cr > 0 && i_nominal > 0 && n_tenure > 0
          ? capex_financed_cr * annuityFactor(i_nominal, n_tenure)
          : 0;

      // Net annual cost (₹ cr) excluding upfront capex
      const net_cost_cr =
        driver_cr + opex_cr + other_cr - savings_cr + financedAnnual_cr;

      // Cash flow in ₹ for NPV (negative = net cost)
      const cashflow_inr_wo_cp =
        (savings_cr -
          opex_cr -
          driver_cr -
          other_cr -
          financedAnnual_cr -
          capex_upfront_cr) *
        10_000_000;

      // Add carbon revenue/penalty
      const cashflow_inr_w_cp =
        cashflow_inr_wo_cp + Number(carbonPrice || 0) * direct_t;

      // Marginal Cost per tCO₂
      const implied_cost_per_t_wo =
        direct_t > 0 ? (net_cost_cr * 10_000_000) / direct_t : 0;

      const implied_cost_per_t_w =
        direct_t > 0
          ? ((net_cost_cr * 10_000_000) -
             Number(carbonPrice || 0) * direct_t) / direct_t
          : 0;

      return { 
        year,
        direct_t,
        net_cost_cr,
        implied_cost_per_t_wo,
        implied_cost_per_t_w,
        cashflow_inr_wo_cp,
        cashflow_inr_w_cp,
        pieces: {
          fuel_t: -fuel_dE_t,
          raw_t: -raw_dE_t,
          trans_t: -trans_dE_t,
          waste_t: -waste_dE_t,
          elec_t: -elec_dE_t,
          other_t,
          deltaE_t,
          driver_cr,
          opex_cr,
          other_cr,
          savings_cr,
          financedAnnual_cr,
          capex_upfront_cr
        }
      };
    });

    // Auto representative year: first with positive abatement
    let repIdx = perYear.findIndex(y => y.direct_t > 0);
    if (repIdx < 0) {
      repIdx =
        YEARS.indexOf(2035) >= 0
          ? YEARS.indexOf(2035)
          : Math.floor(YEARS.length / 2);
    }

    const years = perYear.map(y => y.year);
    const flowsWO = perYear.map(y => y.cashflow_inr_wo_cp);
    const flowsW = perYear.map(y => y.cashflow_inr_w_cp);
    const r = Number(meta.discount_rate || 0.10);

    const npvWO = npv(r, flowsWO, years, BASE_YEAR);
    const npvW = npv(r, flowsW, years, BASE_YEAR);
    
    const sumDirect = perYear.reduce(
      (s, y) => s + Math.max(0, y.direct_t || 0),
      0
    );
    const sumCostInrWO = perYear.reduce(
      (s, y) => s + y.net_cost_cr * 10_000_000,
      0
    );
    const sumCostInrW = perYear.reduce(
      (s, y) =>
        s +
        (y.net_cost_cr * 10_000_000 -
          Number(carbonPrice || 0) * y.direct_t),
      0
    );
    
    const avgCostWO = sumDirect > 0 ? sumCostInrWO / sumDirect : 0;
    const avgCostW = sumDirect > 0 ? sumCostInrW / sumDirect : 0;

    return { 
      YEARS,
      BASE_YEAR,
      perYear,
      repIdx,
      rep:
        perYear[repIdx] || {
          direct_t: 0,
          implied_cost_per_t_wo: 0,
          implied_cost_per_t_w: 0
        },
      finance: { npvWO, npvW, avgCostWO, avgCostW, sumDirect }
    };
  }, [
    adoption,
    fuelLines,
    rawLines,
    transLines,
    wasteLines,
    elecLines,
    otherDirectT,
    stack,
    meta.discount_rate,
    carbonPrice,
    DS_FUELS,
    DS_RAW,
    DS_TRANSPORT,
    DS_WASTE,
    DS_ELECTRICITY
  ]);

  // Ensure we always have a valid representative year index
  useEffect(() => {
    if (
      repYearIdx == null ||
      repYearIdx < 0 ||
      repYearIdx >= computed.YEARS.length
    ) {
      setRepYearIdx(computed.repIdx);
    }
  }, [computed.repIdx, computed.YEARS.length, repYearIdx]);

  // Active representative index & record (user override if set)
  const activeRepIdx =
    repYearIdx != null ? repYearIdx : computed.repIdx;

  const activeRep =
    computed.perYear[activeRepIdx] || computed.rep;

  const activeRepYear =
    computed.YEARS[activeRepIdx] || computed.YEARS[computed.repIdx];

  // --- Save Logic ---

  function saveQuick() {
    onSave({
      id: initialMeasure?.id,
      name: q.name,
      sector: q.sector,
      abatement_tco2: Number(q.abatement_tco2) || 0,
      cost_per_tco2: Number(q.cost_per_tco2) || 0,
      selected: !!q.selected,
      color_hex: q.color_hex || undefined,
      details: {
        mode: "quick",
        color_hex: q.color_hex || undefined,
      },
    });
  }

  function saveTemplate() {
    const repAbate = Math.max(0, activeRep.direct_t);
    const repCost = applyCarbonPriceInSave
      ? activeRep.implied_cost_per_t_w
      : activeRep.implied_cost_per_t_wo;
      
    if (repAbate <= 0) {
      const ok =
        typeof window === "undefined"
          ? true
          : window.confirm(
              "This measure has 0 tCO₂ abatement in the selected representative year. Save anyway? It won’t appear on the MACC until abatement > 0."
            );
      if (!ok) return;
    }

    onSave({
      id: initialMeasure?.id,
      name: meta.project_name,
      sector: meta.sector,
      abatement_tco2: repAbate,
      cost_per_tco2: repCost,
      selected: true,
      details: {
        mode: "template_db_multiline",
        years: computed.YEARS,
        meta,
        adoption,
        drivers: {
          fuel_lines: fuelLines,
          raw_lines: rawLines,
          transport_lines: transLines,
          waste_lines: wasteLines,
          electricity_lines: elecLines,
          other_direct_t: otherDirectT,
        },
        stack,
        per_year: computed.perYear,
        representative_index: activeRepIdx,
        finance_summary: computed.finance,
        saved_cost_includes_carbon_price: !!applyCarbonPriceInSave,
        carbon_price_at_save: Number(carbonPrice || 0),
      },
    });
  }

  // --- Utility Functions ---
  const setSeries = (arr, setArr, idx, val) => {
    const out = [...arr];
    out[idx] = val;
    setArr(out);
  };
  const updateLine = (list, setList, id, patch) =>
    setList(list.map(l => (l.id === id ? { ...l, ...patch } : l)));
  const addLine = (list, setList, sample) => {
    const nextId = Math.max(0, ...list.map(l => l.id)) + 1;
    setList([...list, { id: nextId, ...sample }]);
  };
  const removeLine = (list, setList, id) =>
    setList(list.filter(l => l.id !== id));

  // --- UI Helpers ---
  const LineHeader = ({ title, onRemove, showRemove = true }) => (
    <div className="flex items-center justify-between mt-3 mb-1">
      <div className="text-sm font-medium uppercase tracking-wider text-gray-600">
        {title}
      </div>
      {showRemove && (
        <button
          type="button"
          className="text-xs px-2 py-1 rounded-lg border border-red-300 text-red-600 hover:bg-red-50"
          onClick={onRemove}
        >
          Remove
        </button>
      )}
    </div>
  );

  // --- RENDER ---
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="measure-wizard-title"
    >
      <div className="bg-white w-full sm:max-w-6xl rounded-xl shadow-2xl flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex gap-2">
            <button
              className={`${UI_CLASSES.SecondaryButton.replace(
                "py-2",
                "py-1.5"
              )} ${
                tab === "quick"
                  ? UI_CLASSES.ActiveToggle
                  : "hover:bg-gray-50"
              }`}
              onClick={() => setTab("quick")}
            >
              Quick
            </button>
            <button
              className={`${UI_CLASSES.SecondaryButton.replace(
                "py-2",
                "py-1.5"
              )} ${
                tab === "template"
                  ? UI_CLASSES.ActiveToggle
                  : "hover:bg-gray-50"
              }`}
              onClick={() => setTab("template")}
              id="measure-wizard-title"
            >
              Detailed Project Model
            </button>
          </div>
          <button
            className={UI_CLASSES.SecondaryButton.replace("py-2", "py-1.5")}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="p-4 sm:p-6 overflow-y-auto">
          {tab === "quick" ? (
            // --- Quick Tab Content ---
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="text-sm font-medium text-gray-700">
                  Project name
                  <input
                    className={UI_CLASSES.Input}
                    value={q.name}
                    onChange={e =>
                      setQ({ ...q, name: e.target.value })
                    }
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Sector
                  <select
                    className={UI_CLASSES.Input}
                    value={q.sector}
                    onChange={e =>
                      setQ({ ...q, sector: e.target.value })
                    }
                  >
                    {sectors.map(s => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Abatement (tCO₂/yr)
                  <input
                    type="number"
                    className={UI_CLASSES.Input}
                    value={q.abatement_tco2}
                    onChange={e =>
                      setQ({
                        ...q,
                        abatement_tco2: Number(e.target.value)
                      })
                    }
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Cost ({currency}/tCO₂)
                  <input
                    type="number"
                    className={UI_CLASSES.Input}
                    value={q.cost_per_tco2}
                    onChange={e =>
                      setQ({
                        ...q,
                        cost_per_tco2: Number(e.target.value)
                      })
                    }
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={q.selected}
                  onChange={e =>
                    setQ({ ...q, selected: e.target.checked })
                  }
                  className="form-checkbox h-4 w-4 text-blue-600 transition duration-150 ease-in-out border-gray-300 rounded"
                />
                Use in MACC
              </label>

              {/* Advanced options toggle (color override) */}
              <button
                type="button"
                className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                onClick={() => setShowQuickAdvanced(v => !v)}
              >
                {showQuickAdvanced ? "Hide advanced options" : "Show advanced options"}
              </button>

              {showQuickAdvanced && (
                <div className="mt-2 p-3 border border-gray-200 rounded-lg bg-gray-50 space-y-2">
                  <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    Optional MACC styling
                  </div>

                  <label className="text-xs sm:text-sm font-medium text-gray-700">
                    MACC bar color override
                    <div className="mt-1 flex items-center gap-3">
                      <input
                        type="color"
                        value={q.color_hex || "#377eb8"}
                        onChange={e => setQ({ ...q, color_hex: e.target.value })}
                        className="h-8 w-10 border border-gray-300 rounded"
                      />
                      <input
                        type="text"
                        className={UI_CLASSES.Input.replace("py-2", "py-1.5")}
                        placeholder="#RRGGBB (optional)"
                        value={q.color_hex}
                        onChange={e => setQ({ ...q, color_hex: e.target.value })}
                      />
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500">
                      Leave blank to use default sector-based color in the MACC chart.
                    </div>
                  </label>
                </div>
              )}
            </div>
          ) : (
            // --- Template Tab Content ---
            <div className="space-y-6">
              {/* Project Metadata */}
              <div className="text-base font-semibold text-gray-800">
                Project Scope & Discounting
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <label className="text-sm font-medium text-gray-700">
                  Project name
                  <input
                    className={UI_CLASSES.Input}
                    value={meta.project_name}
                    onChange={e =>
                      setMeta({
                        ...meta,
                        project_name: e.target.value
                      })
                    }
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Sector
                  <select
                    className={UI_CLASSES.Input}
                    value={meta.sector}
                    onChange={e =>
                      setMeta({ ...meta, sector: e.target.value })
                    }
                  >
                    {sectors.map(s => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Discount rate
                  <input
                    type="number"
                    step="0.01"
                    className={UI_CLASSES.Input}
                    value={meta.discount_rate}
                    onChange={e =>
                      setMeta({
                        ...meta,
                        discount_rate: Number(e.target.value)
                      })
                    }
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Economic Life (Years)
                  <input
                    type="number"
                    className={UI_CLASSES.Input}
                    value={meta.project_life_years}
                    onChange={e =>
                      setMeta({
                        ...meta,
                        project_life_years: Number(e.target.value)
                      })
                    }
                  />
                </label>
              </div>

              {/* Adoption Profile */}
              <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                <div className="text-base font-semibold mb-3">
                  Adoption profile (fraction 0–1)
                </div>
                <MeasureWizardSeriesRow 
                  years={YEARS}
                  label="Adoption fraction"
                  unit="share"
                  help="Share of total potential adopted in each year. 0=no adoption, 1=full adoption. Multiplies all Δ quantities for that year."
                  series={adoption}
                  onChange={(i, v) =>
                    setAdoption(
                      adoption.map((vv, idx) => (idx === i ? v : vv))
                    )
                  }
                  onInterpolate={() => setAdoption(interpolateSeries(adoption))}
                />
                <div className="text-xs text-gray-500 mt-2">
                  Applied multiplicatively to all Δ quantities (fuel/raw/transport/waste/electricity/other).
                </div>
              </div>

              {/* Drivers Lines */}
              <CollapsibleSection
                title="Driver & Emissions Lines"
                storageKey="macc_collapse_wizard_drivers"
                defaultOpen={true}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Fuel group */}
                  <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-base font-semibold text-gray-800">
                        Fuel lines
                      </div>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50"
                        onClick={() =>
                          addLine(fuelLines, setFuelLines, {
                            name: DS_FUELS[0]?.name || "",
                            priceOv: null,
                            efOv: null,
                            priceEscPctYr: 0,
                            efEscPctYr: 0,
                            delta: makeZeros()
                          })
                        }
                      >
                        + Add fuel line
                      </button>
                    </div>
                    {fuelLines.map(ln => {
                      const base = DS_FUELS.find(
                        x => x.name === ln.name
                      );
                      const unit = base?.unit || "-";
                      return (
                        <div
                          key={ln.id}
                          className="mt-3 rounded-lg border border-gray-100 p-3 bg-gray-50"
                        >
                          <LineHeader
                            title="Fuel line"
                            onRemove={() =>
                              removeLine(
                                fuelLines,
                                setFuelLines,
                                ln.id
                              )
                            }
                          />
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <label className="text-sm col-span-2 font-medium text-gray-700">
                              Fuel
                              <select
                                className={UI_CLASSES.Input}
                                value={ln.name}
                                onChange={e =>
                                  updateLine(
                                    fuelLines,
                                    setFuelLines,
                                    ln.id,
                                    { name: e.target.value }
                                  )
                                }
                              >
                                {DS_FUELS.map(x => (
                                  <option key={x.name}>
                                    {x.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-sm font-medium text-gray-700">
                              Price override (₹/{unit})
                              <input
                                type="number"
                                className={UI_CLASSES.Input}
                                placeholder={(
                                  getUnitPrice(base) || 0
                                ).toString()}
                                value={ln.priceOv ?? ""}
                                onChange={e =>
                                  updateLine(
                                    fuelLines,
                                    setFuelLines,
                                    ln.id,
                                    {
                                      priceOv:
                                        e.target.value === ""
                                          ? null
                                          : Number(e.target.value)
                                    }
                                  )
                                }
                              />
                              <div className="text-[11px] text-gray-500 mt-0.5">
                                Blank = use catalog price.
                              </div>
                            </label>
                            <label className="text-sm font-medium text-gray-700">
                              EF override (tCO₂/{unit})
                              <input
                                type="number"
                                className={UI_CLASSES.Input}
                                placeholder={(
                                  getEFperUnit(base) || 0
                                ).toString()}
                                value={ln.efOv ?? ""}
                                onChange={e =>
                                  updateLine(
                                    fuelLines,
                                    setFuelLines,
                                    ln.id,
                                    {
                                      efOv:
                                        e.target.value === ""
                                          ? null
                                          : Number(e.target.value)
                                    }
                                  )
                                }
                              />
                              <div className="text-[11px] text-gray-500 mt-0.5">
                                Blank = use catalog EF.
                              </div>
                            </label>
                            <label className="text-sm font-medium text-gray-700">
                              Price drift (%/yr)
                              <input
                                type="number"
                                className={UI_CLASSES.Input}
                                value={ln.priceEscPctYr}
                                onChange={e =>
                                  updateLine(
                                    fuelLines,
                                    setFuelLines,
                                    ln.id,
                                    {
                                      priceEscPctYr: Number(
                                        e.target.value
                                      )
                                    }
                                  )
                                }
                              />
                            </label>
                            <label className="text-sm font-medium text-gray-700">
                              EF drift (%/yr)
                              <input
                                type="number"
                                className={UI_CLASSES.Input}
                                value={ln.efEscPctYr}
                                onChange={e =>
                                  updateLine(
                                    fuelLines,
                                    setFuelLines,
                                    ln.id,
                                    {
                                      efEscPctYr: Number(
                                        e.target.value
                                      )
                                    }
                                  )
                                }
                              />
                            </label>
                          </div>
                          <div className="mt-3">
                            <MeasureWizardSeriesRow 
                              years={YEARS}
                              label={`ΔFuel quantity (${unit})`}
                              unit={unit}
                              help="Change vs. business-as-usual. Positive = more usage; negative = reduction."
                              series={ln.delta}
                              onChange={(i, v) =>
                                updateLine(
                                  fuelLines,
                                  setFuelLines,
                                  ln.id,
                                  {
                                    delta: ln.delta.map(
                                      (vv, idx) =>
                                        idx === i ? v : vv
                                    )
                                  }
                                )
                              }
                              onInterpolate={() =>
                                updateLine(
                                  fuelLines,
                                  setFuelLines,
                                  ln.id,
                                  {
                                    delta: interpolateSeries(
                                      ln.delta
                                    )
                                  }
                                )
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Raw group */}
                  <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-base font-semibold text-gray-800">
                        Raw material lines
                      </div>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50"
                        onClick={() =>
                          addLine(rawLines, setRawLines, {
                            name: DS_RAW[0]?.name || "",
                            priceOv: null,
                            efOv: null,
                            priceEscPctYr: 0,
                            efEscPctYr: 0,
                            delta: makeZeros()
                          })
                        }
                      >
                        + Add raw line
                      </button>
                    </div>
                    {rawLines.map(ln => {
                      const base = DS_RAW.find(
                        x => x.name === ln.name
                      );
                      const unit = base?.unit || "-";
                      return (
                        <div
                          key={ln.id}
                          className="mt-3 rounded-lg border border-gray-100 p-3 bg-gray-50"
                        >
                          <LineHeader
                            title="Raw material line"
                            onRemove={() =>
                              removeLine(
                                rawLines,
                                setRawLines,
                                ln.id
                              )
                            }
                          />
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <label className="text-sm col-span-2 font-medium text-gray-700">
                              Raw material
                              <select
                                className={UI_CLASSES.Input}
                                value={ln.name}
                                onChange={e =>
                                  updateLine(
                                    rawLines,
                                    setRawLines,
                                    ln.id,
                                    { name: e.target.value }
                                  )
                                }
                              >
                                {DS_RAW.map(x => (
                                  <option key={x.name}>
                                    {x.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-sm font-medium text-gray-700">
                              Price override (₹/{unit})
                              <input
                                type="number"
                                className={UI_CLASSES.Input}
                                placeholder={(
                                  getUnitPrice(base) || 0
                                ).toString()}
                                value={ln.priceOv ?? ""}
                                onChange={e =>
                                  updateLine(
                                    rawLines,
                                    setRawLines,
                                    ln.id,
                                    {
                                      priceOv:
                                        e.target.value === ""
                                          ? null
                                          : Number(e.target.value)
                                    }
                                  )
                                }
                              />
                              <div className="text-[11px] text-gray-500 mt-0.5">
                                Blank = use catalog price.
                              </div>
                            </label>
                            <label className="text-sm font-medium text-gray-700">
                              EF override (tCO₂/{unit})
                              <input
                                type="number"
                                className={UI_CLASSES.Input}
                                placeholder={(
                                  getEFperUnit(base) || 0
                                ).toString()}
                                value={ln.efOv ?? ""}
                                onChange={e =>
                                  updateLine(
                                    rawLines,
                                    setRawLines,
                                    ln.id,
                                    {
                                      efOv:
                                        e.target.value === ""
                                          ? null
                                          : Number(e.target.value)
                                    }
                                  )
                                }
                              />
                              <div className="text-[11px] text-gray-500 mt-0.5">
                                Blank = use catalog EF.
                              </div>
                            </label>
                            <label className="text-sm font-medium text-gray-700">
                              Price drift (%/yr)
                              <input
                                type="number"
                                className={UI_CLASSES.Input}
                                value={ln.priceEscPctYr}
                                onChange={e =>
                                  updateLine(
                                    rawLines,
                                    setRawLines,
                                    ln.id,
                                    {
                                      priceEscPctYr: Number(
                                        e.target.value
                                      )
                                    }
                                  )
                                }
                              />
                            </label>
                            <label className="text-sm font-medium text-gray-700">
                              EF drift (%/yr)
                              <input
                                type="number"
                                className={UI_CLASSES.Input}
                                value={ln.efEscPctYr}
                                onChange={e =>
                                  updateLine(
                                    rawLines,
                                    setRawLines,
                                    ln.id,
                                    {
                                      efEscPctYr: Number(
                                        e.target.value
                                      )
                                    }
                                  )
                                }
                              />
                            </label>
                          </div>
                          <div className="mt-3">
                            <MeasureWizardSeriesRow 
                              years={YEARS}
                              label={`ΔRaw quantity (${unit})`}
                              unit={unit}
                              series={ln.delta}
                              onChange={(i, v) =>
                                updateLine(
                                  rawLines,
                                  setRawLines,
                                  ln.id,
                                  {
                                    delta: ln.delta.map(
                                      (vv, idx) =>
                                        idx === i ? v : vv
                                    )
                                  }
                                )
                              }
                              onInterpolate={() =>
                                updateLine(
                                  rawLines,
                                  setRawLines,
                                  ln.id,
                                  {
                                    delta: interpolateSeries(
                                      ln.delta
                                    )
                                  }
                                )
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Transport group */}
                  <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-base font-semibold text-gray-800">
                        Transport lines
                      </div>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50"
                        onClick={() =>
                          addLine(transLines, setTransLines, {
                            name: DS_TRANSPORT[0]?.name || "",
                            priceOv: null,
                            efOv: null,
                            priceEscPctYr: 0,
                            efEscPctYr: 0,
                            delta: makeZeros()
                          })
                        }
                      >
                        + Add transport line
                      </button>
                    </div>
                    {transLines.map(ln => {
                      const base = DS_TRANSPORT.find(
                        x => x.name === ln.name
                      );
                      const unit = base?.unit || "-";
                      return (
                        <div
                          key={ln.id}
                          className="mt-3 rounded-lg border border-gray-100 p-3 bg-gray-50"
                        >
                          <LineHeader
                            title="Transport line"
                            onRemove={() =>
                              removeLine(
                                transLines,
                                setTransLines,
                                ln.id
                              )
                            }
                          />
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <label className="text-sm col-span-2 font-medium text-gray-700">
                              Transport
                              <select
                                className={UI_CLASSES.Input}
                                value={ln.name}
                                onChange={e =>
                                  updateLine(
                                    transLines,
                                    setTransLines,
                                    ln.id,
                                    { name: e.target.value }
                                  )
                                }
                              >
                                {DS_TRANSPORT.map(x => (
                                  <option key={x.name}>
                                    {x.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-sm font-medium text-gray-700">
                              Price override (₹/{unit})
                              <input
                                type="number"
                                className={UI_CLASSES.Input}
                                placeholder={(
                                  getUnitPrice(base) || 0
                                ).toString()}
                                value={ln.priceOv ?? ""}
                                onChange={e =>
                                  updateLine(
                                    transLines,
                                    setTransLines,
                                    ln.id,
                                    {
                                      priceOv:
                                        e.target.value === ""
                                          ? null
                                          : Number(e.target.value)
                                    }
                                  )
                                }
                              />
                            </label>
                            <label className="text-sm font-medium text-gray-700">
                              EF override (tCO₂/{unit})
                              <input
                                type="number"
                                className={UI_CLASSES.Input}
                                placeholder={(
                                  getEFperUnit(base) || 0
                                ).toString()}
                                value={ln.efOv ?? ""}
                                onChange={e =>
                                  updateLine(
                                    transLines,
                                    setTransLines,
                                    ln.id,
                                    {
                                      efOv:
                                        e.target.value === ""
                                          ? null
                                          : Number(e.target.value)
                                    }
                                  )
                                }
                              />
                            </label>
                            <label className="text-sm font-medium text-gray-700">
                              Price drift (%/yr)
                              <input
                                type="number"
                                className={UI_CLASSES.Input}
                                value={ln.priceEscPctYr}
                                onChange={e =>
                                  updateLine(
                                    transLines,
                                    setTransLines,
                                    ln.id,
                                    {
                                      priceEscPctYr: Number(
                                        e.target.value
                                      )
                                    }
                                  )
                                }
                              />
                            </label>
                            <label className="text-sm font-medium text-gray-700">
                              EF drift (%/yr)
                              <input
                                type="number"
                                className={UI_CLASSES.Input}
                                value={ln.efEscPctYr}
                                onChange={e =>
                                  updateLine(
                                    transLines,
                                    setTransLines,
                                    ln.id,
                                    {
                                      efEscPctYr: Number(
                                        e.target.value
                                      )
                                    }
                                  )
                                }
                              />
                            </label>
                          </div>
                          <div className="mt-3">
                            <MeasureWizardSeriesRow 
                              years={YEARS}
                              label={`ΔTransport activity (${unit})`}
                              unit={unit}
                              series={ln.delta}
                              onChange={(i, v) =>
                                updateLine(
                                  transLines,
                                  setTransLines,
                                  ln.id,
                                  {
                                    delta: ln.delta.map(
                                      (vv, idx) =>
                                        idx === i ? v : vv
                                    )
                                  }
                                )
                              }
                              onInterpolate={() =>
                                updateLine(
                                  transLines,
                                  setTransLines,
                                  ln.id,
                                  {
                                    delta: interpolateSeries(
                                      ln.delta
                                    )
                                  }
                                )
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Water & waste group */}
                  <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-base font-semibold text-gray-800">
                        Water & waste lines
                      </div>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50"
                        onClick={() =>
                          addLine(wasteLines, setWasteLines, {
                            name: DS_WASTE[0]?.name || "",
                            priceOv: null,
                            efOv: null,
                            priceEscPctYr: 0,
                            efEscPctYr: 0,
                            delta: makeZeros()
                          })
                        }
                      >
                        + Add water/waste line
                      </button>
                    </div>
                    {wasteLines.map(ln => {
                      const base = DS_WASTE.find(
                        x => x.name === ln.name
                      );
                      const unit = base?.unit || "-";
                      return (
                        <div
                          key={ln.id}
                          className="mt-3 rounded-lg border border-gray-100 p-3 bg-gray-50"
                        >
                          <LineHeader
                            title="Water & waste line"
                            onRemove={() =>
                              removeLine(
                                wasteLines,
                                setWasteLines,
                                ln.id
                              )
                            }
                          />
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <label className="text-sm col-span-2 font-medium text-gray-700">
                              Water/Waste
                              <select
                                className={UI_CLASSES.Input}
                                value={ln.name}
                                onChange={e =>
                                  updateLine(
                                    wasteLines,
                                    setWasteLines,
                                    ln.id,
                                    { name: e.target.value }
                                  )
                                }
                              >
                                {DS_WASTE.map(x => (
                                  <option key={x.name}>
                                    {x.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-sm font-medium text-gray-700">
                              Price override (₹/{unit})
                              <input
                                type="number"
                                className={UI_CLASSES.Input}
                                placeholder={(
                                  getUnitPrice(base) || 0
                                ).toString()}
                                value={ln.priceOv ?? ""}
                                onChange={e =>
                                  updateLine(
                                    wasteLines,
                                    setWasteLines,
                                    ln.id,
                                    {
                                      priceOv:
                                        e.target.value === ""
                                          ? null
                                          : Number(e.target.value)
                                    }
                                  )
                                }
                              />
                            </label>
                            <label className="text-sm font-medium text-gray-700">
                              EF override (tCO₂/{unit})
                              <input
                                type="number"
                                className={UI_CLASSES.Input}
                                placeholder={(
                                  getEFperUnit(base) || 0
                                ).toString()}
                                value={ln.efOv ?? ""}
                                onChange={e =>
                                  updateLine(
                                    wasteLines,
                                    setWasteLines,
                                    ln.id,
                                    {
                                      efOv:
                                        e.target.value === ""
                                          ? null
                                          : Number(e.target.value)
                                    }
                                  )
                                }
                              />
                            </label>
                            <label className="text-sm font-medium text-gray-700">
                              Price drift (%/yr)
                              <input
                                type="number"
                                className={UI_CLASSES.Input}
                                value={ln.priceEscPctYr}
                                onChange={e =>
                                  updateLine(
                                    wasteLines,
                                    setWasteLines,
                                    ln.id,
                                    {
                                      priceEscPctYr: Number(
                                        e.target.value
                                      )
                                    }
                                  )
                                }
                              />
                            </label>
                            <label className="text-sm font-medium text-gray-700">
                              EF drift (%/yr)
                              <input
                                type="number"
                                className={UI_CLASSES.Input}
                                value={ln.efEscPctYr}
                                onChange={e =>
                                  updateLine(
                                    wasteLines,
                                    setWasteLines,
                                    ln.id,
                                    {
                                      efEscPctYr: Number(
                                        e.target.value
                                      )
                                    }
                                  )
                                }
                              />
                            </label>
                          </div>
                          <div className="mt-3">
                            <MeasureWizardSeriesRow 
                              years={YEARS}
                              label={`ΔWater/waste quantity (${unit})`}
                              unit={unit}
                              series={ln.delta}
                              onChange={(i, v) =>
                                updateLine(
                                  wasteLines,
                                  setWasteLines,
                                  ln.id,
                                  {
                                    delta: ln.delta.map(
                                      (vv, idx) =>
                                        idx === i ? v : vv
                                    )
                                  }
                                )
                              }
                              onInterpolate={() =>
                                updateLine(
                                  wasteLines,
                                  setWasteLines,
                                  ln.id,
                                  {
                                    delta: interpolateSeries(
                                      ln.delta
                                    )
                                  }
                                )
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Electricity group */}
                  <div className="md:col-span-2 p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-base font-semibold text-gray-800">
                        Electricity lines
                      </div>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50"
                        onClick={() =>
                          addLine(elecLines, setElecLines, {
                            state: DS_ELECTRICITY[0]?.state || "India",
                            priceOv: null,
                            priceEscPctYr: 0,
                            efEscPctYr: 0,
                            efOvPerYear: makeEmptyEf(),
                            deltaMWh: makeZeros()
                          })
                        }
                      >
                        + Add electricity line
                      </button>
                    </div>
                    {elecLines.map(ln => {
                      const base =
                        DS_ELECTRICITY.find(
                          x => x.state === ln.state
                        ) || DS_ELECTRICITY[0];
                      return (
                        <div
                          key={ln.id}
                          className="mt-3 rounded-lg border border-gray-100 p-3 bg-gray-50"
                        >
                          <LineHeader
                            title="Electricity line"
                            onRemove={() =>
                              removeLine(
                                elecLines,
                                setElecLines,
                                ln.id
                              )
                            }
                          />
                          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mt-2">
                            <label className="text-sm sm:col-span-2 font-medium text-gray-700">
                              State
                              <select
                                className={UI_CLASSES.Input}
                                value={ln.state}
                                onChange={e =>
                                  updateLine(
                                    elecLines,
                                    setElecLines,
                                    ln.id,
                                    { state: e.target.value }
                                  )
                                }
                              >
                                {DS_ELECTRICITY.map(e => (
                                  <option key={e.state}>
                                    {e.state}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-sm font-medium text-gray-700">
                              Price override (₹/MWh)
                              <input
                                type="number"
                                className={UI_CLASSES.Input}
                                placeholder={(
                                  getElecPricePerMWh(base) || 0
                                ).toString()}
                                value={ln.priceOv ?? ""}
                                onChange={e =>
                                  updateLine(
                                    elecLines,
                                    setElecLines,
                                    ln.id,
                                    {
                                      priceOv:
                                        e.target.value === ""
                                          ? null
                                          : Number(e.target.value)
                                    }
                                  )
                                }
                              />
                            </label>
                            <label className="text-sm font-medium text-gray-700">
                              Price drift (%/yr)
                              <input
                                type="number"
                                className={UI_CLASSES.Input}
                                value={ln.priceEscPctYr}
                                onChange={e =>
                                  updateLine(
                                    elecLines,
                                    setElecLines,
                                    ln.id,
                                    {
                                      priceEscPctYr: Number(
                                        e.target.value
                                      )
                                    }
                                  )
                                }
                              />
                            </label>
                            <label className="text-sm font-medium text-gray-700">
                              EF drift (%/yr)
                              <input
                                type="number"
                                className={UI_CLASSES.Input}
                                value={ln.efEscPctYr}
                                onChange={e =>
                                  updateLine(
                                    elecLines,
                                    setElecLines,
                                    ln.id,
                                    {
                                      efEscPctYr: Number(
                                        e.target.value
                                      )
                                    }
                                  )
                                }
                              />
                            </label>
                          </div>
                          <div className="mt-3">
                            <MeasureWizardSeriesRow 
                              years={YEARS}
                              label="ΔElectricity use"
                              unit="MWh"
                              series={ln.deltaMWh}
                              onChange={(i, v) =>
                                updateLine(
                                  elecLines,
                                  setElecLines,
                                  ln.id,
                                  {
                                    deltaMWh: ln.deltaMWh.map(
                                      (vv, idx) =>
                                        idx === i ? v : vv
                                    )
                                  }
                                )
                              }
                              onInterpolate={() =>
                                updateLine(
                                  elecLines,
                                  setElecLines,
                                  ln.id,
                                  {
                                    deltaMWh: interpolateSeries(
                                      ln.deltaMWh
                                    )
                                  }
                                )
                              }
                            />
                          </div>
                          <div className="mt-3">
                            <MeasureWizardSeriesRow 
                              years={YEARS}
                              label="EF override (blank = use state/EF drift)"
                              unit="tCO₂/MWh"
                              series={ln.efOvPerYear}
                              onChange={(i, v) =>
                                updateLine(
                                  elecLines,
                                  setElecLines,
                                  ln.id,
                                  {
                                    efOvPerYear:
                                      ln.efOvPerYear.map(
                                        (vv, idx) =>
                                          idx === i ? v : vv
                                      )
                                  }
                                )
                              }
                              onInterpolate={() =>
                                updateLine(
                                  elecLines,
                                  setElecLines,
                                  ln.id,
                                  {
                                    efOvPerYear: interpolateSeries(
                                      ln.efOvPerYear
                                    )
                                  }
                                )
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CollapsibleSection>

              {/* Other direct tCO2e */}
              <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                <div className="text-base font-semibold mb-3">
                  Other direct emissions reduction (optional)
                </div>
                <MeasureWizardSeriesRow 
                  years={YEARS}
                  label="Other direct reduction"
                  unit="tCO₂e"
                  series={otherDirectT}
                  help="Direct reductions not captured by the lines above (e.g., process changes, fugitives). Positive = reduction; negative = increase."
                  onChange={(i, v) =>
                    setSeries(otherDirectT, setOtherDirectT, i, v)
                  }
                  onInterpolate={() =>
                    setOtherDirectT(interpolateSeries(otherDirectT))
                  }
                />
              </div>

              {/* Cost Stack & Finance */}
              <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                <div className="text-base font-semibold mb-3">
                  Financial Stack (₹ cr)
                </div>
                <MeasureWizardSeriesRow
                  years={YEARS}
                  label="Opex"
                  unit="₹ cr"
                  series={stack.opex_cr}
                  help="Recurring operating costs (positive adds cost, negative reduces cost). Applied to each year."
                  onChange={(i, v) =>
                    setStack(s => ({
                      ...s,
                      opex_cr: s.opex_cr.map((vv, idx) =>
                        idx === i ? v : vv
                      )
                    }))
                  }
                />
                <MeasureWizardSeriesRow
                  years={YEARS}
                  label="Savings"
                  unit="₹ cr"
                  series={stack.savings_cr}
                  help="Recurring operating savings (positive lowers net cost). Applied to each year."
                  onChange={(i, v) =>
                    setStack(s => ({
                      ...s,
                      savings_cr: s.savings_cr.map((vv, idx) =>
                        idx === i ? v : vv
                      )
                    }))
                  }
                />
                <MeasureWizardSeriesRow
                  years={YEARS}
                  label="Other (e.g., manpower)"
                  unit="₹ cr"
                  series={stack.other_cr}
                  help="Other recurring costs (+) or savings (−) not included above."
                  onChange={(i, v) =>
                    setStack(s => ({
                      ...s,
                      other_cr: s.other_cr.map((vv, idx) =>
                        idx === i ? v : vv
                      )
                    }))
                  }
                />
                <MeasureWizardSeriesRow
                  years={YEARS}
                  label="Capex upfront"
                  unit="₹ cr"
                  series={stack.capex_upfront_cr}
                  help="One-time cash outflow in that year (not annualized)."
                  onChange={(i, v) =>
                    setStack(s => ({
                      ...s,
                      capex_upfront_cr: s.capex_upfront_cr.map(
                        (vv, idx) => (idx === i ? v : vv)
                      )
                    }))
                  }
                />
                <MeasureWizardSeriesRow
                  years={YEARS}
                  label="Capex financed"
                  unit="₹ cr"
                  series={stack.capex_financed_cr}
                  help="Portion of capex to be financed and converted to a yearly annuity using Interest rate and Tenure."
                  onChange={(i, v) =>
                    setStack(s => ({
                      ...s,
                      capex_financed_cr: s.capex_financed_cr.map(
                        (vv, idx) => (idx === i ? v : vv)
                      )
                    }))
                  }
                />
                <MeasureWizardSeriesRow
                  years={YEARS}
                  label="Financing tenure"
                  unit="years"
                  series={stack.financing_tenure_years}
                  help="Loan tenure used to compute the annualized financing cost. 0 disables the annuity."
                  onChange={(i, v) =>
                    setStack(s => ({
                      ...s,
                      financing_tenure_years:
                        s.financing_tenure_years.map((vv, idx) =>
                          idx === i ? v : vv
                        )
                    }))
                  }
                />
                <MeasureWizardSeriesRow
                  years={YEARS}
                  label="Interest rate"
                  unit="%"
                  series={stack.interest_rate_pct}
                  help="Nominal annual interest rate used for the financing annuity."
                  onChange={(i, v) =>
                    setStack(s => ({
                      ...s,
                      interest_rate_pct: s.interest_rate_pct.map(
                        (vv, idx) => (idx === i ? v : vv)
                      )
                    }))
                  }
                />
              </div>

              {/* Roll-ups */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm bg-gray-100 rounded-xl p-4 border border-gray-300">
                  <div className="sm:col-span-3 font-semibold text-gray-800 border-b border-gray-300 pb-2 mb-2">
                    MACC Inputs Summary
                  </div>

                  <div>
                    <div className="text-gray-500 mb-1">Representative year (for MACC)</div>
                    <select
                      className={UI_CLASSES.Input.replace("py-2", "py-1")}
                      value={activeRepIdx}
                      onChange={(e) => setRepYearIdx(Number(e.target.value))}
                    >
                      {computed.YEARS.map((yr, idx) => (
                        <option key={yr} value={idx}>
                          {yr}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="text-gray-500">Rep. direct abatement</div>
                    <div className="font-semibold text-base">
                      {formatNumber(activeRep.direct_t)} tCO₂e
                    </div>
                  </div>

                  <div>
                    <div className="text-gray-500">Rep. cost (w/o CP)</div>
                    <div className="font-semibold text-base">
                      {currency} {formatNumber(activeRep.implied_cost_per_t_wo)} / tCO₂e
                    </div>
                  </div>

                  <div className="sm:col-span-3 pt-2 border-t border-gray-300">
                    <div className="text-gray-500">
                      Rep. cost (with current CP = {currency} {formatNumber(carbonPrice)}/tCO₂)
                    </div>
                    <div className="font-semibold text-base">
                      {currency} {formatNumber(activeRep.implied_cost_per_t_w)} / tCO₂e
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className="p-4 border-t border-gray-200 bg-white sticky bottom-0 flex items-center justify-end gap-3">
          {tab !== "quick" && (
            <label className="mr-auto flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={applyCarbonPriceInSave}
                onChange={e =>
                  setApplyCarbonPriceInSave(e.target.checked)
                }
                className="form-checkbox h-4 w-4 text-blue-600 border-gray-300 rounded"
              />
              Save cost including carbon price ({currency}{" "}
              {formatNumber(carbonPrice)}/tCO₂)
            </label>
          )}
          <button
            className={UI_CLASSES.SecondaryButton.replace("py-2", "py-1.5")}
            onClick={onClose}
          >
            Cancel
          </button>
          {tab === "quick" ? (
            <button
              className={UI_CLASSES.PrimaryButton.replace("py-2", "py-1.5")}
              onClick={saveQuick}
            >
              {initialMeasure ? "Update measure" : "Save measure"}
            </button>
          ) : (
            <button
              className={UI_CLASSES.PrimaryButton.replace("py-2", "py-1.5")}
              onClick={saveTemplate}
            >
              {initialMeasure ? "Update measure" : "Save measure"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
