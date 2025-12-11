import React, { useState } from "react";
import { csvToJson, jsonToCsv, saveBlob, saveFile } from "../utils/dataHelpers";
import { normalizeFRTW, normalizeElec } from "../utils/catalogHelpers";
import { UI_CLASSES } from "../utils/constants";

const schemaByTab = {
  fuels: { cols: ["name","unit","price_per_unit_inr","ef_tco2_per_unit"], normalize: normalizeFRTW, headerNice: ["Name","Unit","Price/Unit (₹)","EF (tCO₂/Unit)"] },
  raw: { cols: ["name","unit","price_per_unit_inr","ef_tco2_per_unit"], normalize: normalizeFRTW, headerNice: ["Name","Unit","Price/Unit (₹)","EF (tCO₂/Unit)"] },
  transport: { cols: ["name","unit","price_per_unit_inr","ef_tco2_per_unit"], normalize: normalizeFRTW, headerNice: ["Name","Unit","Price/Unit (₹)","EF (tCO₂/Unit)"] },
  waste: { cols: ["name","unit","price_per_unit_inr","ef_tco2_per_unit"], normalize: normalizeFRTW, headerNice: ["Name","Unit","Price/Unit (₹)","EF (tCO₂/Unit)"] },
  electricity: { cols: ["state","price_per_mwh_inr","ef_tco2_per_mwh"], normalize: normalizeElec, headerNice: ["State/Region","Price/MWh (₹)","EF (tCO₂/MWh)"] },
};
const tabs = ["fuels", "raw", "transport", "waste", "electricity"];

