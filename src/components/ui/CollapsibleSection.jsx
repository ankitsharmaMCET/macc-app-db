import React from 'react';
import useLocalStorage from '../../hooks/useLocalStorage';

// Note: Using text chevrons for simplicity, recommend replacing with SVG icons in a real app
const ChevronIcon = ({ open }) => (
  <svg className={`w-4 h-4 transition-transform duration-200 ${open ? 'transform rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
  </svg>
);

export default function CollapsibleSection({ title, storageKey, defaultOpen = true, headerRight = null, children }) {
  const [open, setOpen] = useLocalStorage(storageKey, defaultOpen);

  return (
    <section className="bg-white rounded-xl shadow-lg border border-gray-100">
      <div className="flex items-center justify-between p-4 sm:p-6 cursor-pointer" onClick={() => setOpen(!open)}>
        <button type="button" className="flex items-center gap-3 text-left focus:outline-none" aria-expanded={open} aria-controls={storageKey}>
          <ChevronIcon open={open} />
          <span className="text-lg font-semibold text-gray-800">{title}</span>
        </button>
        <div className="flex items-center gap-2">{headerRight}</div>
      </div>
      {open && (
        <div id={storageKey} className="px-4 sm:px-6 pb-6 pt-2 border-t border-gray-100">
          {children}
        </div>
      )}
    </section>
  );
}