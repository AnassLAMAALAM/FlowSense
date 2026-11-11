import { useState } from 'react';
import { useLiveTraffic } from './useLiveTraffic';
import { StatusPill } from './components/common';
import ControlRoom from './pages/ControlRoom';
import Overview from './pages/Overview';
import MapView from './pages/MapView';
import Analytics from './pages/Analytics';
import Alerts from './pages/Alerts';
import Signals from './pages/Signals';

const PAGES = [
  { key: 'control', label: 'Control room', Comp: ControlRoom },
  { key: 'overview', label: 'Intersections', Comp: Overview },
  { key: 'map', label: 'Congestion map', Comp: MapView },
  { key: 'analytics', label: 'Analytics', Comp: Analytics },
  { key: 'alerts', label: 'Alerts', Comp: Alerts },
  { key: 'signals', label: 'Signal control', Comp: Signals },
];

export default function App() {
  const live = useLiveTraffic();
  const [page, setPage] = useState('control');
  const active = live.alerts.filter((a) => a.status === 'active').length;
  const Page = PAGES.find((p) => p.key === page).Comp;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="lamp" aria-hidden="true">
            <i style={{ background: 'var(--critical)' }} />
            <i style={{ background: 'var(--warning)' }} />
            <i style={{ background: 'var(--good)' }} />
          </div>
          <h1>FlowSense<small>Smart traffic management · IoT</small></h1>
        </div>
        <nav className="nav">
          {PAGES.map((p) => (
            <button key={p.key} className={page === p.key ? 'active' : ''} onClick={() => setPage(p.key)}>
              {p.label}
              {p.key === 'alerts' && active > 0 && <span className="count">{active}</span>}
            </button>
          ))}
        </nav>
        <div className="status-row">
          <StatusPill label="WebSocket" on={live.status.ws} />
          <StatusPill label="MQTT" on={live.status.broker} />
          <StatusPill label="Node-RED" on={live.status.nodeRed} />
          <StatusPill label="Sensors" on={live.status.simulator} />
        </div>
      </header>

      <main>
        <Page live={live} />
      </main>

      <div className="toasts" aria-live="polite">
        {live.toasts.map((t) => (
          <div key={t.toastId} className={`toast ${t.severity}`}>
            <b>{t.severity === 'critical' ? 'Critical' : 'Warning'}</b> · {t.message}
          </div>
        ))}
      </div>
    </>
  );
}
