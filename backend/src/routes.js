const express = require('express');
const mongoose = require('mongoose');
const { Intersection, VehicleRecord, Alert, SignalConfig, SignalHistory, WeatherReading, LEVELS } = require('./models');
const weather = require('./services/weather');
const { ingest, validateIngest } = require('./services/ingest');
const { trafficHistory, perIntersectionStats, levelDistribution, alertCountsByType } = require('./services/aggregations');
const mqttClient = require('./mqttClient');
const realtime = require('./realtime');
const { ingestToken } = require('./config');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const intParam = (v, def, min, max) => Math.min(max, Math.max(min, Number.parseInt(v, 10) || def));
const ID_RE = /^INT-\d{3}$/;

// ---------- health ----------
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    mongo: mongoose.connection.readyState === 1,
    websocketClients: realtime.clients(),
    ...mqttClient.getStatus(),
    weather: weather.getLatest() ? weather.getLatest().condition : null,
  });
});

// ---------- weather (Open-Meteo, Jerez de la Frontera) ----------
router.get(
  '/weather',
  wrap(async (req, res) => {
    const hours = intParam(req.query.hours, 24, 1, 24 * 30);
    const history = await WeatherReading.find({ timestamp: { $gte: new Date(Date.now() - hours * 3600000) } })
      .sort({ timestamp: 1 })
      .lean();
    res.json({ current: weather.getLatest(), history });
  })
);

/**
 * POST /api/weather/simulate { "condition": "heavy_rain" }
 * Demo helper: overrides the weather until the next Open-Meteo update (every 10 min).
 * Conditions: clear | cloudy | rain | heavy_rain | fog | storm
 */
router.post(
  '/weather/simulate',
  wrap(async (req, res) => {
    const condition = req.body && req.body.condition;
    const presets = {
      clear: ['Clear sky (simulated)', 0], cloudy: ['Overcast (simulated)', 3], rain: ['Moderate rain (simulated)', 63],
      heavy_rain: ['Heavy rain (simulated)', 65], fog: ['Fog (simulated)', 45], storm: ['Thunderstorm (simulated)', 95],
    };
    if (!presets[condition]) return res.status(400).json({ error: `condition must be one of: ${Object.keys(presets).join(', ')}` });
    const base = weather.getLatest() || {};
    const reading = await weather.apply({
      timestamp: new Date(), city: base.city || 'Jerez de la Frontera', condition,
      description: presets[condition][0], weatherCode: presets[condition][1],
      temperatureC: base.temperatureC ?? 18, humidity: base.humidity, precipitationMm: condition.includes('rain') ? 6 : 0,
      windKmh: base.windKmh, isDay: base.isDay, source: 'manual',
    });
    res.json(reading);
  })
);

// ---------- ingestion (called by Node-RED) ----------
router.post(
  '/ingest',
  wrap(async (req, res) => {
    if (req.get('x-ingest-token') !== ingestToken) return res.status(401).json({ error: 'invalid ingest token' });
    const problem = validateIngest(req.body);
    if (problem) return res.status(400).json({ error: problem });
    const result = await ingest(req.body);
    res.status(201).json(result);
  })
);

// ---------- intersections ----------
router.get(
  '/intersections',
  wrap(async (req, res) => {
    const [intersections, signals] = await Promise.all([
      Intersection.find().sort({ _id: 1 }).lean(),
      SignalConfig.find().lean(),
    ]);
    const sig = Object.fromEntries(signals.map((s) => [s._id, s]));
    res.json(intersections.map((i) => ({ ...i, id: i._id, signal: sig[i._id] || null })));
  })
);

