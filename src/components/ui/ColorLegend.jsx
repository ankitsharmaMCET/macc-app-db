import React from 'react';

export default function ColorLegend({ items, max = 30 }) {
  const shown = (items || []).slice(0, max);
  const extra = Math.max(0, (items || []).length - shown.length);

  return (
    <div className="flex flex-wrap gap-3 text-xs mt-4 items-center max-h-24 overflow-y-auto">
      {shown.map((s) => (
        <div key={s.id} className="flex items-center gap-2">
          <span style={{ background: s.color, width: 12, height: 12, display: 'inline-block', borderRadius: 2 }} />
          <span>{s.name}</span>
        </div>
      ))}
      {extra > 0 && <span className="text-gray-500">+{extra} more</span>}
    </div>
  );
}