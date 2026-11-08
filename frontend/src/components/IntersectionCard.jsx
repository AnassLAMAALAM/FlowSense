import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { LevelBadge, ModeBadge, PhaseBar } from './common';
import { fmt } from '../theme';

export default function IntersectionCard({ item, series = [], emergency }) {
  const l = item.latest;
  return (
    <article className={`card icard ${emergency ? 'emergency' : ''}`}>
      <header>
        <div>
          <h3>{item.name}</h3>
          <div className="id">
            {item.id} · {item.lanes} lanes · {item.freeFlowSpeed} km/h limit
          </div>
        </div>
        <LevelBadge level={l?.congestionLevel} />
      </header>

      {emergency && (
        <div className="badge critical" style={{ justifySelf: 'start' }}>
          {emergency.type?.replace('_', ' ')} from {emergency.approach} · {emergency.distanceM} m
        </div>
      )}

      <div className="metrics">
        <div className="metric"><span>Flow</span><b>{fmt.int(l?.flowVph)}</b> <small>veh/h</small></div>
        <div className="metric"><span>Avg speed</span><b>{fmt.one(l?.avgSpeed)}</b> <small>km/h</small></div>
        <div className="metric"><span>Occupancy</span><b>{fmt.one(l?.avgOccupancy)}</b> <small>%</small></div>
        <div className="metric"><span>Queue</span><b>{fmt.int(l?.totalQueue)}</b> <small>veh</small></div>
      </div>

      {series.length > 1 && (
        <div aria-label="Congestion score, last few minutes" title="Congestion score, live">
          <ResponsiveContainer width="100%" height={36}>
            <LineChart data={series} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
              <YAxis hide domain={[0, 1]} />
              <Line type="monotone" dataKey="score" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {l?.approaches && (
        <table className="approaches">
          <thead>
            <tr><th>Approach</th><th>Count</th><th>km/h</th><th>Occ %</th><th>Queue</th><th>Density</th></tr>
          </thead>
          <tbody>
            {l.approaches.map((a) => (
              <tr key={a.approach}>
                <td>
                  {a.approach}
                  {a.incident && <span className="incident-tag" title="Incident: capacity drop detected" aria-label="incident">⚠</span>}
                </td>
                <td>{a.vehicleCount}</td>
                <td>{fmt.one(a.avgSpeed)}</td>
                <td>{fmt.one(a.occupancy)}</td>
                <td>{a.queueLength}</td>
                <td>{fmt.one(a.density)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>Signal plan</h3>
        <ModeBadge mode={item.signal?.mode} />
      </div>
      <PhaseBar signal={item.signal} />
      {!l && <div className="empty">Waiting for sensor data…</div>}
      {l && <div className="id">Last reading {fmt.time(l.timestamp)}</div>}
    </article>
  );
}
