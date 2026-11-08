// Congestion level -> status role. Status colors are never used for series,
// and always appear with an icon + text label (never color alone).
export const LEVELS = {
  free: { label: 'Free flow', role: 'good', icon: '●' },
  moderate: { label: 'Moderate', role: 'warning', icon: '▲' },
  heavy: { label: 'Heavy', role: 'serious', icon: '◆' },
  severe: { label: 'Severe', role: 'critical', icon: '■' },
};
export const LEVEL_ORDER = ['free', 'moderate', 'heavy', 'severe'];

export const STATUS_HEX = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
};

export const SEVERITY = {
  info: { label: 'Info', role: 'info', icon: 'i' },
  warning: { label: 'Warning', role: 'warning', icon: '!' },
  critical: { label: 'Critical', role: 'critical', icon: '!!' },
};

export const fmt = {
  int: (v) => (v == null ? '—' : Math.round(v).toLocaleString()),
  one: (v) => (v == null ? '—' : Number(v).toFixed(1)),
  time: (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  hm: (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  ago: (d) => {
    const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    return `${Math.round(s / 3600)}h ago`;
  },
};
