import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, SOCKET_URL } from './api';

const MAX_POINTS = 60; // rolling live window per intersection (sparklines)

/**
 * Central live-data hook: loads initial state over REST, then keeps it fresh
 * with Socket.IO (WebSocket) events from the backend.
 */
export function useLiveTraffic() {
  const [intersections, setIntersections] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [status, setStatus] = useState({ ws: false });
  const [emergencies, setEmergencies] = useState({});
  const [toasts, setToasts] = useState([]);
  const [weather, setWeather] = useState(null);
  const seriesRef = useRef({});
  const [seriesTick, setSeriesTick] = useState(0);

  const pushToast = useCallback((alert) => {
    const id = alert._id || Math.random().toString(36);
    setToasts((t) => [...t.slice(-3), { ...alert, toastId: id }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.toastId !== id)), 6000);
  }, []);

  const reloadAlerts = useCallback(() => api.alerts({ limit: 100 }).then(setAlerts).catch(() => {}), []);

  useEffect(() => {
    api.intersections()
      .then((rows) => setIntersections(Object.fromEntries(rows.map((r) => [r.id, r]))))
      .catch(() => {});
    reloadAlerts();
    api.health().then((h) => setStatus((s) => ({ ...s, ...h }))).catch(() => {});
    api.weather(1).then((w) => w.current && setWeather(w.current)).catch(() => {});

    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => setStatus((s) => ({ ...s, ws: true })));
    socket.on('disconnect', () => setStatus((s) => ({ ...s, ws: false })));
    socket.on('system:status', (st) => setStatus((s) => ({ ...s, ...st })));

    socket.on('traffic:update', (u) => {
      setIntersections((prev) => {
        const cur = prev[u.intersectionId] || { id: u.intersectionId, name: u.name, location: u.location };
        const { signal, intersectionId, name, location, ...latest } = u;
        return { ...prev, [intersectionId]: { ...cur, latest, signal: signal || cur.signal } };
      });
      const s = (seriesRef.current[u.intersectionId] ||= []);
      s.push({ t: new Date(u.timestamp).getTime(), flow: u.flowVph, speed: u.avgSpeed, score: u.congestionScore });
      if (s.length > MAX_POINTS) s.shift();
      setSeriesTick((n) => n + 1);
      setEmergencies((e) => {
        if (u.emergency) return { ...e, [u.intersectionId]: { ...u.emergency, name: u.name, at: Date.now() } };
        if (e[u.intersectionId]) {
          const { [u.intersectionId]: _gone, ...rest } = e;
          return rest;
        }
        return e;
      });
    });

    socket.on('signal:update', (sig) =>
      setIntersections((prev) => (prev[sig._id] ? { ...prev, [sig._id]: { ...prev[sig._id], signal: sig } } : prev))
    );

    socket.on('alert:new', (a) => {
      setAlerts((prev) => [a, ...prev].slice(0, 200));
      if (a.severity !== 'info') pushToast(a);
    });
    socket.on('alert:updated', (a) => setAlerts((prev) => prev.map((x) => (x._id === a._id ? a : x))));
    socket.on('alert:bulk', reloadAlerts);
    socket.on('weather:update', setWeather);

    return () => socket.disconnect();
  }, [pushToast, reloadAlerts]);

  return {
    intersections,
    list: Object.values(intersections).sort((a, b) => a.id.localeCompare(b.id)),
    alerts,
    setAlerts,
    status,
    emergencies,
    toasts,
    weather,
    setWeather,
    series: seriesRef.current,
    seriesTick,
    reloadAlerts,
  };
}
