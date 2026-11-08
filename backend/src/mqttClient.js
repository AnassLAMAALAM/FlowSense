// MQTT client used by the backend: sends manual signal commands to Node-RED,
// publishes the weather for the simulator, and tracks component online status.
const mqtt = require('mqtt');
const realtime = require('./realtime');

let client = null;
const status = { broker: false, simulator: null, nodeRed: null, lastSensorMessage: null };
let lastStatusEmit = 0;

function connect(url) {
  client = mqtt.connect(url, {
    clientId: `flowsense-backend-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 3000,
  });
  client.on('connect', () => {
    status.broker = true;
    console.log(`[mqtt] connected to ${url}`);
    client.subscribe('traffic/status/+');
    realtime.emit('system:status', getStatus());
  });
  client.on('close', () => {
    if (status.broker) realtime.emit('system:status', { ...getStatus(), broker: false });
    status.broker = false;
  });
  client.on('error', (err) => console.error('[mqtt] error', err.message));
  client.on('message', (topic, buf) => {
    try {
      const msg = JSON.parse(buf.toString());
      if (topic === 'traffic/status/simulator') status.simulator = !!msg.online;
      if (topic === 'traffic/status/node-red') status.nodeRed = !!msg.online;
      realtime.emit('system:status', getStatus());
    } catch {
      /* ignore non-JSON status */
    }
  });
  return client;
}

function publishControl(intersectionId, command) {
  return new Promise((resolve, reject) => {
    if (!client || !client.connected) return reject(new Error('MQTT broker not connected'));
    client.publish(`traffic/control/${intersectionId}`, JSON.stringify(command), { qos: 1, retain: true }, (err) =>
      err ? reject(err) : resolve()
    );
  });
}

/** Generic publish (JSON). mqtt.js queues messages while reconnecting. */
function publish(topic, payload, opts = {}) {
  if (!client) return console.warn(`[mqtt] not initialised, dropped message on ${topic}`);
  client.publish(topic, JSON.stringify(payload), { qos: 1, ...opts });
}

/** Called for every processed reading: keeps "sensors last seen" fresh for the health indicators. */
function markSensorData(timestamp) {
  status.lastSensorMessage = timestamp || new Date().toISOString();
  if (Date.now() - lastStatusEmit > 2000) {
    lastStatusEmit = Date.now();
    realtime.emit('system:status', getStatus());
  }
}

function getStatus() {
  return { ...status };
}

module.exports = { connect, publish, publishControl, markSensorData, getStatus };
