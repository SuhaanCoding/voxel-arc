

export const GRID_SIZE = 50;
export const MAX_INSTANCES = 500000;

export const DEFAULT_COLOR = "#4a90d9";

export function randomHexColor(): string {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export const COLOR_PALETTE = [
  // Neutrals 
  "#ffffff", "#9ca3af", "#4b5563", "#1e1e24", "#0a0a0f",
  // Reds / Pinks
  "#fecdd3", "#f43f5e", "#e11d48", "#ff0055", "#db2777",
  // Oranges / Yellows
  "#fdba74", "#f97316", "#ea580c", "#fef08a", "#eab308",
  // Greens / Teals
  "#86efac", "#22c55e", "#16a34a", "#2dd4bf", "#14b8a6",
  // Blues / Cyans
  "#7dd3fc", "#0ea5e9", "#0284c7", "#3b82f6", "#2563eb",
  // Purples / Deep Navy
  "#d8b4fe", "#a855f7", "#7e22ce", "#2e1065", "#1e3a8a",
];
