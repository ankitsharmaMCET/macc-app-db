import React, { useRef } from 'react';
import CollapsibleSection from '../ui/CollapsibleSection';
import { csvToJson, formatNumber, jsonToCsv, saveBlob } from '../../utils/dataHelpers';
import { UI_CLASSES } from '../../utils/constants';

export default function MeasuresTable({ measures, sectors, selectedSector, setMeasures, setInspectedId, setEditingMeasure, setWizardOpen }) {
  const fileInputRef = useRef(null);

  const filtered = (measures || [])
    .filter(m => selectedSector === "All sectors" || m.sector === selectedSector);
  
  const importCSV = (rows) => {
    const baseId = Math.max(0, ...(measures || []).map(m => m.id)) + 1;
    const parsed = rows.map((r, i) => ({ 
      id: baseId + i, 
      name: r.name || r.Measure || r.intervention || `Row ${i + 1}`, 
      sector: r.sector || r.Sector || (sectors[0] || "Power"), 
      abatement_tco2: Number(r.abatement_tco2 || r.abatement || r.Abatement || 0), 
      cost_per_tco2: Number(r.cost_per_tco2 || r.cost || r.Cost || 0), 
      selected: String(r.selected ?? "true").toLowerCase() !== "false", 
      details: r.details,
    }));
    setMeasures([...(measures || []), ...parsed]);
  };

  const exportCSV = () => {
    const rows = (measures || []).map(({ id, ...rest }) => rest);
    const text = jsonToCsv(rows);
    saveBlob("macc_measures.csv", "text/csv", text);
  };
  
  return (
    <CollapsibleSection title="Measures Table" storageKey="macc_collapse_measures" defaultOpen={true}>
      <div className="flex items-center justify-end mb-3 space-x-2">
        <button className={UI_CLASSES.SecondaryButton.replace('py-2', 'py-1.5')} onClick={exportCSV}>Export Measures CSV</button>
        <button className={UI_CLASSES.SecondaryButton.replace('py-2', 'py-1.5')} onClick={() => fileInputRef.current?.click()}>Import CSV</button>
        <input ref={fileInputRef} type="file" accept=".csv" hidden onChange={(e) => { 
          const f = e.target.files?.[0]; 
          if (!f) return; 
          const reader = new FileReader(); 
          reader.onload = () => importCSV(csvToJson(String(reader.result))); 
          reader.readAsText(f); 
          e.currentTarget.value = ''; 
        }} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-100 text-gray-600 uppercase tracking-wider">
              <th className="p-3 text-left font-semibold w-16">Use</th>
              <th className="p-3 text-left font-semibold">Measure ({selectedSector})</th>
              <th className="p-3 text-left font-semibold w-40">Sector</th>
              <th className="p-3 text-right font-semibold w-40">Abatement (tCO₂)</th>
              <th className="p-3 text-right font-semibold w-48">Marginal Cost (₹/tCO₂)</th>
              <th className="p-3 text-right font-semibold w-40">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="p-3 text-center">
                  <input type="checkbox" checked={m.selected} onChange={(e) => { 
                    const copy = [...(measures || [])]; 
                    const pos = copy.findIndex(x => x.id === m.id); 
                    copy[pos] = { ...m, selected: e.target.checked }; 
                    setMeasures(copy); 
                  }} className="form-checkbox h-4 w-4 text-blue-600 rounded" />
                </td>
                <td className="p-2 font-medium">
                  <input className="border border-gray-300 rounded-lg px-2 py-1 w-full text-sm focus:ring-1 focus:ring-blue-500" value={m.name} onChange={(e) => { 
                    const copy = [...(measures || [])]; 
                    const pos = copy.findIndex(x => x.id === m.id); 
                    copy[pos] = { ...m, name: e.target.value }; 
                    setMeasures(copy); 
                  }} />
                  {m.details?.per_year && (
                    <button className="text-[11px] text-blue-600 mt-1 hover:underline focus:outline-none" onClick={() => setInspectedId(m.id)}>View timeseries</button>
                  )}
                </td>
                <td className="p-2">
                  <select className="border border-gray-300 rounded-lg px-2 py-1 w-full text-sm bg-white cursor-pointer" value={m.sector} onChange={(e) => { 
                    const copy = [...(measures || [])]; 
                    const pos = copy.findIndex(x => x.id === m.id); 
                    copy[pos] = { ...m, sector: e.target.value }; 
                    setMeasures(copy); 
                  }}>
                    {sectors.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td className="p-2 text-right">
                  <input type="number" className="border border-gray-300 rounded-lg px-2 py-1 w-full text-right text-sm focus:ring-1 focus:ring-blue-500" value={m.abatement_tco2} onChange={(e) => { 
                    const copy = [...(measures || [])]; 
                    const pos = copy.findIndex(x => x.id === m.id); 
                    copy[pos] = { ...m, abatement_tco2: Number(e.target.value) }; 
                    setMeasures(copy); 
                  }} />
                </td>
                <td className="p-2 text-right">
                  <input type="number" className="border border-gray-300 rounded-lg px-2 py-1 w-full text-right text-sm focus:ring-1 focus:ring-blue-500" value={m.cost_per_tco2} onChange={(e) => { 
                    const copy = [...(measures || [])]; 
                    const pos = copy.findIndex(x => x.id === m.id); 
                    copy[pos] = { ...m, cost_per_tco2: Number(e.target.value) }; 
                    setMeasures(copy); 
                  }} />
                </td>
                <td className="p-2 text-right space-x-2">
                  <button
                    className="px-3 py-1 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 text-xs"
                    onClick={() => setEditingMeasure(m) || setWizardOpen(true)}
                  >
                    Edit Details
                  </button>
                  <button
                    className="px-3 py-1 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-xs"
                    onClick={() => setMeasures(measures.filter(x => x.id !== m.id))}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="p-3 text-center text-gray-500 italic">No measures found for the selected filter or firm.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-xs text-gray-500">
        CSV columns: id, name, sector, abatement_tco2, cost_per_tco2, selected, details.
      </div>
    </CollapsibleSection>
  );
}