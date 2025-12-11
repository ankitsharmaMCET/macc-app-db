import React from 'react';

export default function HoverOverlay(props) {
  const { segments, maccRef, setHoverInfo, xAxisMap, yAxisMap, offset } = props;
  
  const xKey = xAxisMap ? Object.keys(xAxisMap)[0] : null;
  const yKey = yAxisMap ? Object.keys(yAxisMap)[0] : null;

  if (!xKey || !yKey) return null;

  const xScale = xAxisMap?.[xKey]?.scale;
  const yScale = yAxisMap?.[yKey]?.scale;
  
  if (!xScale || !yScale) return null;

  const offL = (offset && offset.left) || 0;
  const offT = (offset && offset.top) || 0;

  return (
    <g>
      {segments.map((s) => {
        const x1 = xScale(s.x1_plot) + offL;
        const x2 = xScale(s.x2_plot) + offL;
        const y0 = yScale(0) + offT;
        const yC = yScale(s.cost) + offT;

        const x = Math.min(x1, x2);
        const y = Math.min(y0, yC);
        const w = Math.max(1, Math.abs(x2 - x1));
        const h = Math.max(1, Math.abs(yC - y0));

        return (
          <rect
            key={`hover-${s.id}`}
            x={x}
            y={y}
            width={w}
            height={h}
            fill="rgba(0,0,0,0)" // Invisible overlay
            stroke="none"
            style={{ pointerEvents: 'all', cursor: 'pointer' }}
            onMouseEnter={(e) => {
              const rect = maccRef?.current?.getBoundingClientRect?.();
              const localX = e.clientX - ((rect && rect.left) || 0);
              const localY = e.clientY - ((rect && rect.top) || 0);
              setHoverInfo({ seg: s, x: localX + 10, y: localY + 10 });
            }}
            onMouseMove={(e) => {
              const rect = maccRef?.current?.getBoundingClientRect?.();
              const localX = e.clientX - ((rect && rect.left) || 0);
              const localY = e.clientY - ((rect && rect.top) || 0);
              setHoverInfo({ seg: s, x: localX + 10, y: localY + 10 });
            }}
            onMouseLeave={() => setHoverInfo(null)}
          />
        );
      })}
    </g>
  );
}