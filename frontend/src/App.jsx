// Step 1 - dashboard skeleton: shows that every part of the system is connected.
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

function Status({ label, on, detail }) {
  return (
    <div className="status">
      <span className={`dot ${on ? 'on' : 'off'}`} />
      <b>{label}</b>
      <span className="muted">{on ? 'online' : 'waiting…'}{detail ? ` · ${detail}` : ''}</span>
    </div>
  );
}

export default function App() {
  const [ws, setWs] = useState(false);
  const [health, setHealth] = useState({});

  useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then(setHealth).catch(() => {});
    const socket = io({ transports: ['websocket', 'polling'] });
    socket.on('connect', () => setWs(true));
    socket.on('disconnect', () => setWs(false));
    socket.on('system:status', (s) => setHealth((h) => ({ ...h, ...s })));
    return () => socket.disconnect();
  }, []);

  const lastSensor = health.lastSensorMessage ? new Date(health.lastSensorMessage).toLocaleTimeString() : null;

  return (
    <main>
      <h1>Smart Traffic Control Center</h1>
      <p className="muted">Step 1 — system skeleton. Live monitoring, map, analytics, alerts and signal control come next.</p>
      <section className="card">
        <Status label="Backend API" on={health.status === 'ok'} />
        <Status label="MongoDB" on={health.mongo} />
        <Status label="WebSocket (Socket.IO)" on={ws} />
        <Status label="MQTT broker" on={health.broker} />
        <Status label="Node-RED" on={health.nodeRed} />
        <Status label="Sensors" on={!!lastSensor} detail={lastSensor && `last reading ${lastSensor}`} />
      </section>
    </main>
  );
}
