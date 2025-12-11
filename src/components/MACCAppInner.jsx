import React, { useMemo, useState, useEffect, useRef } from "react";
import useLocalStorage from '../hooks/useLocalStorage';
import { csvToJson, formatNumber, saveFile } from '../utils/dataHelpers';
import { 
  quadraticFit, 
  calculatePiecewiseLinearFit // 👈 ASSUMED IMPORT
} from '../utils/mathHelpers';
import { 
  DEFAULT_SECTORS, DEFAULT_BASELINES, PALETTE, UI_CLASSES 
} from '../utils/constants';
import { normalizeFRTW, normalizeElec } from '../utils/catalogHelpers';
import CollapsibleSection from './ui/CollapsibleSection';
import MeasureWizard from './wizards/MeasureWizard';
import ManageFirmsModal from './wizards/ManageFirmsModal';
import CatalogsEditor from './CatalogsEditor';
import MACCChart from './macc/MACCChart';
import MeasuresTable from './macc/MeasuresTable';
import TimeseriesViewer from './macc/TimeseriesViewer';

// Helper for firm sector label check
const isFirmSectorLabel = (label) => typeof label === "string" && label.startsWith("Firm – ");
// Helper for local storage key (Renamed to match proposed standard)
const getFirmStorageKey = (id, suffix) => `macc_firm_${id}_${suffix}`; // Formerly keyFor

function normalizeMeasures(arr) {
  // Retaining original keys (abatement_tco2) for compatibility with existing data structures in this file.
  return (arr || []).map((m, i) => ({ 
    ...m, 
    id: m.id ? Number(m.id) : (i + 1), 
    abatement_tco2: Number(m.abatement_tco2 || 0), 
    cost_per_tco2: Number(m.cost_per_tco2 || 0), 
    selected: String(m.selected ?? "true").toLowerCase() !== "false", 
  }));
}

