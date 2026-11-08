// Data Processing + Congestion Detection
//   flow (veh/h)      = count * 3600 / interval
//   density (veh/km/lane) = flow / speed / lanes   (fundamental diagram q = k * v)
//   congestion score  = 0.45*occupancy + 0.35*speed loss + 0.20*queue pressure  (0..1)
const p = msg.payload;
const LEVELS = [
    { level: 'free', max: 0.30 },
    { level: 'moderate', max: 0.50 },
    { level: 'heavy', max: 0.70 },
    { level: 'severe', max: 1.01 }
];
const levelOf = s => LEVELS.find(l => s < l.max).level;
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const queueCapacity = p.lanes * 120 / 6.5; // vehicles that fit in the detection zone

let totalCount = 0, totalFlow = 0, speedWeighted = 0, occSum = 0, queueSum = 0, maxScore = 0;
p.approaches = p.approaches.map(a => {
    const flow = a.vehicleCount * 3600 / p.intervalSec;
    const speed = Math.max(a.avgSpeed, 1);
    const density = flow / speed / p.lanes;
    const speedLoss = Math.max(0, 1 - a.avgSpeed / p.freeFlowSpeed);
    const queuePressure = Math.min(1, a.queueLength / queueCapacity);
    let score = 0.45 * (a.occupancy / 100) + 0.35 * speedLoss + 0.20 * queuePressure;
    if (a.incident) score = Math.min(1, score + 0.1);
    score = round(Math.min(1, score), 3);

    totalCount += a.vehicleCount;
    totalFlow += flow;
    speedWeighted += a.avgSpeed * Math.max(a.vehicleCount, 1);
    occSum += a.occupancy;
    queueSum += a.queueLength;
    maxScore = Math.max(maxScore, score);

    return Object.assign({}, a, {
        flowVph: Math.round(flow),
        density: round(density),
        congestionScore: score,
        congestionLevel: levelOf(score)
    });
});

const weightSum = p.approaches.reduce((s, a) => s + Math.max(a.vehicleCount, 1), 0);
const avgScore = p.approaches.reduce((s, a) => s + a.congestionScore, 0) / p.approaches.length;
// intersection score leans towards the worst approach
const interScore = round(0.6 * maxScore + 0.4 * avgScore, 3);

p.summary = {
    vehicleCount: totalCount,
    flowVph: Math.round(totalFlow),
    avgSpeed: round(speedWeighted / weightSum),
    avgOccupancy: round(occSum / p.approaches.length),
    totalQueue: queueSum,
    density: round(p.approaches.reduce((s, a) => s + a.density, 0) / p.approaches.length),
    congestionScore: interScore,
    congestionLevel: levelOf(interScore),
    incidents: p.approaches.filter(a => a.incident).map(a => a.approach)
};

// Congestion alerting with hysteresis: alert when entering heavy/severe,
// clear when back to free/moderate. Avoids an alert every 5 seconds.
const key = 'level_' + p.intersectionId;
const prev = context.get(key) || 'free';
const curr = p.summary.congestionLevel;
const rank = { free: 0, moderate: 1, heavy: 2, severe: 3 };
p.alerts = [];
if (rank[curr] >= 2 && rank[curr] > rank[prev]) {
    p.alerts.push({
        type: 'congestion',
        severity: curr === 'severe' ? 'critical' : 'warning',
        message: `${curr === 'severe' ? 'Severe' : 'Heavy'} congestion at ${p.intersectionId} (score ${interScore}, avg speed ${p.summary.avgSpeed} km/h)`
    });
} else if (rank[curr] <= 1 && rank[prev] >= 2) {
    p.alerts.push({ type: 'congestion_cleared', severity: 'info', message: `Congestion cleared at ${p.intersectionId}` });
}
context.set(key, curr);

// incident alert (once per incident start)
const incKey = 'inc_' + p.intersectionId;
const prevInc = context.get(incKey) || [];
p.summary.incidents.filter(a => !prevInc.includes(a)).forEach(a => {
    p.alerts.push({ type: 'incident', severity: 'warning', message: `Possible incident on approach ${a} at ${p.intersectionId} (capacity drop detected)` });
});
context.set(incKey, p.summary.incidents);

msg.payload = p;
return msg;
