export const YEARS = [2025, 2030, 2035, 2040, 2045, 2050];
export const BASE_YEAR = YEARS[0];

export const DEFAULT_SECTORS = [];
export const DEFAULT_BASELINES = {};

export const PALETTE = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc949", "#af7aa1", "#ff9da7", "#9c755f", "#bab0ab",
  "#2f4b7c", "#ffa600", "#a05195", "#003f5c", "#d45087",
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"
];

// UI Classnames (Centralized for consistency, only basic classes here)
export const UI_CLASSES = {
  Input: "mt-1 border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out",
  Select: "border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white cursor-pointer transition duration-150 ease-in-out",
  PrimaryButton: "px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white shadow-md transition duration-150 ease-in-out",
  SecondaryButton: "px-3 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 transition duration-150 ease-in-out",
  ActiveToggle: 'bg-blue-600 text-white shadow-md hover:bg-blue-700',
  InactiveToggle: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
};