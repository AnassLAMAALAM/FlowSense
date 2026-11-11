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
  { key: 'control', label: 'Control room', short: 'Live network', icon: 'grid', Comp: ControlRoom },
  { key: 'overview', label: 'Intersections', short: 'Junction status', icon: 'cross', Comp: Overview },
  { key: 'map', label: 'Congestion map', short: 'Spatial view', icon: 'map', Comp: MapView },
  { key: 'analytics', label: 'Analytics', short: 'Traffic insights', icon: 'chart', Comp: Analytics },
  { key: 'alerts', label: 'Alerts', short: 'Events & incidents', icon: 'bell', Comp: Alerts },
  { key: 'signals', label: 'Signal control', short: 'Adaptive timing', icon: 'signal', Comp: Signals },
];

function Icon({ name }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    cross: <><path d="M4 12h16M12 4v16"/><circle cx="12" cy="12" r="3"/></>,
    map: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z"/><path d="M8 3v15M16 6v15"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    signal: <><rect x="7" y="2" width="10" height="20" rx="4"/><circle cx="12" cy="7" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="17" r="1.7"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function App() {
  const live = useLiveTraffic();
  const [page, setPage] = useState('control');
  const [mobileNav, setMobileNav] = useState(false);
  const active = live.alerts.filter((a) => a.status === 'active').length;
  const current = PAGES.find((p) => p.key === page) || PAGES[0];
  const Page = current.Comp;
  const online = [live.status.ws, live.status.broker, live.status.nodeRed, live.status.simulator].filter(Boolean).length;

  const navigate = (key) => { setPage(key); setMobileNav(false); };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="brand brand-side">
          <div className="flow-logo" aria-hidden="true"><span /><span /><span /></div>
          <div><h1>FlowSense</h1><small>Urban mobility OS</small></div>
        </div>

        <div className="side-label">OPERATIONS</div>
        <nav className="side-nav" aria-label="Main navigation">
          {PAGES.map((p) => (
            <button key={p.key} className={page === p.key ? 'active' : ''} onClick={() => navigate(p.key)}>
              <Icon name={p.icon} />
              <span className="nav-copy"><b>{p.label}</b><small>{p.short}</small></span>
              {p.key === 'alerts' && active > 0 && <span className="count">{active}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="network-health">
            <div className="health-head"><span>System health</span><b>{online}/4</b></div>
            <div className="health-bar"><i style={{ width: `${online * 25}%` }} /></div>
            <small>{online === 4 ? 'All services operational' : 'Some services need attention'}</small>
          </div>
          <div className="operator"><span className="avatar">OP</span><span><b>Traffic operator</b><small>Jerez control centre</small></span><i className="online-dot" /></div>
        </div>
      </aside>
      {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}

      <div className="workspace">
        <header className="topbar topbar-new">
          <button className="menu-btn" onClick={() => setMobileNav((v) => !v)} aria-label="Toggle navigation"><Icon name="menu" /></button>
          <div className="page-title">
            <span className="eyebrow">FLOW MANAGEMENT</span>
            <h1>{current.label}</h1>
          </div>
          <div className="live-chip"><span className="pulse-dot" /> LIVE</div>
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
      </div>

      <div className="toasts" aria-live="polite">
        {live.toasts.map((t) => (
          <div key={t.toastId} className={`toast ${t.severity}`}>
            <b>{t.severity === 'critical' ? 'Critical' : 'Warning'}</b> · {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
