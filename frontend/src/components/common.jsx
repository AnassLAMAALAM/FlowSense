import { LEVELS, SEVERITY, fmt } from '../theme';

export function LevelBadge({ level }) {
  const l = LEVELS[level] || { label: 'No data', role: 'info', icon: '○' };
  return (
    <span className={`badge ${l.role}`}>
      <span className="ico" aria-hidden="true">{l.icon}</span>
      {l.label}
    </span>
  );
}

export function SeverityBadge({ severity }) {
  const s = SEVERITY[severity] || SEVERITY.info;
  return <span className={`badge ${s.role}`}>{s.label}</span>;
}

export function ModeBadge({ mode }) {
  const label = { adaptive: 'Adaptive', manual: 'Manual', emergency: 'Emergency pre-emption' }[mode] || 'Adaptive';
  return <span className={`badge mode ${mode || ''}`}>{label}</span>;
}

export function Kpi({ label, value, unit, sub, accent }) {
  return (
    <div className={`card kpi ${accent || ''}`}>
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

/** Signal plan visual: NS green | EW green | lost time (yellow + all-red) as one cycle. */
export function PhaseBar({ signal }) {
  if (!signal) return null;
  const lost = signal.cycleLength - signal.nsGreen - signal.ewGreen;
  const total = Math.max(signal.cycleLength, 1);
  const pct = (v) => `${(Math.max(v, 0) / total) * 100}%`;
  const fits = (v) => v / total >= 0.14; // only label segments wide enough for text
  return (
    <div className="phase" aria-label={`Cycle ${signal.cycleLength}s: north-south green ${signal.nsGreen}s, east-west green ${signal.ewGreen}s`}>
      <div className="bar">
        {signal.nsGreen > 0 && <div className="seg ns" style={{ width: pct(signal.nsGreen) }} title={`NS green ${signal.nsGreen}s`}>{fits(signal.nsGreen) ? `NS ${signal.nsGreen}s` : ''}</div>}
        {signal.ewGreen > 0 && <div className="seg ew" style={{ width: pct(signal.ewGreen) }} title={`EW green ${signal.ewGreen}s`}>{fits(signal.ewGreen) ? `EW ${signal.ewGreen}s` : ''}</div>}
        {lost > 0 && <div className="seg lost" style={{ width: pct(lost) }} title={`Yellow + all-red ${lost}s`}>{fits(lost) ? `${lost}s` : ''}</div>}
      </div>
      <div className="meta">
        <span>Cycle {signal.cycleLength}s · NS {signal.nsGreen}s / EW {signal.ewGreen}s{signal.preemptApproach ? ` · priority to ${signal.preemptApproach}` : ''}</span>
        <span>{signal.updatedAt ? `updated ${fmt.ago(signal.updatedAt)}` : ''}</span>
      </div>
    </div>
  );
}

export function StatusPill({ label, on }) {
  const cls = on === true ? 'on' : on === false ? 'off' : '';
  return (
    <span className="pill">
      <span className={`dot ${cls}`} />
      {label}
      <span style={{ color: 'var(--muted)' }}>{on === true ? 'online' : on === false ? 'offline' : '…'}</span>
    </span>
  );
}
