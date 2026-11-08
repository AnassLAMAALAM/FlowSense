import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell,
} from 'recharts';
import { api } from '../api';
import { Kpi, SeverityBadge } from '../components/common';
import CongestionMap, { MapLegend } from '../components/CongestionMap';
import WeatherTile from '../components/WeatherTile';
import Gauge from '../components/Gauge';
import { LEVELS, STATUS_HEX, fmt } from '../theme';

const axis = { stroke: 'var(--axis)', tick: { fill: 'var(--muted)', fontSize: 11 }, tickLine: false };
const TYPE_LABEL = {
  congestion: 'Congestion', incident: 'Incident', emergency: 'Emergency vehicle', weather: 'Weather', system: 'Signal change',
};

function Tip({ active, payload, label, unit, digits = 0 }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="tooltip">
      <div className="t">{typeof label === 'number' ? fmt.time(label) : label}</div>
      <b>{typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: digits }) : v}</b> {unit}
    </div>
  );
}

const ttiStatus = (t) =>
  t == null ? ['—', 'info'] : t < 1.3 ? ['Free flowing', 'good'] : t < 1.6 ? ['Moderate', 'warning'] : t < 2 ? ['Heavy', 'serious'] : ['Congested', 'critical'];
const delayStatus = (d) =>
  d == null ? ['No data', 'good'] : d < 20 ? ['Low delay', 'good'] : d < 40 ? ['Moderate delay', 'warning'] : d < 60 ? ['High delay', 'serious'] : ['Severe delay', 'critical'];
const effStatus = (e) =>
  e == null ? ['No data', 'good'] : e >= 75 ? ['Optimised', 'good'] : e >= 60 ? ['Fair', 'warning'] : e >= 45 ? ['Degraded', 'serious'] : ['Poor', 'critical'];

