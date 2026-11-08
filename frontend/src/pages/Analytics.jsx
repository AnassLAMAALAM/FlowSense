import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell,
} from 'recharts';
import { api } from '../api';
import { LEVELS, LEVEL_ORDER, STATUS_HEX, fmt } from '../theme';

const WINDOWS = [
  { label: '15 min', minutes: 15, bucket: 15 },
  { label: '1 h', minutes: 60, bucket: 60 },
  { label: '6 h', minutes: 360, bucket: 300 },
  { label: '24 h', minutes: 1440, bucket: 900 },
];

const axisProps = { stroke: 'var(--axis)', tick: { fill: 'var(--muted)', fontSize: 11 }, tickLine: false };

function ChartTip({ active, payload, label, unit, labelFmt = fmt.time }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip">
      <div className="t">{labelFmt(label)}</div>
      {payload.map((p) => (
        <div className="row" key={p.dataKey}>
          <span className="sw" style={{ background: p.color || p.payload.fill }} />
          <b>{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</b> {unit}
        </div>
      ))}
    </div>
  );
}

function TimeChart({ title, desc, data, dataKey, unit, color }) {
  return (
    <div className="card chart-card">
      <h3>{title}</h3>
      <p className="desc">{desc}</p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="time" tickFormatter={fmt.hm} minTickGap={40} {...axisProps} />
          <YAxis {...axisProps} axisLine={false} width={48} />
          <Tooltip content={<ChartTip unit={unit} />} cursor={{ stroke: 'var(--axis)' }} />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Analytics({ live }) {
  const [win, setWin] = useState(WINDOWS[1]);
  const [target, setTarget] = useState('');
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => {
      const params = { minutes: win.minutes, bucket: win.bucket };
      if (target) params.intersectionId = target;
      Promise.all([api.history(params), api.summary(win.minutes)])
        .then(([h, s]) => {
          if (!alive) return;
          setHistory(h.map((r) => ({ ...r, time: new Date(r.time).getTime() })));
          setSummary(s);
          setError('');
        })
        .catch((e) => alive && setError(e.message));
    };
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [win, target]);

  // Average congestion per intersection, sorted worst-first; bar colour = status of its level
  const perInt = (summary?.intersections || [])
    .map((r) => {
      const s = r.avgCongestion;
      const level = s < 0.3 ? 'free' : s < 0.5 ? 'moderate' : s < 0.7 ? 'heavy' : 'severe';
      return { ...r, level, label: r.intersectionId };
    })
    .sort((a, b) => b.avgCongestion - a.avgCongestion);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Traffic analytics</h2>
          <p>Aggregated from stored readings in MongoDB · refreshes every 15 s</p>
        </div>
        <div className="controls">
          <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Intersection">
            <option value="">All intersections</option>
            {live.list.map((i) => <option key={i.id} value={i.id}>{i.id} · {i.name}</option>)}
          </select>
          <div className="seg-ctl" role="group" aria-label="Time window">
            {WINDOWS.map((w) => (
              <button key={w.label} className={w === win ? 'active' : ''} onClick={() => setWin(w)}>{w.label}</button>
            ))}
          </div>
        </div>
      </div>
      {error && <div className="error">{error}</div>}

      <section className="grid two">
        <TimeChart title="Traffic flow" desc="Vehicles per hour (average per intersection)" data={history} dataKey="flowVph" unit="veh/h" color="var(--series-1)" />
        <TimeChart title="Average speed" desc="km/h — drops as congestion builds" data={history} dataKey="avgSpeed" unit="km/h" color="var(--series-1)" />
        <TimeChart title="Road occupancy" desc="Share of detection zone occupied, %" data={history} dataKey="occupancy" unit="%" color="var(--series-1)" />

        <div className="card chart-card">
          <h3>Average congestion by intersection</h3>
          <p className="desc">Score 0–1 over the selected window, worst first</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={perInt} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }} barCategoryGap={6}>
              <CartesianGrid stroke="var(--grid)" horizontal={false} />
              <XAxis type="number" domain={[0, 1]} {...axisProps} />
              <YAxis type="category" dataKey="label" width={64} {...axisProps} axisLine={false} />
              <Tooltip content={<ChartTip labelFmt={(l) => `${l} · ${perInt.find((p) => p.label === l)?.name || ''}`} unit="score" />} cursor={{ fill: 'var(--surface-2)' }} />
              <Bar dataKey="avgCongestion" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {perInt.map((r) => <Cell key={r.label} fill={STATUS_HEX[LEVELS[r.level].role]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {summary && (
        <section className="grid two">
          <div className="card chart-card">
            <h3>Time spent at each congestion level</h3>
            <p className="desc">Share of all readings in the window</p>
            <div className="stack" role="img" aria-label={summary.levelDistribution.map((d) => `${LEVELS[d.level].label} ${d.share}%`).join(', ')}>
              {summary.levelDistribution.filter((d) => d.share > 0).map((d) => (
                <div key={d.level} title={`${LEVELS[d.level].label}: ${d.share}%`}
                  style={{ width: `${d.share}%`, background: STATUS_HEX[LEVELS[d.level].role], color: d.level === 'moderate' ? '#0b0b0b' : '#fff' }}>
                  {d.share >= 8 ? `${d.share}%` : ''}
                </div>
              ))}
            </div>
            <div className="legend" style={{ marginTop: 10 }}>
              {LEVEL_ORDER.map((l) => {
                const d = summary.levelDistribution.find((x) => x.level === l);
                return <span key={l}><i style={{ background: STATUS_HEX[LEVELS[l].role] }} />{LEVELS[l].icon} {LEVELS[l].label} {d?.share ?? 0}%</span>;
              })}
            </div>
          </div>

          <div className="card chart-card">
            <h3>Window summary</h3>
            <p className="desc">Last {win.label}</p>
            <table className="data-table">
              <tbody>
                <tr><td>Vehicles counted</td><td>{fmt.int(summary.network.totalVehicles)}</td></tr>
                <tr><td>Emergency vehicle detections</td><td>{summary.network.emergencyDetections}</td></tr>
                <tr><td>Congestion alerts</td><td>{summary.alertsByType.congestion || 0}</td></tr>
                <tr><td>Incident alerts</td><td>{summary.alertsByType.incident || 0}</td></tr>
                <tr><td>Emergency alerts</td><td>{summary.alertsByType.emergency || 0}</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Intersection table</h3>
        <table className="data-table">
          <thead>
            <tr><th>Intersection</th><th>Avg flow (veh/h)</th><th>Avg speed (km/h)</th><th>Avg congestion</th><th>Max queue</th><th>Vehicles</th></tr>
          </thead>
          <tbody>
            {perInt.map((r) => (
              <tr key={r.intersectionId}>
                <td>{r.intersectionId} · {r.name}</td>
                <td>{fmt.int(r.avgFlowVph)}</td>
                <td>{fmt.one(r.avgSpeed)}</td>
                <td>{r.avgCongestion.toFixed(2)} ({LEVELS[r.level].label})</td>
                <td>{r.maxQueue}</td>
                <td>{fmt.int(r.vehicles)}</td>
              </tr>
            ))}
            {!perInt.length && <tr><td colSpan={6} className="empty">No readings in this window yet</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
