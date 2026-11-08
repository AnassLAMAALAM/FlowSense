// Signal Optimization (Webster's method) + manual override handling.
// Two-phase control: NS phase (approaches N,S) and EW phase (approaches E,W).
//   y_i = critical flow / saturation flow   (critical = busier approach in the phase, incl. queue)
//   C0  = (1.5 L + 5) / (1 - Y),  L = lost time per cycle, Y = sum(y_i)
//   g_i = (C0 - L) * y_i / Y
const p = msg.payload;
const SAT_FLOW = 1800;          // veh/h/lane
const LOST_PER_PHASE = 4;       // s (start-up + clearance)
const YELLOW = 3, ALL_RED = 2;
const MIN_GREEN = 10, MIN_CYCLE = 40, MAX_CYCLE = 150;
const round = v => Math.round(v);

const byApproach = {};
p.approaches.forEach(a => { byApproach[a.approach] = a; });
// demand = measured flow + queued vehicles that need to clear within ~ one cycle (90 s)
const demand = a => a ? a.flowVph + a.queueLength * 3600 / 90 : 0;
const nsCrit = Math.max(demand(byApproach.N), demand(byApproach.S));
const ewCrit = Math.max(demand(byApproach.E), demand(byApproach.W));
const cap = SAT_FLOW * p.lanes;
let yNS = Math.max(0.05, nsCrit / cap);
let yEW = Math.max(0.05, ewCrit / cap);
let Y = yNS + yEW;
const L = 2 * LOST_PER_PHASE;
if (Y > 0.9) { yNS = yNS / Y * 0.9; yEW = yEW / Y * 0.9; Y = 0.9; } // oversaturated: cap

let cycle = Math.min(MAX_CYCLE, Math.max(MIN_CYCLE, (1.5 * L + 5) / (1 - Y)));
let effGreen = cycle - L;
let nsGreen = Math.max(MIN_GREEN, effGreen * yNS / Y);
let ewGreen = Math.max(MIN_GREEN, effGreen * yEW / Y);
cycle = nsGreen + ewGreen + L;

// smooth changes so the plan doesn't jump every 5 s (exponential smoothing)
const key = 'plan_' + p.intersectionId;
const prev = context.get(key);
if (prev) {
    const a = 0.3;
    nsGreen = prev.nsGreen + a * (nsGreen - prev.nsGreen);
    ewGreen = prev.ewGreen + a * (ewGreen - prev.ewGreen);
    cycle = nsGreen + ewGreen + L;
}

let plan = {
    intersectionId: p.intersectionId,
    mode: 'adaptive',
    cycleLength: round(cycle),
    nsGreen: round(nsGreen),
    ewGreen: round(ewGreen),
    yellow: YELLOW,
    allRed: ALL_RED,
    preemptApproach: null,
    reason: 'webster',
    flowRatio: { ns: Math.round(yNS * 1000) / 1000, ew: Math.round(yEW * 1000) / 1000 }
};
context.set(key, { nsGreen, ewGreen });

// manual override (set from the dashboard via traffic/control/<id>)
const overrides = flow.get('overrides') || {};
const ov = overrides[p.intersectionId];
if (ov && ov.mode === 'manual') {
    plan = Object.assign(plan, {
        mode: 'manual',
        nsGreen: ov.nsGreen,
        ewGreen: ov.ewGreen,
        cycleLength: ov.nsGreen + ov.ewGreen + L,
        reason: 'manual-override'
    });
}

// detect significant plan change -> persist in signal history
const lastSent = context.get('sent_' + p.intersectionId);
plan.changed = !lastSent || lastSent.mode !== plan.mode ||
    Math.abs(lastSent.nsGreen - plan.nsGreen) >= 3 || Math.abs(lastSent.ewGreen - plan.ewGreen) >= 3;
if (plan.changed) context.set('sent_' + p.intersectionId, { mode: plan.mode, nsGreen: plan.nsGreen, ewGreen: plan.ewGreen });

p.signal = plan;
msg.payload = p;
return msg;
