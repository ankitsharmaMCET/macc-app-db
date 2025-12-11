import React from 'react';
import InfoTip from '../ui/InfoTip';
import { UI_CLASSES } from '../../utils/constants';

// Extracts the repeated SeriesRow pattern from MeasureWizard
export default function MeasureWizardSeriesRow({ label, unit, series, onChange, onInterpolate, help, years }) {
  const colTemplate = `minmax(190px,1fr) 80px repeat(${years.length}, minmax(96px,1fr)) ${onInterpolate ? "max-content" : ""}`.trim();

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        <div
          className="grid gap-2 items-start"
          style={{ gridTemplateColumns: colTemplate }}
        >
          {/* Label + help */}
          <div className="text-sm font-medium flex items-center text-gray-700">
            {label} {help ? <InfoTip text={help} /> : null}
          </div>
          {/* Unit */}
          <div className="text-xs text-gray-500 whitespace-nowrap self-center">
            {unit}
          </div>
          {/* Yearly inputs with the year shown above each field */}
          {years.map((y, i) => (
            <div key={y} className="flex flex-col">
              <div className="text-[10px] text-gray-500 leading-3 mb-0.5">{y}</div>
              <input
                type="text"
                inputMode="decimal"
                className="border border-gray-300 rounded-lg px-2 py-1 text-right focus:ring-blue-500 focus:border-blue-500 transition duration-150 text-sm"
                value={series[i] ?? ""}
                aria-label={`${label} — ${y} (${unit})`}
                onChange={(e) => onChange(i, e.target.value)}
              />
            </div>
          ))}
          {/* Interpolate (optional) */}
          {onInterpolate && (
            <button
              type="button"
              className={`${UI_CLASSES.SecondaryButton.replace('px-3 py-2', 'px-3 py-1.5')} text-xs border-gray-300 hover:bg-gray-50 whitespace-nowrap self-end mb-0.5`}
              onClick={onInterpolate}
              title="Fill missing years linearly between the nearest filled cells"
            >
              Interpolate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}