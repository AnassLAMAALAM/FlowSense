// Publish results on MQTT
//   output 1: processed record -> traffic/processed/<intersectionId>
//   output 2: one message per alert -> traffic/alerts/<intersectionId>
const p = msg.payload;
const id = p.intersectionId;

const processed = {
    topic: 'traffic/processed/' + id,
    payload: p,
    qos: 0,
    retain: true          // latest state per intersection is always available
};

const alerts = (p.alerts || []).map(a => ({
    topic: 'traffic/alerts/' + id,
    payload: Object.assign({ intersectionId: id, timestamp: p.timestamp }, a),
    qos: 1,
    retain: false
}));

const stats = flow.get('stats') || { processed: 0, alerts: 0 };
stats.processed++;
stats.alerts += alerts.length;
flow.set('stats', stats);
node.status({ fill: 'green', shape: 'dot', text: `${stats.processed} processed · ${stats.alerts} alerts` });

return [processed, alerts];
