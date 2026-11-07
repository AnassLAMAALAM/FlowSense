// Step 1 - backend skeleton: Express + MongoDB + MQTT + Socket.IO, with a health endpoint.
const http = require('http');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const mqtt = require('mqtt');
const { Server } = require('socket.io');
const config = require('./config');

const status = { broker: false, nodeRed: null, lastSensorMessage: null };

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: config.corsOrigin } });
io.on('connection', (socket) => socket.emit('system:status', status));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    mongo: mongoose.connection.readyState === 1,
    websocketClients: io.engine.clientsCount,
    ...status,
  });
});

async function connectMongo() {
  for (;;) {
    try {
      await mongoose.connect(config.mongoUrl, { serverSelectionTimeoutMS: 5000 });
      console.log('[mongo] connected');
      return;
    } catch (err) {
      console.warn(`[mongo] ${err.message}; retrying in 3s`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

function connectMqtt() {
  const client = mqtt.connect(config.mqttUrl, { reconnectPeriod: 3000 });
  client.on('connect', () => {
    status.broker = true;
    console.log(`[mqtt] connected to ${config.mqttUrl}`);
    client.subscribe(['traffic/status/+', 'traffic/sensors/+']);
    io.emit('system:status', status);
  });
  client.on('close', () => { status.broker = false; });
  client.on('message', (topic, buf) => {
    if (topic.startsWith('traffic/sensors/')) status.lastSensorMessage = new Date().toISOString();
    if (topic === 'traffic/status/node-red') {
      try { status.nodeRed = !!JSON.parse(buf.toString()).online; } catch { /* ignore */ }
    }
    io.emit('system:status', status);
  });
}

(async () => {
  await connectMongo();
  connectMqtt();
  server.listen(config.port, () => console.log(`[api] listening on :${config.port}`));
})();
