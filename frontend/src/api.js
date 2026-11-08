const BASE = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  health: () => request('/health'),
  intersections: () => request('/intersections'),
  history: (params) => request(`/traffic/history?${new URLSearchParams(params)}`),
  summary: (minutes) => request(`/analytics/summary?minutes=${minutes}`),
  alerts: (params = {}) => request(`/alerts?${new URLSearchParams(params)}`),
  ackAlert: (id) => request(`/alerts/${id}/ack`, { method: 'PATCH', body: { user: 'operator' } }),
  ackAll: () => request('/alerts/ack-all', { method: 'POST', body: { user: 'operator' } }),
  signalHistory: (id) => request(`/signals/${id}/history?limit=15`),
  setSignal: (id, body) => request(`/signals/${id}`, { method: 'PUT', body }),
  vehicles: (params = {}) => request(`/vehicles?${new URLSearchParams(params)}`),
  weather: (hours = 24) => request(`/weather?hours=${hours}`),
  simulateWeather: (condition) => request('/weather/simulate', { method: 'POST', body: { condition } }),
};

export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined; // same origin by default
