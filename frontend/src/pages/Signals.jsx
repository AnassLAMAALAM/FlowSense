import { useEffect, useState } from 'react';
import { api } from '../api';
import { LevelBadge, ModeBadge, PhaseBar } from '../components/common';
import { fmt } from '../theme';

function SignalCard({ item }) {
  const sig = item.signal || {};
  const [ns, setNs] = useState(sig.nsGreen || 40);
  const [ew, setEw] = useState(sig.ewGreen || 40);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [history, setHistory] = useState([]);
  const manual = sig.mode === 'manual';

  useEffect(() => {
    api.signalHistory(item.id).then(setHistory).catch(() => {});
  }, [item.id, sig.mode, sig.nsGreen, sig.ewGreen]);

  const send = async (body) => {
    setBusy(true);
    setMsg(null);
    try {
      await api.setSignal(item.id, body);
      setMsg({ ok: true, text: body.mode === 'manual' ? `Manual plan sent: NS ${ns}s / EW ${ew}s` : 'Adaptive control restored' });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card icard">
      <header>
        <div>
          <h3>{item.name}</h3>
          <div className="id">{item.id} · {fmt.int(item.latest?.flowVph)} veh/h · queue {fmt.int(item.latest?.totalQueue)}</div>
        </div>
        <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
          <ModeBadge mode={sig.mode} />
          <LevelBadge level={item.latest?.congestionLevel} />
        </div>
      </header>
      <PhaseBar signal={sig} />
      {sig.reason && <div className="id">Reason: {sig.reason}</div>}

      <div style={{ display: 'grid', gap: 6 }}>
        <label className="slider">
          <span>NS green</span>
          <input type="range" min="10" max="120" value={ns} onChange={(e) => setNs(+e.target.value)} />
          <output>{ns}s</output>
        </label>
        <label className="slider">
          <span>EW green</span>
          <input type="range" min="10" max="120" value={ew} onChange={(e) => setEw(+e.target.value)} />
          <output>{ew}s</output>
        </label>
        <div className="id">Resulting cycle {ns + ew + 8}s (incl. yellow + all-red)</div>
      </div>

      <div className="controls">
        <button className="btn primary" disabled={busy || sig.mode === 'emergency'} onClick={() => send({ mode: 'manual', nsGreen: ns, ewGreen: ew })}>
          {manual ? 'Update manual plan' : 'Apply manual plan'}
        </button>
        <button className="btn" disabled={busy || !manual} onClick={() => send({ mode: 'adaptive' })}>Return to adaptive</button>
      </div>
      {sig.mode === 'emergency' && <div className="error">Emergency pre-emption active — manual changes are locked until the vehicle clears.</div>}
      {msg && <div className={msg.ok ? 'ok' : 'error'}>{msg.text}</div>}

      <div>
        <h3 style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500, marginBottom: 4 }}>Recent plan changes</h3>
        <div className="history">
          {history.map((h) => (
            <div key={h._id}>{fmt.time(h.timestamp)} · {h.mode} · NS {h.nsGreen}s / EW {h.ewGreen}s · {h.reason}</div>
          ))}
          {!history.length && <div>No changes recorded yet</div>}
        </div>
      </div>
    </article>
  );
}

export default function Signals({ live }) {
  return (
    <>
      <div className="section-head">
        <div>
          <h2>Traffic signal control</h2>
          <p>Adaptive plans come from Node-RED (Webster's method). A manual plan overrides it until you return to adaptive.</p>
        </div>
      </div>
      <section className="grid cards">
        {live.list.map((i) => <SignalCard key={i.id} item={i} />)}
      </section>
    </>
  );
}
