import { Kpi } from '../components/common';
import IntersectionCard from '../components/IntersectionCard';
import { fmt } from '../theme';

export default function Overview({ live }) {
  const { list, series, emergencies, alerts } = live;
  const withData = list.filter((i) => i.latest);
  const flow = withData.reduce((s, i) => s + (i.latest.flowVph || 0), 0);
  const speed = withData.length ? withData.reduce((s, i) => s + i.latest.avgSpeed, 0) / withData.length : null;
  const congested = withData.filter((i) => ['heavy', 'severe'].includes(i.latest.congestionLevel)).length;
  const queue = withData.reduce((s, i) => s + (i.latest.totalQueue || 0), 0);
  const activeAlerts = alerts.filter((a) => a.status === 'active').length;
  const evs = Object.entries(emergencies);

  return (
    <>
      {evs.map(([id, e]) => (
        <div className="banner" key={id} role="alert">
          <span className="siren" aria-hidden="true" />
          Emergency vehicle priority: {e.type?.replace('_', ' ')} {e.vehicleId} approaching {e.name} ({id}) from {e.approach} — green pre-empted
        </div>
      ))}

      <section className="grid kpis">
        <Kpi label="Network flow" value={fmt.int(flow)} unit="veh/h" sub={`${withData.length} of ${list.length} intersections reporting`} />
        <Kpi label="Average speed" value={fmt.one(speed)} unit="km/h" sub="Mean across intersections" />
        <Kpi label="Congested intersections" value={congested} unit={`/ ${list.length}`} sub="Heavy or severe right now" />
        <Kpi label="Vehicles queued" value={fmt.int(queue)} unit="veh" sub="All approaches" />
        <Kpi label="Active alerts" value={activeAlerts} sub={evs.length ? `${evs.length} emergency in progress` : 'No emergency in progress'} />
      </section>

      <div className="section-head">
        <div>
          <h2>Live intersections</h2>
          <p>Updated in real time over WebSocket every sensor interval</p>
        </div>
      </div>
      <section className="grid cards">
        {list.map((i) => (
          <IntersectionCard key={i.id} item={i} series={series[i.id]} emergency={emergencies[i.id]} />
        ))}
        {!list.length && <div className="empty card">Connecting to backend…</div>}
      </section>
    </>
  );
}
