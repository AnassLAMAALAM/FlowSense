// Emergency Detection — pre-empt the signal to give green to the emergency
// vehicle's approach, raise a critical alert once per vehicle, and restore
// normal operation when the vehicle has passed.
const p = msg.payload;
const e = p.emergency;
const key = 'ev_' + p.intersectionId;
const active = context.get(key);

if (e && e.detected) {
    const phase = (e.approach === 'N' || e.approach === 'S') ? 'NS' : 'EW';
    p.signal = Object.assign({}, p.signal, {
        mode: 'emergency',
        preemptApproach: e.approach,
        nsGreen: phase === 'NS' ? 60 : 0,
        ewGreen: phase === 'EW' ? 60 : 0,
        cycleLength: 60 + 8,
        reason: `emergency-preemption:${e.type}`,
        changed: !active || active.vehicleId !== e.vehicleId
    });
    p.priority = 'high';
    if (!active || active.vehicleId !== e.vehicleId) {
        p.alerts = (p.alerts || []).concat([{
            type: 'emergency',
            severity: 'critical',
            message: `${e.type.replace('_', ' ')} ${e.vehicleId} approaching ${p.intersectionId} from ${e.approach} — signal pre-empted (${phase} green)`
        }]);
        context.set(key, { vehicleId: e.vehicleId, since: Date.now() });
    }
} else if (active) {
    p.alerts = (p.alerts || []).concat([{
        type: 'emergency_cleared',
        severity: 'info',
        message: `Emergency vehicle ${active.vehicleId} cleared ${p.intersectionId} — resuming ${p.signal.mode} control`
    }]);
    p.signal.changed = true;
    context.set(key, null);
}

// Output 1: full processed record -> backend
// Output 2: signal plan -> MQTT traffic/signals/<id> (retained)
const signalMsg = { topic: 'traffic/signals/' + p.intersectionId, payload: p.signal, retain: true, qos: 1 };
msg.payload = p;
return [msg, signalMsg];
