/* Data manipulation and I/O helpers */

export function formatNumber(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  const n = Number(x);
  if (!Number.isFinite(n)) return String(x);

  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + "k";
  return n.toFixed(2);
}

export function csvToJson(text) {
  const clean = (text || "").replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((ln) => ln.trim().length > 0);
  if (lines.length === 0) return [];
  
  const parseLine = (line) => {
    const result = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result.map((s) => s.trim());
  };

  const headers = parseLine(lines.shift());
  return lines.map((line) => {
    const cells = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => obj[h] = cells[i] !== undefined ? cells[i] : "");

    // RESILIENCE FIX for 'details' field
    if (obj.details) {
      try {
        const detailString = (obj.details || "").trim();
        if (detailString.length > 1 && (detailString.startsWith('{') || detailString.startsWith('['))) {
          obj.details = JSON.parse(detailString);
        } else {
          obj.details = null;
        }
      } catch (e) {
        console.warn("Skipping malformed JSON in 'details' field:", obj.details, e);
        obj.details = null;
      }
    }
    return obj;
  });
}

export function jsonToCsv(arr) {
  if (!arr || arr.length === 0) return "";

  const processedArr = arr.map(row => {
    const newRow = { ...row };
    // Stringify 'details' field for CSV export
    if (newRow.details) newRow.details = JSON.stringify(newRow.details);
    return newRow;
  });

  const headers = Object.keys(processedArr[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  const headerLine = headers.map(esc).join(",");
  const body = processedArr.map((row) => headers.map((h) => esc(row[h])).join(",")).join("\n");
  
  return headerLine + "\n" + body;
}

export function saveBlob(filename, mime, text) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function saveFile(filename, text) {
  saveBlob(filename, "application/json", text);
}

export async function exportContainerSvgToPng(containerEl, filename = "macc.png", scale = 2) {
  if (!containerEl) return;
  const svg = containerEl.querySelector("svg");
  if (!svg) return;

  const xml = new XMLSerializer().serializeToString(svg);
  // Ensure correct encoding for base64 SVG (unescape is deprecated but necessary for older browser compatibility, keeping the original logic structure)
  const svg64 = btoa(unescape(encodeURIComponent(xml))); 
  const image64 = "data:image/svg+xml;base64," + svg64;

  const img = new Image();
  let bbox = { width: svg.clientWidth, height: svg.clientHeight };
  try {
    // Attempt to get BBox for accurate sizing if available
    if (svg.getBBox) bbox = svg.getBBox();
  } catch {}

  const width = Math.ceil((bbox.width || svg.clientWidth || 800) * scale);
  const height = Math.ceil((bbox.height || svg.clientHeight || 360) * scale);

  await new Promise((resolve) => {
    img.onload = resolve;
    img.src = image64;
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // Fill background white
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });
}