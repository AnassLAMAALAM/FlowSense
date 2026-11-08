const { Intersection, SignalConfig } = require('./models');

// Must match sensors/simulator.py INTERSECTIONS (ids, lanes, free-flow speed).
// A 2 x 3 grid of intersections in central Jerez de la Frontera (about 500 m apart).
// Names and coordinates are illustrative; rename them freely.
const INTERSECTIONS = [
  { _id: 'INT-001', name: 'Main St & 1st Ave', location: { lat: 36.689, lng: -6.144 }, lanes: 2, freeFlowSpeed: 50 },
  { _id: 'INT-002', name: 'Main St & Central Blvd', location: { lat: 36.689, lng: -6.138 }, lanes: 3, freeFlowSpeed: 50 },
  { _id: 'INT-003', name: 'Main St & Harbor Rd', location: { lat: 36.689, lng: -6.132 }, lanes: 2, freeFlowSpeed: 50 },
  { _id: 'INT-004', name: 'Park Ave & 1st Ave', location: { lat: 36.6845, lng: -6.144 }, lanes: 2, freeFlowSpeed: 40 },
  { _id: 'INT-005', name: 'Park Ave & Central Blvd', location: { lat: 36.6845, lng: -6.138 }, lanes: 3, freeFlowSpeed: 50 },
  { _id: 'INT-006', name: 'Park Ave & Harbor Rd', location: { lat: 36.6845, lng: -6.132 }, lanes: 1, freeFlowSpeed: 30 },
];

async function seed() {
  for (const i of INTERSECTIONS) {
    // upsert metadata only; never overwrite the live "latest" state
    await Intersection.updateOne(
      { _id: i._id },
      { $set: { name: i.name, location: i.location, lanes: i.lanes, freeFlowSpeed: i.freeFlowSpeed } },
      { upsert: true }
    );
    await SignalConfig.updateOne({ _id: i._id }, { $setOnInsert: { mode: 'adaptive' } }, { upsert: true });
  }
  console.log(`[seed] ${INTERSECTIONS.length} intersections ready`);
}

module.exports = { seed, INTERSECTIONS };