router.get(
  '/intersections/:id',
  wrap(async (req, res) => {
    const i = await Intersection.findById(req.params.id).lean();
    if (!i) return res.status(404).json({ error: 'intersection not found' });
    const [signal, alerts] = await Promise.all([
      SignalConfig.findById(i._id).lean(),
      Alert.find({ intersectionId: i._id }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);
    res.json({ ...i, id: i._id, signal, recentAlerts: alerts });
  })
);

// ---------- traffic history (time-bucketed) ----------
router.get(
  '/traffic/history',
  wrap(async (req, res) => {
    const minutes = intParam(req.query.minutes, 30, 1, 60 * 24 * 7);
    const bucketSec = intParam(req.query.bucket, 30, 5, 3600);
    const match = { timestamp: { $gte: new Date(Date.now() - minutes * 60000) } };
    if (req.query.intersectionId) match.intersectionId = String(req.query.intersectionId);

    const rows = await trafficHistory(match, bucketSec, req.query.split === 'intersection');
    res.json(
      rows.map((r) => ({
        time: r.t,
        intersectionId: r.i,
        flowVph: Math.round(r.flowVph),
        avgSpeed: +r.avgSpeed.toFixed(1),
        occupancy: +r.occupancy.toFixed(1),
        density: +r.density.toFixed(1),
        queue: Math.round(r.queue),
        congestion: +r.congestion.toFixed(3),
        vehicles: r.vehicles,
      }))
    );
  })
);

// ---------- analytics ----------
router.get(
  '/analytics/summary',
  wrap(async (req, res) => {
    const minutes = intParam(req.query.minutes, 60, 1, 60 * 24 * 7);
    const since = new Date(Date.now() - minutes * 60000);

    const [perIntersection, levelDist, alertCounts, emergencies, activeAlerts, intersections] = await Promise.all([
      perIntersectionStats(since),
      levelDistribution(since),
      alertCountsByType(since),
      VehicleRecord.countDocuments({ isEmergency: true, timestamp: { $gte: since } }),
      Alert.countDocuments({ status: 'active' }),
      Intersection.find().lean(),
    ]);

    const names = Object.fromEntries(intersections.map((i) => [i._id, i.name]));
    const totalReadings = levelDist.reduce((s, l) => s + l.count, 0) || 1;
    const live = intersections.filter((i) => i.latest && i.latest.timestamp);
    res.json({
      windowMinutes: minutes,
      network: {
        totalVehicles: perIntersection.reduce((s, r) => s + r.vehicles, 0),
        currentFlowVph: live.reduce((s, i) => s + (i.latest.flowVph || 0), 0),
        currentAvgSpeed: live.length ? +(live.reduce((s, i) => s + i.latest.avgSpeed, 0) / live.length).toFixed(1) : null,
        congestedNow: live.filter((i) => ['heavy', 'severe'].includes(i.latest.congestionLevel)).length,
        activeAlerts,
        emergencyDetections: emergencies,
      },
      levelDistribution: LEVELS.map((l) => ({
        level: l,
        share: +(((levelDist.find((d) => d._id === l) || { count: 0 }).count / totalReadings) * 100).toFixed(1),
      })),
      alertsByType: Object.fromEntries(alertCounts.map((a) => [a._id, a.count])),
      intersections: perIntersection.map((r) => ({
        intersectionId: r._id,
        name: names[r._id],
        avgFlowVph: Math.round(r.avgFlow),
        avgSpeed: +r.avgSpeed.toFixed(1),
        avgCongestion: +r.avgCongestion.toFixed(3),
        maxQueue: r.maxQueue,
        vehicles: r.vehicles,
      })),
    });
  })
);

// ---------- alerts ----------
router.get(
  '/alerts',
  wrap(async (req, res) => {
    const q = {};
    if (req.query.status) q.status = String(req.query.status);
    if (req.query.severity) q.severity = String(req.query.severity);
    if (req.query.intersectionId) q.intersectionId = String(req.query.intersectionId);
    const alerts = await Alert.find(q).sort({ createdAt: -1 }).limit(intParam(req.query.limit, 50, 1, 500)).lean();
    res.json(alerts);
  })
);

router.patch(
  '/alerts/:id/ack',
  wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid alert id' });
    const alert = await Alert.findOneAndUpdate(
      { _id: req.params.id, status: 'active' },
      { $set: { status: 'acknowledged', acknowledgedAt: new Date(), acknowledgedBy: (req.body && req.body.user) || 'operator' } },
      { new: true }
    ).lean();
    if (!alert) return res.status(404).json({ error: 'active alert not found' });
    realtime.emit('alert:updated', alert);
    res.json(alert);
  })
);

