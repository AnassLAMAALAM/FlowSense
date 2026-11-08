/**
 * Semicircle gauge. `value` is drawn on a 0..max track; `role` picks the status colour
 * (good / warning / serious / critical) and the text label always states the status too.
 */
const ROLE_HEX = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };

export default function Gauge({ value, max, unit, label, statusLabel, role = 'good' }) {
  const r = 52;
  const cx = 64;
  const cy = 64;
  const frac = Math.max(0, Math.min(1, (value ?? 0) / max));
  const angle = Math.PI * (1 - frac);
  const x = cx + r * Math.cos(angle);
  const y = cy - r * Math.sin(angle);
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
  return (
    <div className="gauge">
      <svg viewBox="0 0 128 74" width="100%" role="img" aria-label={`${label}: ${value == null ? 'no data' : value} ${unit}, ${statusLabel}`}>
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="var(--grid)" strokeWidth="10" strokeLinecap="round" />
        {value != null && frac > 0 && (
          <path d={arc} fill="none" stroke={ROLE_HEX[role]} strokeWidth="10" strokeLinecap="round" />
        )}
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="22" fontWeight="600" fill="var(--text)">
          {value == null ? '—' : value}
          <tspan fontSize="11" fill="var(--muted)" fontWeight="400"> {unit}</tspan>
        </text>
      </svg>
      <div className="gauge-label">{label}</div>
      <div className={`gauge-status ${role}`}>{statusLabel}</div>
    </div>
  );
}
