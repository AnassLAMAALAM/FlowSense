import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, Polyline, useMap } from 'react-leaflet';
import { LEVELS, LEVEL_ORDER, STATUS_HEX, fmt } from '../theme';

const colorOf = (level) => STATUS_HEX[LEVELS[level]?.role] || '#8d8c86';

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 16, { duration: 0.6 });
  }, [target, map]);
  return null;
}

/** Road segments between neighbouring intersections of the grid, coloured by the worse end. */
function roadSegments(list) {
  const pts = list.filter((i) => i.location);
  const segs = [];
  for (let a = 0; a < pts.length; a++) {
    for (let b = a + 1; b < pts.length; b++) {
      const A = pts[a].location;
      const B = pts[b].location;
      const sameRow = Math.abs(A.lat - B.lat) < 1e-4 && Math.abs(A.lng - B.lng) < 0.0065;
      const sameCol = Math.abs(A.lng - B.lng) < 1e-4 && Math.abs(A.lat - B.lat) < 0.006;
      if (sameRow || sameCol) {
        const la = LEVEL_ORDER.indexOf(pts[a].latest?.congestionLevel);
        const lb = LEVEL_ORDER.indexOf(pts[b].latest?.congestionLevel);
        segs.push({ key: `${pts[a].id}-${pts[b].id}`, positions: [[A.lat, A.lng], [B.lat, B.lng]], level: LEVEL_ORDER[Math.max(la, lb)] });
      }
    }
  }
  return segs;
}

export function MapLegend() {
  return (
    <div className="legend">
      {LEVEL_ORDER.map((l) => (
        <span key={l}>
          <i style={{ background: STATUS_HEX[LEVELS[l].role] }} />
          {LEVELS[l].label}
        </span>
      ))}
      <span>
        <i style={{ background: 'transparent', border: '2px solid var(--critical)' }} />
        Emergency vehicle
      </span>
    </div>
  );
}

/** Live congestion map of the intersections. Basemap: OpenTopoMap (free, no API key, max zoom 17).
 *  To go back to dark OpenStreetMap: url https://tile.openstreetmap.org/{z}/{x}/{y}.png + className="dark-tiles". */
export default function CongestionMap({ list, emergencies = {}, selected, onSelect, zoom = 16 }) {
  const located = list.filter((i) => i.location);
  if (!located.length) return <div className="empty">Loading map…</div>;
  const center = [
    located.reduce((s, i) => s + i.location.lat, 0) / located.length,
    located.reduce((s, i) => s + i.location.lng, 0) / located.length,
  ];
  return (
    <MapContainer center={center} zoom={zoom} maxZoom={17} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
      <TileLayer
        attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
        url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
        subdomains="abc"
        maxZoom={17}
      />
      {roadSegments(located).map((s) => (
        <Polyline key={s.key} positions={s.positions} pathOptions={{ color: colorOf(s.level), weight: 7, opacity: 0.8 }} />
      ))}
      {located.map((i) => {
        const ev = emergencies[i.id];
        const q = i.latest?.totalQueue || 0;
        return (
          <CircleMarker
            key={i.id}
            center={[i.location.lat, i.location.lng]}
            radius={9 + Math.min(14, q / 8)}
            pathOptions={{
              color: ev ? '#d03b3b' : '#181b21',
              weight: ev ? 4 : 2,
              fillColor: colorOf(i.latest?.congestionLevel),
              fillOpacity: 0.95,
            }}
            eventHandlers={{ click: () => onSelect && onSelect(i.id) }}
          >
            <Tooltip direction="top" offset={[0, -8]}>{i.name}</Tooltip>
            <Popup>
              <strong>{i.name}</strong> ({i.id})<br />
              Level: {LEVELS[i.latest?.congestionLevel]?.label || '—'}<br />
              Flow {fmt.int(i.latest?.flowVph)} veh/h · {fmt.one(i.latest?.avgSpeed)} km/h<br />
              Queue {fmt.int(q)} veh · occupancy {fmt.one(i.latest?.avgOccupancy)}%<br />
              Signal: {i.signal?.mode} · NS {i.signal?.nsGreen}s / EW {i.signal?.ewGreen}s
              {ev && (
                <>
                  <br />
                  <b style={{ color: '#d03b3b' }}>Emergency: {ev.type?.replace('_', ' ')} from {ev.approach}</b>
                </>
              )}
            </Popup>
          </CircleMarker>
        );
      })}
      <FlyTo target={located.find((i) => i.id === selected)?.location} />
    </MapContainer>
  );
}