export default function CatalogsEditor({ sample, customCatalogs, setCustomCatalogs, catalogMode, setCatalogMode }) {
  const [tab, setTab] = useState("fuels");
  
  const cat = customCatalogs[tab] || [];
  const sampleCat = sample[tab] || [];
  const setCat = (next) => setCustomCatalogs({ ...customCatalogs, [tab]: next });

  const addRow = () => {
    if (tab === "electricity") {
      setCat([...(cat || []), { state: "New State", price_per_mwh_inr: 0, ef_tco2_per_mwh: 0.710 }]);
    } else {
      setCat([...(cat || []), { name: "New Item", unit: "", price_per_unit_inr: 0, ef_tco2_per_unit: 0 }]);
    }
  };

  const importJSON = (text) => {
    try {
      const arr = JSON.parse(text || "[]");
      if (!Array.isArray(arr)) throw new Error("JSON must be an array");
      const norm = schemaByTab[tab].normalize;
      setCat(arr.map(norm));
      alert("Imported JSON successfully.");
    } catch (e) {
      console.error(e);
      alert("Failed to import JSON.");
    }
  };

  const importCSV = (text) => {
    try {
      const rows = csvToJson(text);
      const norm = schemaByTab[tab].normalize;
      setCat(rows.map(norm));
      alert("Imported CSV successfully.");
    } catch (e) {
      console.error(e);
      alert("Failed to import CSV.");
    }
  };

  const exportJSON = () => saveFile(`${tab}_catalog.json`, JSON.stringify(cat || [], null, 2));
  const exportCSV = () => saveBlob(`${tab}_catalog.csv`, "text/csv", jsonToCsv(cat || []));
  const resetToSample = () => setCat(sampleCat || []);
  const startBlank = () => setCat([]);

  const headerNice = schemaByTab[tab].headerNice;
  const cols = schemaByTab[tab].cols;

  const ActiveTabStyle = 'bg-blue-600 text-white shadow-md';
  const InactiveTabStyle = 'bg-gray-100 text-gray-700 hover:bg-gray-200';
  const ActionButtonStyle = 'px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition duration-150';

  return (
    <div className="p-0">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-800">Data Source Selector</h3>
        <div className="flex items-center gap-3">
          <label className="text-sm flex items-center gap-1 cursor-pointer">
            <input type="radio" checked={catalogMode === "sample"} onChange={() => setCatalogMode("sample")} className="form-radio text-blue-600" /> <span className="text-gray-700">Sample</span>
          </label>
          <label className="text-sm flex items-center gap-1 cursor-pointer">
            <input type="radio" checked={catalogMode === "custom"} onChange={() => setCatalogMode("custom")} className="form-radio text-blue-600" /> <span className="text-gray-700">Custom</span>
          </label>
          {/* <label className="text-sm flex items-center gap-1 cursor-pointer">
            <input type="radio" checked={catalogMode === "merged"} onChange={() => setCatalogMode("merged")} className="form-radio text-blue-600" /> <span className="text-gray-700">Merged (Custom $\blacktriangleright$ Sample)</span>
          </label> */}
        </div>
      </div>
      
      {/* Tabs */}
      <div className="mt-4 flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {tabs.map(t => (
          <button key={t} className={`px-4 py-2 rounded-lg text-sm transition duration-150 ${tab === t ? ActiveTabStyle : InactiveTabStyle}`} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)} Catalog
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button className={`${ActionButtonStyle} bg-blue-50 text-blue-700 border-blue-300`} onClick={addRow}>+ Add Row</button>
        <label className={`${ActionButtonStyle} cursor-pointer`}> Import CSV
          <input hidden type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const reader = new FileReader(); reader.onload = () => importCSV(String(reader.result)); reader.readAsText(f); e.currentTarget.value = ""; }} />
        </label>
        <label className={`${ActionButtonStyle} cursor-pointer`}> Import JSON
          <input hidden type="file" accept=".json" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const reader = new FileReader(); reader.onload = () => importJSON(String(reader.result)); reader.readAsText(f); e.currentTarget.value = ""; }} />
        </label>
        <button className={ActionButtonStyle} onClick={exportCSV}>Export CSV</button>
        <button className={ActionButtonStyle} onClick={exportJSON}>Export JSON</button>
        <div className="ml-auto flex gap-2">
          <button className={`${ActionButtonStyle} border-yellow-300 text-yellow-700 hover:bg-yellow-50`} onClick={resetToSample}>Reset to Sample</button>
          <button className={`${ActionButtonStyle} border-red-300 text-red-600 hover:bg-red-50`} onClick={startBlank}>Start Blank</button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto mt-4 rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-100 text-gray-600 uppercase tracking-wider">
              {headerNice.map(h => <th key={h} className="p-3 text-left font-semibold">{h}</th>)}
              <th className="p-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(cat || []).map((r, idx) => (
              <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                {cols.map((c) => (
                  <td key={c} className="p-2">
                    <input 
                      className={`border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${c.includes("price") || c.includes("ef_") || c.includes("production") ? 'w-40 text-right' : 'w-56'}`} 
                      value={r[c] ?? ""} 
                      onChange={(e) => {
                        const v = e.target.value;
                        const next = [...cat];
                        next[idx] = { ...next[idx], [c]: (c.includes("price") || c.includes("ef_") ? (v === "" ? "" : Number(v)) : v) };
                        setCat(next);
                      }}
                    />
                  </td>
                ))}
                <td className="p-2 text-right">
                  <button className="px-2 py-1 rounded-lg border border-red-300 text-red-600 hover:bg-red-50" onClick={() => setCat(cat.filter((_, i) => i !== idx))}>Delete</button>
                </td>
              </tr>
            ))}
            {(!cat || cat.length === 0) && <tr><td className="p-3 text-gray-500 text-sm italic" colSpan={cols.length + 1}>No rows. Add or import data to create your custom catalog.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Footer Hint */}
      <div className="text-xs text-gray-500 mt-3 p-1">
        **CSV columns expected**: {tab === "electricity" ? " state, price_per_mwh_inr, ef_tco2_per_mwh (aliases accepted: price_per_mwh | price; ef_t_per_mwh | ef_t)" : " name, unit, price_per_unit_inr, ef_tco2_per_unit (aliases accepted: price_per_unit | price; ef_t_per_unit | ef_t)"}
      </div>
    </div>
  );
}