export default function ControlRoom({ live }) {
  const { list, emergencies, alerts, weather, setWeather } = live;
  const [history, setHistory] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api.history({ minutes: 30, bucket: 60 })
        .then((rows) => alive && setHistory(rows.map((r) => ({ ...r, time: new Date(r.time).getTime() }))))
        .catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const m = useMemo(() => {
    const live = list.filter((i) => i.latest);
    const n = live.length || 1;
    const flow = live.reduce((s, i) => s + (i.latest.flowVph || 0), 0);
    const queue = live.reduce((s, i) => s + (i.latest.totalQueue || 0), 0);
    const speed = live.length ? live.reduce((s, i) => s + i.latest.avgSpeed, 0) / n : null;
    const tti = live.length ? live.reduce((s, i) => s + i.freeFlowSpeed / Math.max(i.latest.avgSpeed, 1), 0) / n : null;
    const eff = live.length ? (live.reduce((s, i) => s + Math.min(1, i.latest.avgSpeed / i.freeFlowSpeed), 0) / n) * 100 : null;
    // Little's law: average wait = vehicles waiting / arrival rate
    const delay = flow > 0 ? (queue / (flow / 3600)) : null;
    const modes = { adaptive: 0, manual: 0, emergency: 0 };
    list.forEach((i) => { if (i.signal?.mode in modes) modes[i.signal.mode]++; });
    return { live, flow, queue, speed, tti, eff, delay, modes };
  }, [list]);

  const names = Object.fromEntries(list.map((i) => [i.id, i.name]));
  const active = alerts.filter((a) => a.status === 'active');
  const critical = active.filter((a) => a.severity === 'critical').length;
  const hourAgo = Date.now() - 3600000;
  const lastHour = alerts.filter((a) => new Date(a.createdAt).getTime() > hourAgo);
  const acked = alerts.filter((a) => a.acknowledgedAt);
  const ackMin = acked.length
    ? acked.reduce((s, a) => s + (new Date(a.acknowledgedAt) - new Date(a.createdAt)), 0) / acked.length / 60000
    : null;

  const [ttiLabel, ttiRole] = ttiStatus(m.tti);
  const [delayLabel, delayRole] = delayStatus(m.delay);
  const [effLabel, effRole] = effStatus(m.eff);

  const speeds = [...m.live]
    .map((i) => ({ name: i.name, id: i.id, speed: +i.latest.avgSpeed.toFixed(1), level: i.latest.congestionLevel }))
    .sort((a, b) => a.speed - b.speed);
  const throughput = history.map((h) => ({ time: h.time, flow: Math.round(h.flowVph * Math.max(m.live.length, 1)) }));
  const evs = Object.entries(emergencies);

  return (
    <>
      {evs.map(([id, e]) => (
        <div className="banner" key={id} role="alert">
          <span className="siren" aria-hidden="true" />
          Emergency priority: {e.type?.replace('_', ' ')} {e.vehicleId} approaching {e.name} from {e.approach} — green given
        </div>
      ))}

      {/* Row 1 — KPIs + weather */}
      <section className="cr-kpis">
        <Kpi label="Average speed" value={fmt.one(m.speed)} unit="km/h" sub={`${m.live.length} of ${list.length} intersections reporting`} />
        <Kpi label="Traffic volume" value={fmt.int(m.flow)} unit="veh/h" sub={`${fmt.int(m.queue)} vehicles queued`} />
        <Kpi label="Active alerts" value={active.length} sub={critical ? `${critical} critical` : 'No critical alert'} accent={critical ? 'critical' : null} />
        <Kpi label="Travel time index" value={m.tti == null ? '—' : m.tti.toFixed(2)} sub={<span className={`status-text ${ttiRole}`}>{ttiLabel}</span>} />
        <WeatherTile weather={weather} onChange={setWeather} />
      </section>

      {/* Row 2 — map + incident summary */}
      <section className="cr-main">
        <div className="card panel">
          <div className="panel-head">
            <h3>Live traffic map</h3>
            <MapLegend />
          </div>
          <div className="cr-map">
            <CongestionMap list={list} emergencies={emergencies} />
          </div>
        </div>
        <div className="card panel">
          <div className="panel-head">
            <h3>Incident summary</h3>
            <span className="muted-small">{active.length} active</span>
          </div>
          <div className="incident-list">
            {active.slice(0, 8).map((a) => (
              <div className="incident" key={a._id}>
                <span className={`sev-bar ${a.severity}`} aria-hidden="true" />
                <div>
                  <div className="incident-title">{TYPE_LABEL[a.type] || a.type} · {a.intersectionId === 'NETWORK' ? 'City-wide' : names[a.intersectionId] || a.intersectionId}</div>
                  <div className="incident-msg">{a.message}</div>
                </div>
                <div className="incident-meta">
                  <SeverityBadge severity={a.severity} />
                  <span>{fmt.ago(a.createdAt)}</span>
                </div>
              </div>
            ))}
            {!active.length && <div className="empty">No active incidents</div>}
          </div>
        </div>
      </section>

      {/* Row 3 — trend, signal performance, throughput */}
      <section className="cr-row">
        <div className="card panel">
          <h3>Congestion trend</h3>
          <p className="desc">Average congestion score, last 30 min · dashed lines = heavy / severe thresholds</p>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={history} margin={{ top: 6, right: 10, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="time" tickFormatter={fmt.hm} minTickGap={40} {...axis} />
              <YAxis domain={[0, 1]} ticks={[0, 0.3, 0.5, 0.7, 1]} {...axis} axisLine={false} />
              <ReferenceLine y={0.5} stroke="var(--warning)" strokeDasharray="4 4" strokeOpacity={0.6} />
              <ReferenceLine y={0.7} stroke="var(--critical)" strokeDasharray="4 4" strokeOpacity={0.6} />
              <Tooltip content={<Tip unit="score" digits={2} />} cursor={{ stroke: 'var(--axis)' }} />
              <Line type="monotone" dataKey="congestion" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card panel">
          <h3>Signal performance</h3>
          <p className="desc">
            {m.modes.adaptive} adaptive · {m.modes.manual} manual · {m.modes.emergency} emergency
          </p>
          <div className="gauges">
            <Gauge label="Avg delay per vehicle" value={m.delay == null ? null : Math.round(m.delay)} max={90} unit="s" statusLabel={delayLabel} role={delayRole} />
            <Gauge label="Network efficiency" value={m.eff == null ? null : Math.round(m.eff)} max={100} unit="%" statusLabel={effLabel} role={effRole} />
          </div>
        </div>
        <div className="card panel">
          <h3>Roadway throughput</h3>
          <p className="desc">Network flow, vehicles per hour · last 30 min</p>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={throughput} margin={{ top: 6, right: 6, bottom: 0, left: -8 }} barCategoryGap={2}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="time" tickFormatter={fmt.hm} minTickGap={40} {...axis} />
              <YAxis {...axis} axisLine={false} width={52} />
              <Tooltip content={<Tip unit="veh/h" />} cursor={{ fill: 'var(--surface-2)' }} />
              <Bar dataKey="flow" fill="var(--series-1)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Row 4 — speed per intersection, response, network status */}
      <section className="cr-row">
        <div className="card panel">
          <h3>Average speed by intersection</h3>
          <p className="desc">km/h, slowest first · colour = congestion level</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={speeds} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 0 }} barCategoryGap={5}>
              <XAxis type="number" hide domain={[0, 'dataMax + 5']} />
              <YAxis type="category" dataKey="name" width={150} {...axis} axisLine={false} tick={{ fill: 'var(--text-2)', fontSize: 11 }} />
              <Tooltip content={<Tip unit="km/h" digits={1} />} cursor={{ fill: 'var(--surface-2)' }} />
              <Bar dataKey="speed" radius={[0, 4, 4, 0]} isAnimationActive={false}
                label={{ position: 'right', fill: 'var(--text-2)', fontSize: 11 }}>
                {speeds.map((s) => <Cell key={s.id} fill={STATUS_HEX[LEVELS[s.level]?.role] || '#8d8c86'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card panel">
          <h3>Incident response</h3>
          <p className="desc">Last hour</p>
          <div className="mini-stats">
            <div><b>{ackMin == null ? '—' : ackMin < 1 ? '<1' : Math.round(ackMin)}</b><span>min</span><small>Avg time to acknowledge</small></div>
            <div><b className={critical ? 'critical-text' : ''}>{critical}</b><span></span><small>Open critical alerts</small></div>
            <div><b>{lastHour.filter((a) => a.type === 'emergency').length}</b><span></span><small>Emergency vehicles</small></div>
            <div><b>{lastHour.filter((a) => a.type === 'incident').length}</b><span></span><small>Incidents detected</small></div>
          </div>
        </div>
        <div className="card panel">
          <h3>Network status</h3>
          <p className="desc">Intersections per congestion level, now</p>
          <div className="level-rows">
            {Object.entries(LEVELS).map(([k, l]) => {
              const count = m.live.filter((i) => i.latest.congestionLevel === k).length;
              return (
                <div className="level-row" key={k}>
                  <span className={`badge ${l.role}`}><span className="ico">{l.icon}</span>{l.label}</span>
                  <div className="level-track"><div style={{ width: `${(count / Math.max(list.length, 1)) * 100}%`, background: STATUS_HEX[l.role] }} /></div>
                  <b>{count}</b>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
