// Data Validation — reject malformed readings, clamp out-of-range values,
// drop stale or duplicate messages.
const p = msg.payload;
const errors = [];

if (!p || typeof p !== 'object') {
    node.warn('Invalid payload (not JSON object)');
    return [null, { payload: { reason: 'not-an-object', raw: msg.payload, topic: msg.topic } }];
}
if (typeof p.intersectionId !== 'string' || !/^INT-\d{3}$/.test(p.intersectionId)) errors.push('intersectionId');
if (!Array.isArray(p.approaches) || p.approaches.length === 0) errors.push('approaches');
const ts = Date.parse(p.timestamp);
if (isNaN(ts)) errors.push('timestamp');
else if (Math.abs(Date.now() - ts) > 5 * 60 * 1000) errors.push('timestamp-stale');

if (errors.length) {
    return [null, { payload: { reason: 'invalid-fields', fields: errors, intersectionId: p.intersectionId, topic: msg.topic } }];
}

// duplicate / out-of-order protection per sensor
const seqKey = 'seq_' + p.intersectionId;
const lastSeq = context.get(seqKey) || 0;
if (typeof p.seq === 'number' && p.seq <= lastSeq && p.seq > 5) {
    return [null, { payload: { reason: 'duplicate-or-out-of-order', seq: p.seq, lastSeq, intersectionId: p.intersectionId } }];
}
if (typeof p.seq === 'number') context.set(seqKey, p.seq);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));
const VALID_APPROACHES = ['N', 'S', 'E', 'W'];
let clamped = 0;
p.approaches = p.approaches
    .filter(a => a && VALID_APPROACHES.includes(a.approach))
    .map(a => {
        const out = {
            approach: a.approach,
            vehicleCount: Math.round(clamp(a.vehicleCount, 0, 5000)),
            avgSpeed: clamp(a.avgSpeed, 0, 200),
            occupancy: clamp(a.occupancy, 0, 100),
            queueLength: Math.round(clamp(a.queueLength, 0, 1000)),
            incident: !!a.incident
        };
        if (out.vehicleCount !== a.vehicleCount || out.avgSpeed !== a.avgSpeed || out.occupancy !== a.occupancy) clamped++;
        return out;
    });

if (p.approaches.length === 0) {
    return [null, { payload: { reason: 'no-valid-approaches', intersectionId: p.intersectionId } }];
}

p.lanes = clamp(p.lanes || 2, 1, 6);
p.freeFlowSpeed = clamp(p.freeFlowSpeed || 50, 20, 130);
p.intervalSec = clamp(p.intervalSec || 5, 1, 3600);
p.vehicles = Array.isArray(p.vehicles) ? p.vehicles : [];
p.emergency = p.emergency && p.emergency.detected ? p.emergency : { detected: false };
p.validation = { ok: true, clampedFields: clamped, receivedAt: new Date().toISOString() };

msg.payload = p;
return [msg, null];
