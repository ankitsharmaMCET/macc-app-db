import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import CollapsibleSection from '../ui/CollapsibleSection';
import { formatNumber } from '../../utils/dataHelpers';
import { UI_CLASSES } from '../../utils/constants';

export default function TimeseriesViewer({ inspected, setInspectedId, currency }) {
  const inspectedSeries = useMemo(() => {
    const per = inspected?.details?.per_year;
    const years = inspected?.details?.years;
    if (!per || !years) return null;
    return years.map((year, idx) => ({ 
      year, 
      direct_t: Number(per[idx]?.direct_t || 0), 
      net_cost_cr: Number(per[idx]?.net_cost_cr || 0), 
    }));
  }, [inspected]);

  if (!inspected || !inspectedSeries) return null;

  return (
    <section className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
      <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Measure Timeseries — {inspected.name}</h2>
        <button className={UI_CLASSES.SecondaryButton} onClick={() => setInspectedId(null)}>Close</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        {/* Abatement Chart */}
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={inspectedSeries} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="year" stroke="#4b5563" />
            <YAxis yAxisId="left" stroke="#4b5563" tickFormatter={(v) => formatNumber(v)} />
            <Tooltip formatter={(value) => formatNumber(value) + ' tCO₂'} />
            <Line yAxisId="left" type="monotone" dataKey="direct_t" name="Direct abatement (tCO₂)" stroke="#2f4b7c" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
        
        {/* Cost Chart */}
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={inspectedSeries} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="year" stroke="#4b5563" />
            <YAxis yAxisId="left" tickFormatter={(v) => `${currency} ${formatNumber(v)}`} stroke="#4b5563" />
            <Tooltip formatter={(value) => `${currency} ${formatNumber(value)} cr`} />
            <Line yAxisId="left" type="monotone" dataKey="net_cost_cr" name={`Net cost (${currency} cr)`} stroke="#ff9da7" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}