router.post(
  '/alerts/ack-all',
  wrap(async (req, res) => {
    const r = await Alert.updateMany(
      { status: 'active' },
      { $set: { status: 'acknowledged', acknowledgedAt: new Date(), acknowledgedBy: (req.body && req.body.user) || 'operator' } }
    );
    realtime.emit('alert:bulk', { acknowledged: r.modifiedCount });
    res.json({ acknowledged: r.modifiedCount });
  })
);

// ---------- vehicles ----------
router.get(
  '/vehicles',
  wrap(async (req, res) => {
    const q = {};
    if (req.query.intersectionId) q.intersectionId = String(req.query.intersectionId);
    if (req.query.emergency === 'true') q.isEmergency = true;
    if (req.query.speeding === 'true') q.speeding = true;
    const rows = await VehicleRecord.find(q).sort({ timestamp: -1 }).limit(intParam(req.query.limit, 50, 1, 500)).lean();
    res.json(rows);
  })
);

// ---------- traffic signal control ----------
router.get(
  '/signals',
  wrap(async (req, res) => res.json(await SignalConfig.find().sort({ _id: 1 }).lean()))
);

router.get(
  '/signals/:id/history',
  wrap(async (req, res) => {
    const rows = await SignalHistory.find({ intersectionId: req.params.id })
      .sort({ timestamp: -1 })
      .limit(intParam(req.query.limit, 50, 1, 500))
      .lean();
    res.json(rows);
  })
);

/**
 * PUT /api/signals/:id
 *   { "mode": "manual", "nsGreen": 45, "ewGreen": 25 }   -> fixed timing override
 *   { "mode": "adaptive" }                               -> hand back to Node-RED optimisation
 */
router.put(
  '/signals/:id',
  wrap(async (req, res) => {
    const id = req.params.id;
    if (!ID_RE.test(id)) return res.status(400).json({ error: 'invalid intersection id' });
    const { mode, nsGreen, ewGreen, user } = req.body || {};
    if (!['manual', 'adaptive'].includes(mode)) return res.status(400).json({ error: 'mode must be "manual" or "adaptive"' });

    let command = { mode: 'adaptive' };
    let update = { 'manualOverride.active': false, mode: 'adaptive', reason: 'override-released' };
    if (mode === 'manual') {
      const ns = Number(nsGreen);
      const ew = Number(ewGreen);
      if (![ns, ew].every((v) => Number.isFinite(v) && v >= 10 && v <= 120)) {
        return res.status(400).json({ error: 'nsGreen and ewGreen must be numbers between 10 and 120 seconds' });
      }
      command = { mode: 'manual', nsGreen: Math.round(ns), ewGreen: Math.round(ew) };
      update = {
        mode: 'manual',
        nsGreen: command.nsGreen,
        ewGreen: command.ewGreen,
        cycleLength: command.nsGreen + command.ewGreen + 8,
        reason: 'manual-override',
        manualOverride: { active: true, nsGreen: command.nsGreen, ewGreen: command.ewGreen, setBy: user || 'operator', setAt: new Date() },
      };
    }

    const exists = await Intersection.exists({ _id: id });
    if (!exists) return res.status(404).json({ error: 'intersection not found' });

    try {
      await mqttClient.publishControl(id, command);
    } catch (err) {
      return res.status(503).json({ error: `could not reach signal controller: ${err.message}` });
    }

    const signal = await SignalConfig.findByIdAndUpdate(id, { $set: update }, { new: true, upsert: true }).lean();
    await SignalHistory.create({
      intersectionId: id, mode: signal.mode, cycleLength: signal.cycleLength,
      nsGreen: signal.nsGreen, ewGreen: signal.ewGreen, reason: update.reason,
    });
    const systemAlert = await Alert.create({
      intersectionId: id, type: 'system', severity: 'info',
      message: mode === 'manual'
        ? `Manual timing set at ${id}: NS ${command.nsGreen}s / EW ${command.ewGreen}s`
        : `Adaptive control restored at ${id}`,
      status: 'resolved',
    });
    realtime.emit('alert:new', systemAlert.toObject());
    realtime.emit('signal:update', signal);
    res.json(signal);
  })
);

module.exports = router;
