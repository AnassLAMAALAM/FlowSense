import { useState } from 'react';
import { api } from '../api';
import { SeverityBadge } from '../components/common';
import { fmt } from '../theme';

const FILTERS = ['active', 'acknowledged', 'resolved', 'all'];
const TYPE_LABEL = {
  congestion: 'Congestion', congestion_cleared: 'Congestion cleared', incident: 'Incident',
  emergency: 'Emergency vehicle', emergency_cleared: 'Emergency cleared', system: 'Signal change',
  weather: 'Weather', weather_cleared: 'Weather improved',
};

export default function Alerts({ live }) {
  const { alerts, setAlerts } = live;
  const [filter, setFilter] = useState('active');
  const [error, setError] = useState('');
  const shown = alerts.filter((a) => filter === 'all' || a.status === filter);

  const ack = async (a) => {
    try {
      const updated = await api.ackAlert(a._id);
      setAlerts((prev) => prev.map((x) => (x._id === updated._id ? updated : x)));
    } catch (e) { setError(e.message); }
  };
  const ackAll = async () => {
    try {
      await api.ackAll();
      live.reloadAlerts();
    } catch (e) { setError(e.message); }
  };

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Alerts</h2>
          <p>Congestion, incidents and emergency vehicles — new alerts arrive live</p>
        </div>
        <div className="controls">
          <div className="seg-ctl" role="group" aria-label="Status filter">
            {FILTERS.map((f) => (
              <button key={f} className={f === filter ? 'active' : ''} onClick={() => setFilter(f)}>
                {f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <button className="btn" onClick={ackAll} disabled={!alerts.some((a) => a.status === 'active')}>Acknowledge all</button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="alert-list">
        {shown.map((a) => (
          <div key={a._id} className={`card alert-row ${a.status !== 'active' ? 'dim' : ''}`}>
            <SeverityBadge severity={a.severity} />
            <div>
              <div className="msg">{a.message}</div>
              <div className="meta">
                {TYPE_LABEL[a.type] || a.type} · {a.intersectionId === 'NETWORK' ? 'City-wide' : a.intersectionId} · {fmt.time(a.createdAt)} ({fmt.ago(a.createdAt)}) · {a.status}
                {a.acknowledgedBy ? ` by ${a.acknowledgedBy}` : ''}
              </div>
            </div>
            {a.status === 'active' ? <button className="btn" onClick={() => ack(a)}>Acknowledge</button> : <span />}
          </div>
        ))}
        {!shown.length && <div className="card empty">No {filter === 'all' ? '' : filter} alerts</div>}
      </div>
    </>
  );
}
