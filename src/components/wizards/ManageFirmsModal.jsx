import React, { useState } from "react";
import { saveFile } from "../../utils/dataHelpers";

export default function ManageFirmsModal({ 
  onClose, firms, setFirms, activeFirmId, setActiveFirmId, 
  sampleDataSources, loadFirmDataIntoState, exportFirmAsJson, importFirmFromJson 
}) {
  const makeFirmSectorLabel = (nm) => `Firm – ${nm ?? ""}`.trim();
  
  const [name, setName] = useState("");
  const [startMode, setStartMode] = useState("sample"); // 'sample' | 'blank'
  const [currency, setCurrency] = useState("₹");
  const [carbonPrice, setCarbonPrice] = useState(0);

  // Helper function to get local storage key
  const keyFor = (id, suffix) => `macc_firm_${id}_${suffix}`;

  const createFirm = async () => {
    const nextId = Math.max(0, ...firms.map(f => f.id)) + 1;
    const firm = { id: nextId, name: name || `Firm ${nextId}`, currency, carbonPrice, catalogMode: "merged" };
    const nextFirms = [...firms, firm];
    setFirms(nextFirms);

    const sectorsRaw = startMode === "blank" ? [] : (sampleDataSources.sectors || []);
    const baselinesRaw = startMode === "blank" ? {} : (sampleDataSources.baselines || {});
    const measures = startMode === "blank" ? [] : (sampleDataSources.measures || []);

    const firmSectorLabel = makeFirmSectorLabel(firm.name);
    const sectors = Array.isArray(sectorsRaw) ? [...sectorsRaw] : [];
    if (!sectors.includes(firmSectorLabel)) sectors.push(firmSectorLabel);

    const baselines = { ...(baselinesRaw || {}) };
    if (!baselines[firmSectorLabel]) {
      baselines[firmSectorLabel] = { production_label: "units", annual_production: 0, annual_emissions: 0 };
    }

    const catalogs = { 
      fuels: (startMode === "blank" ? [] : (sampleDataSources.fuels || [])),
      raw: (startMode === "blank" ? [] : (sampleDataSources.raw || [])),
      transport: (startMode === "blank" ? [] : (sampleDataSources.transport || [])),
      waste: (startMode === "blank" ? [] : (sampleDataSources.waste || [])),
      electricity: (startMode === "blank" ? [] : (sampleDataSources.electricity || [])),
    };

    // Persist to Local Storage
    localStorage.setItem(keyFor(nextId, "sectors"), JSON.stringify(sectors));
    localStorage.setItem(keyFor(nextId, "baselines"), JSON.stringify(baselines));
    localStorage.setItem(keyFor(nextId, "measures"), JSON.stringify(measures));
    localStorage.setItem(keyFor(nextId, "currency"), JSON.stringify(currency));
    localStorage.setItem(keyFor(nextId, "carbon_price"), JSON.stringify(carbonPrice));
    localStorage.setItem(keyFor(nextId, "catalogs_fuels"), JSON.stringify(catalogs.fuels));
    localStorage.setItem(keyFor(nextId, "catalogs_raw"), JSON.stringify(catalogs.raw));
    localStorage.setItem(keyFor(nextId, "catalogs_transport"), JSON.stringify(catalogs.transport));
    localStorage.setItem(keyFor(nextId, "catalogs_waste"), JSON.stringify(catalogs.waste));
    localStorage.setItem(keyFor(nextId, "catalogs_electricity"), JSON.stringify(catalogs.electricity));
    localStorage.setItem(keyFor(nextId, "catalog_mode"), JSON.stringify("merged"));

    setActiveFirmId(nextId);
    await Promise.resolve(loadFirmDataIntoState?.(nextId));
    
    setName("");
    onClose?.();
  };

  const renameFirm = (id, newName) => {
    const prev = firms.find(f => f.id === id);
    const prevName = prev?.name ?? "";
    const oldLabel = makeFirmSectorLabel(prevName);
    const newLabel = makeFirmSectorLabel(newName);

    try {
      // Sync Sector Label
      const sectorsKey = keyFor(id, "sectors");
      const sectorsArr = JSON.parse(localStorage.getItem(sectorsKey) || "[]");
      if (Array.isArray(sectorsArr)) {
        const idx = sectorsArr.indexOf(oldLabel);
        if (idx !== -1) sectorsArr[idx] = newLabel;
        else if (!sectorsArr.includes(newLabel)) sectorsArr.push(newLabel);
        localStorage.setItem(sectorsKey, JSON.stringify(sectorsArr));
      }

      // Sync Baselines
      const baseKey = keyFor(id, "baselines");
      const bases = JSON.parse(localStorage.getItem(baseKey) || "{}");
      if (bases && bases[oldLabel] && !bases[newLabel]) {
        bases[newLabel] = bases[oldLabel];
        delete bases[oldLabel];
        localStorage.setItem(baseKey, JSON.stringify(bases));
      }
    } catch (e) {
      console.warn("Failed to sync firm sector label on rename:", e);
    }
    
    setFirms(firms.map(f => f.id === id ? { ...f, name: newName || f.name } : f));
    
    // Force a re-load if the active firm was renamed
    try {
      if (id === activeFirmId && typeof loadFirmDataIntoState === "function") {
        loadFirmDataIntoState(activeFirmId);
      }
    } catch (e) {
      console.warn("Post‑rename refresh failed:", e);
    }
  };

  const deleteFirm = (id) => {
    if (firms.length <= 1) {
      alert("You must keep at least one firm.");
      return;
    }
    if (!window.confirm("Delete this firm and all its local data? This cannot be undone.")) return;

    // Delete all local storage keys for the firm
    ["sectors","baselines","measures","currency","carbon_price","catalogs_fuels","catalogs_raw","catalogs_transport","catalogs_waste","catalogs_electricity","catalog_mode"].forEach(suffix => {
      localStorage.removeItem(keyFor(id, suffix));
    });

    const next = firms.filter(f => f.id !== id);
    setFirms(next);

    // Switch active firm if the current one was deleted
    if (activeFirmId === id) {
      const newActive = next[0].id;
      setActiveFirmId(newActive);
      loadFirmDataIntoState(newActive);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="bg-white w-full sm:max-w-3xl rounded-xl shadow-2xl p-6">
        <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
          <h3 className="text-xl font-bold text-gray-800">Manage Firms</h3>
          <button className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition" onClick={onClose}>Close</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 shadow-sm">
            <div className="text-base font-semibold text-gray-800 mb-3">Your Firms</div>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
              {firms.map(f => (
                <div key={f.id} className={`p-3 rounded-lg border transition duration-150 ${activeFirmId === f.id ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <input className={`border rounded-lg px-2 py-1 flex-1 text-sm focus:ring-1 focus:ring-blue-500 transition ${activeFirmId === f.id ? 'border-blue-300 bg-white' : 'border-gray-300'}`} value={f.name} onChange={(e) => renameFirm(f.id, e.target.value)} />
                    <button type="button" className="px-2 py-1 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-100 text-sm transition" 
                      onClick={async () => { 
                        setActiveFirmId(f.id); 
                        if (typeof loadFirmDataIntoState === "function") {
                          await Promise.resolve(loadFirmDataIntoState(f.id)); 
                        }
                        onClose?.(); 
                      }}> Use </button>
                    <button className="px-2 py-1 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-sm transition" onClick={() => deleteFirm(f.id)}> Delete </button>
                  </div>
                </div>
              ))}
              {firms.length === 0 && <div className="text-sm text-gray-500">No firms yet.</div>}
            </div>
          </div>
          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 shadow-sm">
            <div className="text-base font-semibold text-gray-800 mb-3">Create New Firm</div>
            <label className="text-sm font-medium text-gray-700 block">Firm name 
              <input className="mt-1 border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 transition" value={name} onChange={(e) => setName(e.target.value)} /> 
            </label>
            <div className="flex items-center gap-4 mt-3">
              <label className="text-sm flex items-center gap-1 font-medium text-gray-700 cursor-pointer"> 
                <input type="radio" name="startMode" checked={startMode === "sample"} onChange={() => setStartMode("sample")} className="form-radio text-blue-600" /> Start from sample data 
              </label>
              <label className="text-sm flex items-center gap-1 font-medium text-gray-700 cursor-pointer"> 
                <input type="radio" name="startMode" checked={startMode === "blank"} onChange={() => setStartMode("blank")} className="form-radio text-blue-600" /> Start blank 
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <label className="text-sm font-medium text-gray-700">Currency 
                <select className="mt-1 border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 transition" value={currency} onChange={(e) => setCurrency(e.target.value)}> 
                  <option>₹</option> 
                </select> 
              </label>
              <label className="text-sm font-medium text-gray-700">Carbon price 
                <div className="flex items-center gap-2 mt-1"> 
                  <input type="number" className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 transition" value={carbonPrice} onChange={(e) => setCarbonPrice(Number(e.target.value))} /> 
                  <span className="text-xs text-gray-500 whitespace-nowrap">per tCO₂</span> 
                </div> 
              </label>
            </div>
            <button className="mt-4 w-full px-3 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white shadow-md transition" onClick={createFirm}>Create Firm</button>
            <div className="text-base font-semibold text-gray-800 mt-5 pt-3 border-t border-gray-200">Export / Import</div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button className="px-3 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 transition" onClick={() => exportFirmAsJson(activeFirmId)}>Export Active Firm (.json)</button>
              <label className="px-3 py-2 rounded-xl border border-gray-300 text-center cursor-pointer text-gray-700 hover:bg-gray-100 transition"> Import (.json)
                <input type="file" accept=".json" hidden onChange={(e) => { 
                  const f = e.target.files?.[0]; 
                  if (!f) return; 
                  const reader = new FileReader(); 
                  reader.onload = () => importFirmFromJson(String(reader.result)); 
                  reader.readAsText(f); 
                  e.currentTarget.value = ''; 
                }} />
              </label>
            </div>
            <div className="text-xs text-gray-500 mt-1">Import replaces the active firm's data.</div>
          </div>
        </div>
      </div>
    </div>
  );
}