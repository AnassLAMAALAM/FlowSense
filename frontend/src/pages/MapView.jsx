import { useState } from 'react';
import CongestionMap, { MapLegend } from '../components/CongestionMap';
import { LevelBadge, ModeBadge } from '../components/common';
import { fmt } from '../theme';

export default function MapView({ live }) {
  const { list, emergencies } = live;
  const [selected, setSelected] = useState(null);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Congestion map · Jerez de la Frontera</h2>
          <p>Marker size grows with the queue · road colour shows the worse of its two intersections</p>
        </div>
        <MapLegend />
      </div>
      <div className="map-wrap">
        <div className="map">
          <CongestionMap list={list} emergencies={emergencies} selected={selected} onSelect={setSelected} />
        </div>
        <div className="map-list">
          {list.map((i) => (
            <button key={i.id} className={`map-item ${selected === i.id ? 'sel' : ''}`} onClick={() => setSelected(i.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <b>{i.name}</b>
                <LevelBadge level={i.latest?.congestionLevel} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {fmt.int(i.latest?.flowVph)} veh/h · {fmt.one(i.latest?.avgSpeed)} km/h · queue {fmt.int(i.latest?.totalQueue)}
              </span>
              <span>
                <ModeBadge mode={i.signal?.mode} />
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
