// Analytics queries. Each one runs as a MongoDB aggregation pipeline; if the
// database engine doesn't support an operator (some Mongo-compatible engines
// such as FerretDB or older DocumentDB lack $dateTrunc / $avg), the same result
// is computed in JavaScript from a projected find().
const { TrafficReading, Alert } = require('../models');

const unsupported = (err) => /not implemented|unrecognized|unknown (group )?operator|not supported/i.test(err.message || '');

async function withFallback(pipelineFn, jsFn) {
  try {
    return await pipelineFn();
  } catch (err) {
    if (!unsupported(err)) throw err;
    return jsFn();
  }
}

function groupBy(rows, keyFn, init, add) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, init(r));
    add(map.get(k), r);
  }
  return [...map.values()];
}

const avgFields = ['flowVph', 'avgSpeed', 'avgOccupancy', 'density', 'totalQueue', 'congestionScore'];

/** Time-bucketed averages: [{ t, i?, flowVph, avgSpeed, occupancy, density, queue, congestion, vehicles }] */
function trafficHistory(match, bucketSec, split) {
  return withFallback(
    async () => {
      const groupId = { t: { $dateTrunc: { date: '$timestamp', unit: 'second', binSize: bucketSec } } };
      if (split) groupId.i = '$intersectionId';
      const rows = await TrafficReading.aggregate([
        { $match: match },
        {
          $group: {
            _id: groupId,
            flowVph: { $avg: '$flowVph' },
            avgSpeed: { $avg: '$avgSpeed' },
            occupancy: { $avg: '$avgOccupancy' },
            density: { $avg: '$density' },
            queue: { $avg: '$totalQueue' },
            congestion: { $avg: '$congestionScore' },
            vehicles: { $sum: '$vehicleCount' },
          },
        },
        { $sort: { '_id.t': 1 } },
      ]);
      return rows.map((r) => ({ t: r._id.t, i: r._id.i, ...r }));
    },
    async () => {
      const docs = await TrafficReading.find(match, [...avgFields, 'vehicleCount', 'timestamp', 'intersectionId'].join(' ')).lean();
      const ms = bucketSec * 1000;
      const groups = groupBy(
        docs,
        (d) => `${Math.floor(d.timestamp.getTime() / ms)}|${split ? d.intersectionId : ''}`,
        (d) => ({ t: new Date(Math.floor(d.timestamp.getTime() / ms) * ms), i: split ? d.intersectionId : undefined, n: 0, vehicles: 0, sums: {} }),
        (g, d) => {
          g.n++;
          g.vehicles += d.vehicleCount || 0;
          for (const f of avgFields) g.sums[f] = (g.sums[f] || 0) + (d[f] || 0);
        }
      );
      return groups
        .map((g) => ({
          t: g.t,
          i: g.i,
          flowVph: g.sums.flowVph / g.n,
          avgSpeed: g.sums.avgSpeed / g.n,
          occupancy: g.sums.avgOccupancy / g.n,
          density: g.sums.density / g.n,
          queue: g.sums.totalQueue / g.n,
          congestion: g.sums.congestionScore / g.n,
          vehicles: g.vehicles,
        }))
        .sort((a, b) => a.t - b.t);
    }
  );
}

/** Per-intersection stats over a window. */
function perIntersectionStats(since) {
  const match = { timestamp: { $gte: since } };
  return withFallback(
    () =>
      TrafficReading.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$intersectionId',
            avgFlow: { $avg: '$flowVph' },
            avgSpeed: { $avg: '$avgSpeed' },
            avgCongestion: { $avg: '$congestionScore' },
            maxQueue: { $max: '$totalQueue' },
            vehicles: { $sum: '$vehicleCount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    async () => {
      const docs = await TrafficReading.find(match, 'intersectionId flowVph avgSpeed congestionScore totalQueue vehicleCount').lean();
      return groupBy(
        docs,
        (d) => d.intersectionId,
        (d) => ({ _id: d.intersectionId, n: 0, f: 0, s: 0, c: 0, maxQueue: 0, vehicles: 0 }),
        (g, d) => {
          g.n++; g.f += d.flowVph || 0; g.s += d.avgSpeed || 0; g.c += d.congestionScore || 0;
          g.maxQueue = Math.max(g.maxQueue, d.totalQueue || 0); g.vehicles += d.vehicleCount || 0;
        }
      )
        .map((g) => ({ _id: g._id, avgFlow: g.f / g.n, avgSpeed: g.s / g.n, avgCongestion: g.c / g.n, maxQueue: g.maxQueue, vehicles: g.vehicles }))
        .sort((a, b) => a._id.localeCompare(b._id));
    }
  );
}

/** Count documents per value of a field: [{ _id: value, count }] */
function countBy(Model, match, field) {
  return withFallback(
    () => Model.aggregate([{ $match: match }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }]),
    async () => {
      const docs = await Model.find(match, field).lean();
      return groupBy(docs, (d) => d[field], (d) => ({ _id: d[field], count: 0 }), (g) => { g.count++; });
    }
  );
}

const levelDistribution = (since) => countBy(TrafficReading, { timestamp: { $gte: since } }, 'congestionLevel');
const alertCountsByType = (since) => countBy(Alert, { createdAt: { $gte: since } }, 'type');

module.exports = { trafficHistory, perIntersectionStats, levelDistribution, alertCountsByType };
