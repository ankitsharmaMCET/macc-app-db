import React from 'react';

export default function InfoTip({ text }) {
  return (
    <span className="relative group inline-block align-middle ml-1">
      <span
        className="inline-flex items-center justify-center w-4 h-4 text-[10px] rounded-full border border-gray-400 text-gray-600 hover:bg-gray-100 transition"
        aria-label="More info"
        title={text}
      >
        i
      </span>
    </span>
  );
}