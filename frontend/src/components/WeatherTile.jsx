import { useState } from 'react';
import { api } from '../api';
import { fmt } from '../theme';

const LABEL = {
  clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', heavy_rain: 'Heavy rain', fog: 'Fog', storm: 'Storm',
};
const IMPACT = {
  clear: 'No impact on traffic', cloudy: 'No impact on traffic', rain: 'Speeds ~12 % lower',
  heavy_rain: 'Speeds ~25 % lower', fog: 'Low visibility, speeds ~30 % lower', storm: 'Severe impact on traffic',
};
const DANGER = ['heavy_rain', 'fog', 'storm'];

/** Simple flat weather glyphs (sun, cloud, rain, fog, storm). */
export function WeatherIcon({ condition, isDay = true, size = 52 }) {
  const cloud = <path d="M18 40h26a9 9 0 0 0 0-18 13 13 0 0 0-25-2 10 10 0 0 0-1 20z" fill="#c3c2b7" />;
  const darkCloud = <path d="M18 38h26a9 9 0 0 0 0-18 13 13 0 0 0-25-2 10 10 0 0 0-1 20z" fill="#6b6f78" />;
  const sun = isDay ? (
    <g>
      <circle cx="24" cy="22" r="9" fill="#fab219" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line key={a} x1={24 + 13 * Math.cos((a * Math.PI) / 180)} y1={22 + 13 * Math.sin((a * Math.PI) / 180)}
          x2={24 + 17 * Math.cos((a * Math.PI) / 180)} y2={22 + 17 * Math.sin((a * Math.PI) / 180)}
          stroke="#fab219" strokeWidth="2.5" strokeLinecap="round" />
      ))}
    </g>
  ) : <path d="M30 10a13 13 0 1 0 10 22 11 11 0 0 1-10-22z" fill="#c3c2b7" />;
  const drops = (n, len) => Array.from({ length: n }, (_, i) => (
    <line key={i} x1={20 + i * 8} y1="44" x2={17 + i * 8} y2={44 + len} stroke="#3987e5" strokeWidth="2.5" strokeLinecap="round" />
  ));
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" aria-hidden="true">
      {condition === 'clear' && <g transform="translate(6,8)">{sun}</g>}
      {condition === 'cloudy' && <>{isDay && <g transform="translate(10,0) scale(.8)">{sun}</g>}{cloud}</>}
      {condition === 'rain' && <>{cloud}{drops(3, 7)}</>}
      {condition === 'heavy_rain' && <>{darkCloud}{drops(4, 11)}</>}
      {condition === 'fog' && (
        <>
          {cloud}
          {[44, 50, 56].map((y, i) => <line key={y} x1={10 + i * 3} y1={y} x2={50 - i * 3} y2={y} stroke="#8d8c86" strokeWidth="2.5" strokeLinecap="round" />)}
        </>
      )}
      {condition === 'storm' && (
        <>
          {darkCloud}
          <path d="M30 40l-6 10h6l-4 9 11-13h-6l4-6z" fill="#fab219" />
        </>
      )}
      {!LABEL[condition] && cloud}
    </svg>
  );
}

/** Weather tile: current Jerez weather from Open-Meteo + a demo control to simulate conditions. */
export default function WeatherTile({ weather, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const c = weather?.condition;

  const simulate = async (condition) => {
    if (!condition) return;
    setBusy(true);
    setError('');
    try {
      onChange && onChange(await api.simulateWeather(condition));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`card kpi weather ${DANGER.includes(c) ? 'danger' : ''}`}>
      <div className="label">Weather · {weather?.city || 'Jerez de la Frontera'}</div>
      {weather ? (
        <div className="weather-main">
          <WeatherIcon condition={c} isDay={weather.isDay !== false} />
          <div>
            <div className="value">{fmt.one(weather.temperatureC)}<span className="unit">°C</span></div>
            <div className="sub">{weather.description}</div>
          </div>
        </div>
      ) : (
        <div className="sub" style={{ marginTop: 8 }}>Waiting for Open-Meteo…</div>
      )}
      {weather && (
        <div className="sub">
          {DANGER.includes(c) && <b style={{ color: 'var(--serious)' }}>▲ </b>}
          {IMPACT[c]}
          {weather.windKmh != null && ` · wind ${Math.round(weather.windKmh)} km/h`}
          {weather.humidity != null && ` · ${weather.humidity}% hum.`}
        </div>
      )}
      <label className="weather-demo">
        <span>Demo</span>
        <select value="" disabled={busy} onChange={(e) => simulate(e.target.value)} aria-label="Simulate weather">
          <option value="">Simulate weather…</option>
          {Object.entries(LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
