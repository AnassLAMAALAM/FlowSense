// Manual control commands from the dashboard (published by the backend on
// traffic/control/<intersectionId>). Stored in flow context and applied by the
// Signal Optimization node on the next reading.
const c = msg.payload || {};
const id = (msg.topic || '').split('/').pop();
if (!/^INT-\d{3}$/.test(id)) return null;
const overrides = flow.get('overrides') || {};
if (c.mode === 'manual') {
    const g = v => Math.min(120, Math.max(10, Math.round(Number(v) || 0)));
    overrides[id] = { mode: 'manual', nsGreen: g(c.nsGreen), ewGreen: g(c.ewGreen), at: Date.now() };
} else {
    delete overrides[id];
}
flow.set('overrides', overrides);
node.status({ fill: Object.keys(overrides).length ? 'yellow' : 'green', shape: 'dot', text: `${Object.keys(overrides).length} manual override(s)` });
return null;
