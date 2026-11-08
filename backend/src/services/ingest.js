const { Intersection, TrafficReading, VehicleRecord, Alert, SignalConfig, SignalHistory } = require('../models');
const realtime = require('../realtime');
const mqttClient = require('../mqttClient');

/** Validate the processed record coming from Node-RED. Returns an error string or null. */
function validateIngest(body) {
  if (!body || typeof body !== 'object') return 'body must be a JSON object';
  if (typeof body.intersectionId !== 'string') return 'intersectionId is required';
  if (!body.summary || typeof body.summary !== 'object') return 'summary is required (processed record expected)';
  if (!Array.isArray(body.approaches)) return 'approaches must be an array';
  if (isNaN(Date.parse(body.timestamp))) return 'timestamp is invalid';
  return null;
}

/**
 * Business logic for one processed sensor record:
 *  - store the reading (history) and notable vehicles
 *  - update the intersection's live state
 *  - store/announce alerts
 *  - store signal plan + history when it changed
 *  - push everything to dashboards over Socket.IO
 */
async function ingest(record) {
  const id = record.intersectionId;
  const ts = new Date(record.timestamp);
  const s = record.summary;

  const intersection = await Intersection.findById(id).lean();
  if (!intersection) {
    const err = new Error(`Unknown intersection ${id}`);
    err.status = 404;
    throw err;
  }

  const reading = {
    intersectionId: id,
    sensorId: record.sensorId,
    timestamp: ts,
    vehicleCount: s.vehicleCount,
    flowVph: s.flowVph,
    avgSpeed: s.avgSpeed,
    avgOccupancy: s.avgOccupancy,
    totalQueue: s.totalQueue,
    density: s.density,
    congestionScore: s.congestionScore,
    congestionLevel: s.congestionLevel,
    approaches: record.approaches,
  };

  const vehicles = (record.vehicles || []).map((v) => ({
    vehicleId: v.vehicleId,
    intersectionId: id,
    timestamp: ts,
    type: v.type,
    speed: v.speed,
    approach: v.approach,
    isEmergency: !!v.isEmergency,
    speeding: v.speed > intersection.freeFlowSpeed * 1.2,
  }));

  const latest = {
    timestamp: ts,
    vehicleCount: s.vehicleCount,
    flowVph: s.flowVph,
    avgSpeed: s.avgSpeed,
    avgOccupancy: s.avgOccupancy,
    totalQueue: s.totalQueue,
    density: s.density,
    congestionScore: s.congestionScore,
    congestionLevel: s.congestionLevel,
    incidents: s.incidents || [],
    emergency: record.emergency && record.emergency.detected ? record.emergency : null,
    approaches: record.approaches,
  };

  await Promise.all([
    TrafficReading.create(reading),
    vehicles.length ? VehicleRecord.insertMany(vehicles) : null,
    Intersection.updateOne({ _id: id }, { $set: { latest } }),
  ]);

  // alerts
  const createdAlerts = [];
  for (const a of record.alerts || []) {
    const doc = await Alert.create({ intersectionId: id, type: a.type, severity: a.severity, message: a.message });
    createdAlerts.push(doc.toObject());
    // a "cleared" alert resolves earlier active alerts of the same family
    if (a.type === 'congestion_cleared' || a.type === 'emergency_cleared') {
      const family = a.type.replace('_cleared', '');
      await Alert.updateMany({ intersectionId: id, type: family, status: { $ne: 'resolved' } }, { $set: { status: 'resolved' } });
      doc.status = 'resolved';
      await doc.save();
      createdAlerts[createdAlerts.length - 1].status = 'resolved';
    }
  }

  // signal plan
  let signal = null;
  if (record.signal) {
    const p = record.signal;
    signal = await SignalConfig.findByIdAndUpdate(
      id,
      {
        $set: {
          mode: p.mode,
          cycleLength: p.cycleLength,
          nsGreen: p.nsGreen,
          ewGreen: p.ewGreen,
          yellow: p.yellow,
          allRed: p.allRed,
          preemptApproach: p.preemptApproach || null,
          reason: p.reason,
        },
      },
      { new: true, upsert: true }
    ).lean();
    if (p.changed) {
      await SignalHistory.create({
        intersectionId: id, timestamp: ts, mode: p.mode, cycleLength: p.cycleLength,
        nsGreen: p.nsGreen, ewGreen: p.ewGreen, reason: p.reason,
      });
    }
  }

  // realtime push
  mqttClient.markSensorData(ts.toISOString());
  realtime.emit('traffic:update', { intersectionId: id, name: intersection.name, location: intersection.location, ...latest, signal });
  createdAlerts.forEach((a) => realtime.emit('alert:new', a));
  if (signal && record.signal.changed) realtime.emit('signal:update', signal);
  if (latest.emergency) realtime.emit('emergency', { intersectionId: id, name: intersection.name, ...latest.emergency });

  return { stored: true, alerts: createdAlerts.length, vehicles: vehicles.length };
}

module.exports = { ingest, validateIngest };
