// Weather service: current conditions from Open-Meteo (free, no API key).
//   - polls every WEATHER_INTERVAL_MIN minutes for the configured city (default Jerez de la Frontera)
//   - stores each reading in MongoDB (WeatherReading)
//   - publishes { condition, ... } on MQTT traffic/weather (retained) -> the sensor simulator adapts traffic
//   - pushes "weather:update" over Socket.IO -> dashboard
//   - raises a city-wide alert when conditions become dangerous (heavy rain, fog, storm) and when they clear
const { WeatherReading, Alert } = require('../models');
const realtime = require('../realtime');
const mqttClient = require('../mqttClient');
const { weather: cfg } = require('../config');

const API = 'https://api.open-meteo.com/v1/forecast';
const DANGEROUS = { heavy_rain: 'Heavy rain', fog: 'Fog / low visibility', storm: 'Thunderstorm' };

// WMO weather interpretation codes -> description + FlowSense condition
const WMO = {
  0: ['Clear sky', 'clear'], 1: ['Mainly clear', 'clear'], 2: ['Partly cloudy', 'cloudy'], 3: ['Overcast', 'cloudy'],
  45: ['Fog', 'fog'], 48: ['Depositing rime fog', 'fog'],
  51: ['Light drizzle', 'rain'], 53: ['Moderate drizzle', 'rain'], 55: ['Dense drizzle', 'rain'],
  56: ['Light freezing drizzle', 'rain'], 57: ['Dense freezing drizzle', 'rain'],
  61: ['Slight rain', 'rain'], 63: ['Moderate rain', 'rain'], 65: ['Heavy rain', 'heavy_rain'],
  66: ['Light freezing rain', 'rain'], 67: ['Heavy freezing rain', 'heavy_rain'],
  71: ['Slight snowfall', 'rain'], 73: ['Moderate snowfall', 'heavy_rain'], 75: ['Heavy snowfall', 'heavy_rain'], 77: ['Snow grains', 'rain'],
  80: ['Slight rain showers', 'rain'], 81: ['Moderate rain showers', 'rain'], 82: ['Violent rain showers', 'heavy_rain'],
  85: ['Slight snow showers', 'rain'], 86: ['Heavy snow showers', 'heavy_rain'],
  95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm with slight hail', 'storm'], 97: ['Heavy thunderstorm', 'storm'], 99: ['Thunderstorm with heavy hail', 'storm'],
};

let latest = null;
let timer = null;

/** Convert an Open-Meteo response into a FlowSense weather reading. Exported for tests. */
function fromOpenMeteo(json) {
  const c = (json && json.current) || {};
  if (typeof c.weather_code !== 'number' || typeof c.temperature_2m !== 'number') {
    throw new Error('unexpected Open-Meteo response (missing current.weather_code / temperature_2m)');
  }
  let [description, condition] = WMO[c.weather_code] || ['Unknown', 'cloudy'];
  // very intense precipitation counts as heavy rain whatever the code says
  if (typeof c.precipitation === 'number' && c.precipitation >= 4 && condition === 'rain') condition = 'heavy_rain';
  return {
    timestamp: c.time ? new Date(c.time + (json.utc_offset_seconds === 0 ? 'Z' : '')) : new Date(),
    city: cfg.city,
    condition,
    description,
    weatherCode: c.weather_code,
    temperatureC: c.temperature_2m,
    humidity: c.relative_humidity_2m,
    precipitationMm: c.precipitation,
    windKmh: c.wind_speed_10m,
    isDay: c.is_day === undefined ? undefined : c.is_day === 1,
    source: 'open-meteo',
  };
}

async function fetchCurrent() {
  const params = new URLSearchParams({
    latitude: cfg.lat,
    longitude: cfg.lon,
    current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,is_day',
    timezone: 'GMT',
    wind_speed_unit: 'kmh',
  });
  const res = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  return fromOpenMeteo(await res.json());
}

/** Store, publish and announce a reading (from the API or set manually for demos). */
async function apply(reading) {
  const previous = latest;
  const doc = await WeatherReading.create(reading);
  latest = doc.toObject();

  mqttClient.publish('traffic/weather', { condition: latest.condition, temperatureC: latest.temperatureC, description: latest.description }, { retain: true });
  realtime.emit('weather:update', latest);

  const was = previous && previous.condition;
  const now = latest.condition;
  if (DANGEROUS[now] && was !== now) {
    const alert = await Alert.create({
      intersectionId: 'NETWORK', type: 'weather', severity: now === 'storm' ? 'critical' : 'warning',
      message: `Weather alert: ${DANGEROUS[now]} in ${cfg.city} (${latest.temperatureC} °C) — expect slower traffic`,
    });
    realtime.emit('alert:new', alert.toObject());
  } else if (DANGEROUS[was] && !DANGEROUS[now]) {
    await Alert.updateMany({ type: 'weather', status: { $ne: 'resolved' } }, { $set: { status: 'resolved' } });
    const alert = await Alert.create({
      intersectionId: 'NETWORK', type: 'weather_cleared', severity: 'info', status: 'resolved',
      message: `Weather improved in ${cfg.city}: ${latest.description}`,
    });
    realtime.emit('alert:new', alert.toObject());
  }
  return latest;
}

async function refresh() {
  try {
    const reading = await fetchCurrent();
    await apply(reading);
    console.log(`[weather] ${cfg.city}: ${reading.description}, ${reading.temperatureC} °C -> ${reading.condition}`);
  } catch (err) {
    console.warn(`[weather] update failed: ${err.message} (keeping last known weather)`);
  }
}

async function start() {
  latest = await WeatherReading.findOne().sort({ timestamp: -1 }).lean();
  if (!cfg.enabled) {
    console.log('[weather] disabled (WEATHER_ENABLED=false)');
    return;
  }
  await refresh();
  timer = setInterval(refresh, cfg.intervalMin * 60 * 1000);
}

function stop() {
  if (timer) clearInterval(timer);
}

module.exports = { start, stop, refresh, apply, fromOpenMeteo, getLatest: () => latest, CONDITIONS: Object.keys(DANGEROUS).concat(['clear', 'cloudy', 'rain']) };