export default function MACCAppInner() {
  // --- Core State (Renamed) ---
  const [xAxisMode, setXAxisMode] = useLocalStorage("macc_xAxisMode", "capacity"); // Formerly 'mode'
  const [maccCurveModel, setMaccCurveModel] = useLocalStorage("macc_maccCurveModel", "step"); // Formerly 'costModel'
  const [fitPositiveCostsOnly, setFitPositiveCostsOnly] = useLocalStorage("macc_fitPositiveCostsOnly", false);
  const [selectedSector, setSelectedSector] = useLocalStorage("macc_selected_sector", "All sectors");
  const [targetReductionPct, setTargetReductionPct] = useLocalStorage("macc_targetReductionPct", 20); // Formerly 'targetIntensityPct'

  // --- Data State ---
  const [dataSources, setDataSources] = useState({ sectors: [], baselines: {}, measures: [], fuels: [], raw: [], transport: [], waste: [], electricity: [] });
  const [dataLoaded, setDataLoaded] = useState(false);
  const [dataError, setDataError] = useState(null);

  // Firm Management State
  const [firms, setFirms] = useLocalStorage("macc_firms", []);
  const [activeFirmId, setActiveFirmId] = useLocalStorage("macc_active_firm_id", null);
  const [manageOpen, setManageOpen] = useState(false);

  // Active Firm Data State (Persisted)
  const [currency, setCurrency] = useState("₹");
  const [carbonPrice, setCarbonPrice] = useState(0);
  const [sectors, setSectors] = useState(DEFAULT_SECTORS);
  const [baselines, setBaselines] = useState(DEFAULT_BASELINES);
  const [measures, setMeasures] = useState(null); 
  const [customCatalogs, setCustomCatalogs] = useState({ fuels: [], raw: [], transport: [], waste: [], electricity: [] });
  const [catalogMode, setCatalogMode] = useState("merged"); 

  // Measure Editing State
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingMeasure, setEditingMeasure] = useState(null);
  const [inspectedId, setInspectedId] = useState(null);

  // --- Data Loading (from /data) ---
  useEffect(() => {
    async function fetchData() {
      try {
        // ... (fetch logic unchanged) ...
        const [measuresCsvResponse, sectorsResponse, baselinesResponse, fuelsResponse, rawResponse, transportResponse, wasteResponse, electricityResponse] = await Promise.all([
          fetch('/data/measures.csv'), fetch('/data/sectors.json'), fetch('/data/baselines.json'), 
          fetch('/data/fuels.json'), fetch('/data/raw.json'), fetch('/data/transport.json'), 
          fetch('/data/waste.json'), fetch('/data/electricity.json')
        ]);

        if (!measuresCsvResponse.ok) throw new Error('Failed to load measures.csv');
        // ... (other error checks) ...
        if (!sectorsResponse.ok) throw new Error('Failed to load sectors.json');
        if (!baselinesResponse.ok) throw new Error('Failed to load baselines.json');
        if (!fuelsResponse.ok) throw new Error('Failed to load fuels.json');
        if (!rawResponse.ok) throw new Error('Failed to load raw.json');
        if (!transportResponse.ok) throw new Error('Failed to load transport.json');
        if (!wasteResponse.ok) throw new Error('Failed to load waste.json');
        if (!electricityResponse.ok) throw new Error('Failed to load electricity.json');

        const measuresText = await measuresCsvResponse.text();
        const sectorsJson = await sectorsResponse.json();
        const baselinesJson = await baselinesResponse.json();
        const fuelsJson = await fuelsResponse.json();
        const rawJson = await rawResponse.json();
        const transportJson = await transportResponse.json();
        const wasteJson = await wasteResponse.json();
        const electricityJson = await electricityResponse.json();

        const parsedMeasures = csvToJson(measuresText).map((m, i) => ({ 
          ...m, id: m.id ? Number(m.id) : i + 1, 
          abatement_tco2: Number(m.abatement_tco2), cost_per_tco2: Number(m.cost_per_tco2), 
          selected: String(m.selected ?? "true").toLowerCase() !== "false" 
        }));

        setDataSources({ 
          sectors: sectorsJson, baselines: baselinesJson, measures: parsedMeasures, 
          fuels: fuelsJson, raw: rawJson, transport: transportJson, 
          waste: wasteJson, electricity: electricityJson 
        });
        setDataError(null);
        setDataLoaded(true);
      } catch (error) {
        console.error("Failed to load initial data:", error);
        setDataError(`Failed to load data: ${error.message}. Please ensure all data files are in your 'public/data' directory.`);
        setDataLoaded(true);
      }
    }
    fetchData();
  }, []); // Run once on mount

  // --- Firm Persistence & Loading Logic ---

  const loadFirmDataIntoState = (id) => {
    if (!id) return;
    try {
      // Use getFirmStorageKey (formerly keyFor)
      const sectorsL = JSON.parse(localStorage.getItem(getFirmStorageKey(id, "sectors")) || "[]");
      const baselinesL = JSON.parse(localStorage.getItem(getFirmStorageKey(id, "baselines")) || "{}");
      const measuresL = JSON.parse(localStorage.getItem(getFirmStorageKey(id, "measures")) || "[]");
      const currencyL = JSON.parse(localStorage.getItem(getFirmStorageKey(id, "currency")) || JSON.stringify("₹"));
      const carbonPriceL = JSON.parse(localStorage.getItem(getFirmStorageKey(id, "carbon_price")) || "0");
      const fuelsC = JSON.parse(localStorage.getItem(getFirmStorageKey(id, "catalogs_fuels")) || "[]");
      const rawC = JSON.parse(localStorage.getItem(getFirmStorageKey(id, "catalogs_raw")) || "[]");
      const transportC = JSON.parse(localStorage.getItem(getFirmStorageKey(id, "catalogs_transport")) || "[]");
      const wasteC = JSON.parse(localStorage.getItem(getFirmStorageKey(id, "catalogs_waste")) || "[]");
      const electricityC = JSON.parse(localStorage.getItem(getFirmStorageKey(id, "catalogs_electricity")) || "[]");
      const modeC = JSON.parse(localStorage.getItem(getFirmStorageKey(id, "catalog_mode")) || JSON.stringify("merged"));

      // Update State
      setSectors(sectorsL.length ? sectorsL : dataSources.sectors || []);
      setBaselines(Object.keys(baselinesL || {}).length ? baselinesL : dataSources.baselines || {});
      setMeasures(normalizeMeasures(measuresL.length ? measuresL : dataSources.measures || []));
      setCurrency("₹"); // Locked to INR per initial code logic
      setCarbonPrice(Number(carbonPriceL || 0));
      setCustomCatalogs({ 
        fuels: (fuelsC || []).map(normalizeFRTW), raw: (rawC || []).map(normalizeFRTW), 
        transport: (transportC || []).map(normalizeFRTW), waste: (wasteC || []).map(normalizeFRTW), 
        electricity: (electricityC || []).map(normalizeElec), 
      });
      setCatalogMode(modeC || "merged");

      if (selectedSector !== "All sectors" && !sectorsL.includes(selectedSector)) {
        setSelectedSector("All sectors");
      }
    } catch (e) {
      console.error("Failed to load firm data:", e);
    }
  };

  useEffect(() => {
    if (!dataLoaded || dataError) return;

    if (!firms || firms.length === 0) {
      // Initialize Default Firm if none exists
      const defaultFirm = { id: 1, name: "My Firm", currency: "₹", carbonPrice: 0, catalogMode: "merged" };
      setFirms([defaultFirm]);
      setActiveFirmId(1);
      
      // Seed storage with default/sample data (using getFirmStorageKey)
      localStorage.setItem(getFirmStorageKey(1, "sectors"), JSON.stringify(dataSources.sectors || []));
      localStorage.setItem(getFirmStorageKey(1, "baselines"), JSON.stringify(dataSources.baselines || {}));
      localStorage.setItem(getFirmStorageKey(1, "measures"), JSON.stringify(dataSources.measures || []));
      localStorage.setItem(getFirmStorageKey(1, "currency"), JSON.stringify("₹"));
      localStorage.setItem(getFirmStorageKey(1, "carbon_price"), JSON.stringify(0));
      localStorage.setItem(getFirmStorageKey(1, "catalogs_fuels"), JSON.stringify(dataSources.fuels || []));
      localStorage.setItem(getFirmStorageKey(1, "catalogs_raw"), JSON.stringify(dataSources.raw || []));
      localStorage.setItem(getFirmStorageKey(1, "catalogs_transport"), JSON.stringify(dataSources.transport || []));
      localStorage.setItem(getFirmStorageKey(1, "catalogs_waste"), JSON.stringify(dataSources.waste || []));
      localStorage.setItem(getFirmStorageKey(1, "catalogs_electricity"), JSON.stringify(dataSources.electricity || []));
      localStorage.setItem(getFirmStorageKey(1, "catalog_mode"), JSON.stringify("merged"));

      loadFirmDataIntoState(1);
    } else {
      // Load active firm data
      if (!activeFirmId) {
        setActiveFirmId(firms[0].id);
        loadFirmDataIntoState(firms[0].id);
      } else {
        loadFirmDataIntoState(activeFirmId);
      }
    }
  }, [dataLoaded, dataError]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeFirmId) return;
    try {
      // Persist active firm data whenever state changes (using getFirmStorageKey)
      localStorage.setItem(getFirmStorageKey(activeFirmId, "sectors"), JSON.stringify(sectors));
      localStorage.setItem(getFirmStorageKey(activeFirmId, "baselines"), JSON.stringify(baselines));
      localStorage.setItem(getFirmStorageKey(activeFirmId, "measures"), JSON.stringify(measures || []));
      localStorage.setItem(getFirmStorageKey(activeFirmId, "currency"), JSON.stringify(currency));
      localStorage.setItem(getFirmStorageKey(activeFirmId, "carbon_price"), JSON.stringify(carbonPrice));
      localStorage.setItem(getFirmStorageKey(activeFirmId, "catalogs_fuels"), JSON.stringify(customCatalogs.fuels || []));
      localStorage.setItem(getFirmStorageKey(activeFirmId, "catalogs_raw"), JSON.stringify(customCatalogs.raw || []));
      localStorage.setItem(getFirmStorageKey(activeFirmId, "catalogs_transport"), JSON.stringify(customCatalogs.transport || []));
      localStorage.setItem(getFirmStorageKey(activeFirmId, "catalogs_waste"), JSON.stringify(customCatalogs.waste || []));
      localStorage.setItem(getFirmStorageKey(activeFirmId, "catalogs_electricity"), JSON.stringify(customCatalogs.electricity || []));
      localStorage.setItem(getFirmStorageKey(activeFirmId, "catalog_mode"), JSON.stringify(catalogMode));

      // Update firms list with current currency/cp/mode
      setFirms(f => (f || []).map(ff => ff.id === activeFirmId ? { ...ff, currency, carbonPrice, catalogMode } : ff) );
    } catch (e) {
      console.error("Failed to persist firm data:", e);
    }
  }, [activeFirmId, sectors, baselines, measures, currency, carbonPrice, customCatalogs, catalogMode, setFirms]);

  // --- Export/Import Handlers ---
  const exportFirmAsJson = (id) => {
    if (!id) return;
    const payload = { 
      name: (firms.find(f => f.id === id)?.name) || `Firm ${id}`, currency, carbonPrice, catalogMode, sectors, baselines, measures: measures || [], catalogs: customCatalogs 
    };
    saveFile(`${payload.name.replace(/\s+/g,'_')}_macc.json`, JSON.stringify(payload, null, 2));
  };

  const importFirmFromJson = (text) => {
    try {
      const obj = JSON.parse(text || "{}");
      if (!activeFirmId) return;

      if (!Array.isArray(obj.sectors) || typeof obj.baselines !== "object" || !Array.isArray(obj.measures) || typeof obj.catalogs !== "object") {
        alert("Invalid firm JSON. Expect keys: sectors[], baselines{}, measures[], catalogs{}.");
        return;
      }
      
      const newCurrency = "₹"; // Locked to INR
      const newCp = Number(obj.carbonPrice ?? carbonPrice);
      const newMode = obj.catalogMode ?? "merged";

      // Persist to local storage (using getFirmStorageKey)
      localStorage.setItem(getFirmStorageKey(activeFirmId, "sectors"), JSON.stringify(obj.sectors));
      localStorage.setItem(getFirmStorageKey(activeFirmId, "baselines"), JSON.stringify(obj.baselines));
      localStorage.setItem(getFirmStorageKey(activeFirmId, "measures"), JSON.stringify(obj.measures));
      localStorage.setItem(getFirmStorageKey(activeFirmId, "currency"), JSON.stringify(newCurrency));
      localStorage.setItem(getFirmStorageKey(activeFirmId, "carbon_price"), JSON.stringify(newCp));
      localStorage.setItem(getFirmStorageKey(activeFirmId, "catalogs_fuels"), JSON.stringify(obj.catalogs?.fuels || []));
      localStorage.setItem(getFirmStorageKey(activeFirmId, "catalogs_raw"), JSON.stringify(obj.catalogs?.raw || []));
      localStorage.setItem(getFirmStorageKey(activeFirmId, "catalogs_transport"), JSON.stringify(obj.catalogs?.transport || []));
      localStorage.setItem(getFirmStorageKey(activeFirmId, "catalogs_waste"), JSON.stringify(obj.catalogs?.waste || []));
      localStorage.setItem(getFirmStorageKey(activeFirmId, "catalogs_electricity"), JSON.stringify(obj.catalogs?.electricity || []));
      localStorage.setItem(getFirmStorageKey(activeFirmId, "catalog_mode"), JSON.stringify(newMode));

      // Update state
      setSectors(obj.sectors);
      setBaselines(obj.baselines);
      setMeasures(normalizeMeasures(obj.measures));
      setCurrency(newCurrency);
      setCarbonPrice(newCp);
      setCustomCatalogs({ 
        fuels: (obj.catalogs?.fuels || []).map(normalizeFRTW), raw: (obj.catalogs?.raw || []).map(normalizeFRTW), 
        transport: (obj.catalogs?.transport || []).map(normalizeFRTW), waste: (obj.catalogs?.waste || []).map(normalizeFRTW), 
        electricity: (obj.catalogs?.electricity || []).map(normalizeElec), 
      });
      setCatalogMode(newMode);
      
      if (obj.name) {
        setFirms(firms.map(ff => ff.id === activeFirmId ? { ...ff, name: obj.name } : ff));
      }

      alert("Firm data imported successfully.");
    } catch (e) {
      console.error("Import failed:", e);
      alert("Failed to import firm JSON.");
    }
  };
  
  // --- Measure Management Handlers ---
  const addMeasure = () => {
    setEditingMeasure(null);
    setWizardOpen(true);
  };
  
  const saveWizard = (obj) => {
    if (obj?.id != null) {
      setMeasures((prev) => prev.map((m) => m.id === obj.id ? { ...m, ...obj } : m));
    } else {
      const id = Math.max(0, ...(measures || []).map(m => m.id)) + 1;
      setMeasures([...(measures || []), { id, ...obj }]);
    }
    setWizardOpen(false);
    setEditingMeasure(null);
  };
  
  const clearAll = () => {
    if (typeof window !== 'undefined' && window.confirm("Clear all measures? This cannot be undone.")) setMeasures([]);
  };

  // --- Derived State (useMemo) ---
  const mergedBy = (arrA, arrB, keyName) => {
    const map = new Map();
    (arrA || []).forEach(x => { if (x?.[keyName]) map.set(String(x[keyName]).toLowerCase(), x); });
    (arrB || []).forEach(x => { if (x?.[keyName]) map.set(String(x[keyName]).toLowerCase(), x); }); // custom overrides
    return Array.from(map.values());
  };

  const resolvedCatalogs = useMemo(() => {
    const sample = dataSources;
    const custom = customCatalogs;
    if (catalogMode === "sample") {
      return { fuels: sample.fuels || [], raw: sample.raw || [], transport: sample.transport || [], waste: sample.waste || [], electricity: sample.electricity || [] };
    } else if (catalogMode === "custom") {
      return { fuels: custom.fuels || [], raw: custom.raw || [], transport: custom.transport || [], waste: custom.waste || [], electricity: custom.electricity || [] };
    }
    // Renamed UI text
    return { 
      fuels: mergedBy(sample.fuels || [], custom.fuels || [], "name"), 
      raw: mergedBy(sample.raw || [], custom.raw || [], "name"), 
      transport: mergedBy(sample.transport || [], custom.transport || [], "name"), 
      waste: mergedBy(sample.waste || [], custom.waste || [], "name"), 
      electricity: mergedBy(sample.electricity || [], custom.electricity || [], "state"), 
    };
  }, [dataSources, customCatalogs, catalogMode]);

  const sectorOptions = useMemo(() => ["All sectors", ...sectors], [sectors]);

  // Renamed: activeBaseline -> selectedSectorBaseline
  const selectedSectorBaseline = useMemo(() => {
    if (selectedSector === "All sectors") {
      const entries = Object.entries(baselines || {}).filter(([key]) => !isFirmSectorLabel(key));
      const emissions = entries.reduce((s, [, b]) => s + Number(b?.annual_emissions || 0), 0);
      const production = entries.reduce((s, [, b]) => s + Number(b?.annual_production || 0), 0);
      const production_label = entries[0]?.[1]?.production_label || "units";
      return { production_label, annual_production: production, annual_emissions: emissions };
    }
    return baselines?.[selectedSector] || { production_label: "units", annual_production: 1, annual_emissions: 1 };
  }, [selectedSector, baselines]);

  const baselineIntensity = useMemo(() => {
    const prod = Number(selectedSectorBaseline.annual_production || 0);
    const emis = Number(selectedSectorBaseline.annual_emissions || 0);
    return prod > 0 ? emis / prod : 0;
  }, [selectedSectorBaseline]);

  // Renamed: filtered -> activeMeasures
  const activeMeasures = useMemo(() => (measures || []).filter(m => m.selected && (selectedSector === "All sectors" || m.sector === selectedSector)), [measures, selectedSector]);
  
  // Renamed: sorted -> sortedMeasuresByCost
  const sortedMeasuresByCost = useMemo(() => {
    const copy = activeMeasures.map(m => {
      // Renamed to effective_marginal_cost
      const baseCost = Number(m.cost_per_tco2 || 0);
      const cpNow = Number(carbonPrice || 0);
      const savedIncludesCP = Boolean(m?.details?.saved_cost_includes_carbon_price);
      const cpAtSave = Number(m?.details?.carbon_price_at_save || 0);
      const effective_marginal_cost = savedIncludesCP ? (baseCost - (cpNow - cpAtSave)) : (baseCost - cpNow);
      return { ...m, effective_cost: effective_marginal_cost };
    });
    copy.sort((a, b) => (a.effective_cost || 0) - (b.effective_cost || 0));
    return copy;
  }, [activeMeasures, carbonPrice]);

  // Renamed: segments -> maccBarSegments, totalX -> totalAbatementCapacity
  const { maccBarSegments, totalAbatementCapacity } = useMemo(() => {
    let cum = 0;
    const segs = [];
    sortedMeasuresByCost.forEach((m, idx) => {
      const A = Number(m.abatement_tco2 || 0);
      const C = Number(m.effective_cost || 0);
      if (!Number.isFinite(A) || !Number.isFinite(C) || A <= 0) return;

      const x1_cap = cum, x2_cap = cum + Math.max(0, A);
      cum = x2_cap;

      const denom = Number(selectedSectorBaseline.annual_emissions || 0);
      const x1_plot = (xAxisMode === "capacity") ? x1_cap : (denom > 0 ? (x1_cap / denom) * 100 : 0);
      const x2_plot = (xAxisMode === "capacity") ? x2_cap : (denom > 0 ? (x2_cap / denom) * 100 : 0);

      const userColor =
        m.color_hex ||
        m.details?.color_hex ||
        null;

      const baseColor = m.color || null;
      const paletteColor = PALETTE[idx % PALETTE.length] || "#4e79a7";

      segs.push({
        id: m.id,
        name: m.name,
        sector: m.sector,
        x1_plot,
        x2_plot,
        cost: C,
        abatement: A,
        color_hex: userColor || null,
        color: userColor || baseColor || paletteColor,
      });
    });
    const totalX_plot = segs.length ? segs[segs.length - 1].x2_plot : 0;
    return { maccBarSegments: segs, totalAbatementCapacity: totalX_plot };
  }, [sortedMeasuresByCost, xAxisMode, selectedSectorBaseline.annual_emissions]);

  // Renamed: maccData -> maccChartDataPoints
  const maccChartDataPoints = useMemo(() => {
    let cumAbate = 0;
    const points = [];
    for (const m of sortedMeasuresByCost) {
      const A = Number(m.abatement_tco2 || 0);
      const C = Number(m.effective_cost || 0);
      cumAbate += Math.max(0, A);

      const xCapacity = cumAbate;
      const xIntensityPct = selectedSectorBaseline.annual_emissions > 0 ? (cumAbate / selectedSectorBaseline.annual_emissions) * 100 : 0;
      const x = xAxisMode === "capacity" ? xCapacity : xIntensityPct; // Use xAxisMode

      points.push({ id: m.id, name: m.name, sector: m.sector, abatement: A, cost: C, cumAbate, x });
    }
    return points;
  }, [sortedMeasuresByCost, xAxisMode, selectedSectorBaseline.annual_emissions]);

  // Renamed: quad -> quadraticFitResult
  const quadraticFitResult = useMemo(() => {
    const dataToFit = fitPositiveCostsOnly ? maccChartDataPoints.filter(p => p.cost >= 0) : maccChartDataPoints;
    if (dataToFit.length < 3) return null;
    const xs = dataToFit.map(p => p.x);
    const ys = dataToFit.map(p => p.cost);
    const { a, b, c, r2 } = quadraticFit(xs, ys);
    const fitted = maccChartDataPoints.map(p => ({ x: p.x, y: a + b * p.x + c * p.x * p.x }));
    return { a, b, c, r2, fitted };
  }, [maccChartDataPoints, fitPositiveCostsOnly]);
  
  // 👈 NEW: Piecewise Linear Fit Result
  const piecewiseFitResult = useMemo(() => {
    if (maccChartDataPoints.length < 4) return null;
    
    // Assumes calculatePiecewiseLinearFit is defined and imported
    try {
        const result = calculatePiecewiseLinearFit(maccChartDataPoints);
        if (result.fittedPoints?.length > 1) return result;
        return null;
    } catch (e) {
        console.error("Piecewise Fit failed:", e);
        return null;
    }
  }, [maccChartDataPoints]);
  
  // Auto-switch cost model if fit fails (Updated for Piecewise)
  useEffect(() => {
    if (maccCurveModel === 'quadratic' && !quadraticFitResult) setMaccCurveModel('step');
    if (maccCurveModel === 'piecewise' && !piecewiseFitResult) setMaccCurveModel('step');
  }, [maccCurveModel, quadraticFitResult, piecewiseFitResult, setMaccCurveModel]);
  
  // Renamed: budgetToTarget -> costToAchieveTarget
  const costToAchieveTarget = useMemo(() => {
    if (!maccChartDataPoints.length) return { targetReached: 0, budget: 0 };
    
    // Use targetReductionPct, selectedSectorBaseline, sortedMeasuresByCost, xAxisMode
    const targetIntensity = Number(targetReductionPct || 0);
    const targetAbatementCapacity = (Number(selectedSectorBaseline.annual_emissions || 0) * (targetIntensity / 100));
    
    let cumAbatement = 0, budget = 0, reached = 0;

    for (const p of sortedMeasuresByCost) {
      const remainingAbatement = Math.max(0, targetAbatementCapacity - cumAbatement);
      const takeAbatement = Math.min(remainingAbatement, p.abatement_tco2);

      if (takeAbatement > 0) {
        budget += takeAbatement * p.effective_cost;
        cumAbatement += takeAbatement;
        
        reached = xAxisMode === "capacity" 
          ? cumAbatement 
          : (selectedSectorBaseline.annual_emissions > 0 ? (cumAbatement / selectedSectorBaseline.annual_emissions * 100) : 0);
      }
    }

    const maxPossible = (xAxisMode === "capacity") 
      ? cumAbatement 
      : (selectedSectorBaseline.annual_emissions > 0 ? (cumAbatement / selectedSectorBaseline.annual_emissions) * 100 : 0);
      
    return { 
      targetReached: Math.min(reached, maxPossible), 
      budget 
    };
  }, [sortedMeasuresByCost, selectedSectorBaseline.annual_emissions, xAxisMode, targetReductionPct]);
  
  // Renamed: totalWidth
  const totalWidth = useMemo(() => (xAxisMode === 'capacity' ? (totalAbatementCapacity > 0 ? totalAbatementCapacity : 1) : Math.max(100, totalAbatementCapacity || 1)), [totalAbatementCapacity, xAxisMode]);
  
  // Renamed: targetX
  const targetX = useMemo(() => {
    const t = Number(targetReductionPct || 0);
    if (xAxisMode === 'capacity') {
      const baseEmis = Number(selectedSectorBaseline.annual_emissions || 0);
      return baseEmis > 0 ? baseEmis * (t / 100) : 0;
    }
    return t;
  }, [xAxisMode, selectedSectorBaseline.annual_emissions, targetReductionPct]);

  // Renamed: yDomain uses maccBarSegments
  const yDomain = useMemo(() => {
    if (!maccBarSegments.length) return [0, 1];
    const ys = maccBarSegments.map(s => Number(s.cost) || 0);
    const minY = Math.min(0, ...ys), maxY = Math.max(0, ...ys);
    const padding = Math.max(1, (maxY - minY) * 0.1);
    return [minY - padding, maxY + padding];
  }, [maccBarSegments]);

  const inspectedMeasure = useMemo(() => (measures || []).find(m => m.id === inspectedId), [measures, inspectedId]);

  if (!dataLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col bg-gray-100">
        <div className="w-12 h-12 rounded-full animate-spin border-4 border-solid border-blue-600 border-t-transparent mb-4"></div>
        <div className="text-xl text-gray-700">Loading initial data...</div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100">
        <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-xl shadow-lg relative max-w-lg text-center" role="alert">
          <strong className="font-bold">Data Error!</strong>
          <span className="block sm:inline mt-1 ml-2 text-sm">{dataError}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header (UI Renamed) */}
        <header className="bg-white rounded-xl shadow-lg border border-gray-100 p-4 sm:p-6 sticky top-4 z-40">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">India CCTS – MACC Builder</h1>
              <p className="text-gray-500 mt-1">Multi-Firm Analysis & Custom Catalogs</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              
              {/* Firm Switcher */}
              <div className="flex items-center gap-2 border border-gray-300 rounded-xl px-2 py-1 bg-gray-50">
                <span className="text-sm text-gray-700 font-medium">Firm:</span>
                <select 
                  className="border-none focus:ring-0 bg-transparent py-1 text-gray-800 font-semibold cursor-pointer" 
                  value={activeFirmId || ""} 
                  onChange={(e) => { 
                    const id = Number(e.target.value); setActiveFirmId(id); loadFirmDataIntoState(id); 
                  }}
                >
                  {(firms || []).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <button className="px-2 py-1 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-white transition" onClick={() => setManageOpen(true)}>Manage</button>
              </div>

              {/* Wizard catalog source */}
              {/* <label className="flex flex-col text-sm w-40"> */}
                {/* <span className="font-medium text-gray-700">Wizard Data</span>
                <select className={UI_CLASSES.Select.replace('w-full', 'mt-1')} value={catalogMode} onChange={(e) => setCatalogMode(e.target.value)}> */}
                  {/* <option value="sample">Sample</option> */}
                  {/* <option value="custom">Custom</option> */}
                  {/* <option value="merged">Merged (Custom Overrides Sample)</option> Renamed merged label */}
                {/* </select> */}
              {/* </label> */}

              {/* Sector Filter */}
              <label className="flex flex-col text-sm w-40">
                <span className="font-medium text-gray-700">Filter Sector</span>
                <select className={UI_CLASSES.Select.replace('w-full', 'mt-1')} value={selectedSector} onChange={(e) => setSelectedSector(e.target.value)}>
                  {sectorOptions.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              
              {/* Carbon Price Input Group */}
              <label className="flex flex-col text-sm">
                <span className="font-medium text-gray-700">Carbon Price</span>
                <div className="flex items-center mt-1 border border-gray-300 rounded-lg overflow-hidden w-40">
                  <span className="bg-gray-50 text-gray-500 px-2 py-2 border-r border-gray-300 text-sm">{currency}</span>
                  <input type="number" className="w-full px-2 py-2 text-right text-gray-800 border-none focus:ring-0" value={carbonPrice} onChange={(e) => setCarbonPrice(Number(e.target.value))} aria-label="Carbon Price" />
                  <span className="bg-gray-50 text-gray-500 px-2 py-2 border-l border-gray-300 text-sm">/tCO₂</span>
                </div>
              </label>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
            <button className={UI_CLASSES.SecondaryButton} onClick={() => clearAll()}>Clear All Measures</button>
            <button className={UI_CLASSES.PrimaryButton} onClick={addMeasure}>+ Add Measure</button>
          </div>
        </header>

        {/* Manage Firms Modal */}
        {manageOpen && (
          <ManageFirmsModal 
            onClose={() => setManageOpen(false)} 
            firms={firms || []} 
            setFirms={setFirms} 
            activeFirmId={activeFirmId} 
            setActiveFirmId={setActiveFirmId} 
            sampleDataSources={dataSources} 
            loadFirmDataIntoState={loadFirmDataIntoState} 
            exportFirmAsJson={exportFirmAsJson} 
            importFirmFromJson={importFirmFromJson} 
          />
        )}

        {/* Settings (UI Renamed/Updated for Piecewise) */}
        <section className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-3 border-r border-gray-100 pr-6">
            <h3 className="text-base font-semibold text-gray-800">Display Mode</h3> {/* Renamed from View Mode */}
            <div className="flex gap-2">
              <button className={`px-3 py-2 rounded-xl border ${xAxisMode === 'capacity' ? UI_CLASSES.ActiveToggle : UI_CLASSES.InactiveToggle}`} onClick={() => setXAxisMode("capacity")}>Absolute Abatement (tCO₂)</button> {/* Renamed button */}
              <button className={`px-3 py-2 rounded-xl border ${xAxisMode === 'intensity' ? UI_CLASSES.ActiveToggle : UI_CLASSES.InactiveToggle}`} onClick={() => setXAxisMode("intensity")}>Intensity Reduction (%)</button> {/* Renamed button */}
            </div>
            <p className="text-xs text-gray-500">Absolute Abatement: cumulative tCO₂; Intensity: cumulative % reduction vs baseline.</p>
          </div>
          
          <div className="space-y-3 border-r border-gray-100 pr-6">
            <h3 className="text-base font-semibold text-gray-800">MACC Curve Model</h3> {/* Renamed from Marginal Cost Model */}
            <div className="flex gap-2 flex-wrap">
              <button className={`px-3 py-2 rounded-xl border ${maccCurveModel === 'step' ? UI_CLASSES.ActiveToggle : UI_CLASSES.InactiveToggle}`} onClick={() => setMaccCurveModel("step")}>Step</button> {/* Renamed Step button */}
              <button className={`px-3 py-2 rounded-xl border ${maccCurveModel === 'quadratic' ? UI_CLASSES.ActiveToggle : UI_CLASSES.InactiveToggle}`} onClick={() => { if (maccChartDataPoints.length >= 3) setMaccCurveModel("quadratic"); }}>Quadratic Fit</button> {/* Renamed Quadratic button */}
              {/* <button 
                className={`px-3 py-2 rounded-xl border ${maccCurveModel === 'piecewise' ? UI_CLASSES.ActiveToggle : UI_CLASSES.InactiveToggle}`} 
                onClick={() => { if (maccChartDataPoints.length >= 4) setMaccCurveModel("piecewise"); }}
                disabled={maccChartDataPoints.length < 4}
              >
                Piecewise Linear
              </button> 👈 NEW BUTTON */}
            </div>
            {(maccCurveModel === 'quadratic' || maccCurveModel === 'piecewise') && (
              <div className="mt-2 text-sm flex items-center gap-2">
                <input type="checkbox" id="fit-positive-costs-only" checked={fitPositiveCostsOnly} onChange={(e) => setFitPositiveCostsOnly(e.target.checked)} className="form-checkbox h-4 w-4 text-blue-600 rounded" />
                <label htmlFor="fit-positive-costs-only" className="text-gray-700 cursor-pointer text-xs"> Fit only to non-negative measures </label>
              </div>
            )}
          </div>
          
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-gray-800">
  Baseline Data for <span className="font-bold">{selectedSector}</span>
</h3> {/* Renamed Baseline Header */}
            <div className="grid grid-cols-3 gap-2 items-center">
              <div className="col-span-1 text-xs text-gray-600">Production ({selectedSectorBaseline.production_label})</div> {/* Use selectedSectorBaseline */}
              <input type="number" className="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm" value={selectedSectorBaseline.annual_production} onChange={(e) => { 
                if (selectedSector === "All sectors") return; 
                setBaselines({ ...baselines, [selectedSector]: { ...selectedSectorBaseline, annual_production: (e.target.value === "" ? "" : Number(e.target.value)) } }); 
              }} />
              <div className="col-span-1 text-xs text-gray-600">Emissions (tCO₂/yr)</div>
              <input type="number" className="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm" value={selectedSectorBaseline.annual_emissions} onChange={(e) => { 
                if (selectedSector === "All sectors") return; 
                setBaselines({ ...baselines, [selectedSector]: { ...selectedSectorBaseline, annual_emissions: (e.target.value === "" ? "" : Number(e.target.value)) } }); 
              }} />
            </div>
            <p className="text-xs text-gray-500">Intensity: {formatNumber(baselineIntensity)} tCO₂ per {selectedSectorBaseline.production_label}.</p>
          </div>
        </section>

        {/* Firm Data — Sectors & Baselines (UI Renamed) */}
        <CollapsibleSection title="Firm Data — Sectors & Baselines" storageKey="macc_collapse_firmData" headerRight={
          <button className="px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 transition" onClick={() => { 
            const name = prompt("New sector name?"); 
            if (!name) return; 
            if (sectors.includes(name)) { alert("Sector already exists."); return; } 
            setSectors([...sectors, name]); 
            setBaselines({ ...baselines, [name]: { production_label: "units", annual_production: 0, annual_emissions: 0 } }); 
          }}> + Add Sector </button>
        }>
          <div className="overflow-x-auto mt-3 rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-gray-600 uppercase tracking-wider">
                  <th className="p-3 text-left font-semibold">Sector</th>
                  <th className="p-3 text-left font-semibold">Production label</th>
                  <th className="p-3 text-right font-semibold">Baseline Production</th> {/* Renamed Header */}
                  <th className="p-3 text-right font-semibold">Baseline Emissions (tCO₂/yr)</th> {/* Renamed Header */}
                  <th className="p-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sectors.map((s, idx) => {
                  const b = baselines[s] || { production_label: "units", annual_production: 0, annual_emissions: 0 };
                  return (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-2">
                        <input className="border border-gray-300 rounded-lg px-2 py-1 w-48 text-sm focus:ring-1 focus:ring-blue-500" value={s} onChange={(e) => { 
                          const newName = e.target.value; 
                          if (!newName) return; 
                          if (newName !== s && sectors.includes(newName)) { alert("Sector already exists."); return; } 
                          const newSectors = sectors.map(x => x === s ? newName : x); 
                          const { [s]: old, ...rest } = baselines; 
                          setSectors(newSectors); 
                          setBaselines({ ...rest, [newName]: b }); 
                          if (selectedSector === s) setSelectedSector(newName); 
                        }} />
                      </td>
                      <td className="p-2">
                        <input className="border border-gray-300 rounded-lg px-2 py-1 w-40 text-sm focus:ring-1 focus:ring-blue-500" value={b.production_label} onChange={(e) => setBaselines({ ...baselines, [s]: { ...b, production_label: e.target.value } })} />
                      </td>
                      <td className="p-2 text-right">
                        <input type="number" className="border border-gray-300 rounded-lg px-2 py-1 w-40 text-right text-sm focus:ring-1 focus:ring-blue-500" value={b.annual_production} onChange={(e) => setBaselines({ ...baselines, [s]: { ...b, annual_production: (e.target.value === "" ? "" : Number(e.target.value)) } })} />
                      </td>
                      <td className="p-2 text-right">
                        <input type="number" className="border border-gray-300 rounded-lg px-2 py-1 w-40 text-right text-sm focus:ring-1 focus:ring-blue-500" value={b.annual_emissions} onChange={(e) => setBaselines({ ...baselines, [s]: { ...b, annual_emissions: (e.target.value === "" ? "" : Number(e.target.value)) } })} />
                      </td>
                      <td className="p-2 text-right">
                        <button className="px-2 py-1 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-sm" onClick={() => { 
                          if (!window.confirm("Delete this sector?")) return; 
                          setSectors(sectors.filter(x => x !== s)); 
                          const { [s]: _, ...rest } = baselines; 
                          setBaselines(rest); 
                          if (selectedSector === s) setSelectedSector("All sectors"); 
                        }}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
                {sectors.length === 0 && ( <tr><td className="p-3 text-sm text-gray-500 italic" colSpan={5}>No sectors yet. Click “+ Add Sector”.</td></tr> )}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>

        {/* MACC Chart (Prop Updates) */}
        <MACCChart
          segments={maccBarSegments} // Updated prop name
          quad={quadraticFitResult} // Updated prop name
          piecewiseFitResult={piecewiseFitResult} // 👈 NEW PROP
          maccData={maccChartDataPoints} // Updated prop name
          costModel={maccCurveModel} // Updated prop name
          mode={xAxisMode} // Updated prop name
          totalWidth={totalAbatementCapacity} // Updated prop name
          yDomain={yDomain}
          currency={currency}
          carbonPrice={carbonPrice}
          activeBaseline={selectedSectorBaseline} // Updated prop name
          targetIntensityPct={{ value: targetReductionPct, setter: setTargetReductionPct }} // Updated prop name
          budgetToTarget={costToAchieveTarget} // Updated prop name
          targetX={targetX}
        />

        {/* Measures table */}
        <MeasuresTable
          measures={measures}
          sectors={sectors}
          selectedSector={selectedSector}
          setMeasures={setMeasures}
          setInspectedId={setInspectedId}
          setEditingMeasure={setEditingMeasure}
          setWizardOpen={setWizardOpen}
        />

        {/* Firm Catalogs Editor */}
        <CollapsibleSection title="Driver & EF Catalogs (Fuels / Raw / Transport / Waste / Electricity)" storageKey="macc_collapse_catalogs">
          <CatalogsEditor 
            sample={{ 
              fuels: dataSources.fuels || [], raw: dataSources.raw || [], transport: dataSources.transport || [], 
              waste: dataSources.waste || [], electricity: dataSources.electricity || [] 
            }} 
            customCatalogs={customCatalogs} 
            setCustomCatalogs={setCustomCatalogs} 
            catalogMode={catalogMode} 
            setCatalogMode={setCatalogMode} 
          />
        </CollapsibleSection>

        {/* Wizard (conditionally mounted) */}
        {wizardOpen && (
          <MeasureWizard 
            onClose={() => { setWizardOpen(false); setEditingMeasure(null); }} 
            onSave={saveWizard} 
            sectors={sectors} 
            currency={currency} 
            carbonPrice={carbonPrice} 
            dataSources={resolvedCatalogs} 
            initialMeasure={editingMeasure} 
          />
        )}


        {/* Timeseries viewer */}
        <TimeseriesViewer
          inspected={inspectedMeasure}
          setInspectedId={setInspectedId}
          currency={currency}
        />

        {/* Methodology */}
        {/* <section className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
          <h2 className="text-xl font-semibold mb-3 text-gray-800 border-b border-gray-200 pb-2">Methodology</h2>
          <ul className="list-disc pl-5 text-sm space-y-2 text-gray-700"> 
            <li>Costs include drivers + opex + other − savings + financed annuity; upfront capex is added as that year’s cash flow.</li>
            <li>NPV are computed from yearly cash flows (with/without carbon price) discounted at the real rate.</li>
            <li>Firm data and catalogs are stored locally per firm and portable via JSON export/import.</li>
          </ul>
        </section> */}

        <footer className="text-xs text-gray-500 text-center pb-8">© 2025 India CCTS MACC Builder. All rights reserved.</footer>
      </div>
    </div>
  );
}