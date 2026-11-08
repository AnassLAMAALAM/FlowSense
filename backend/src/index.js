const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');

const config = require('./config');
const realtime = require('./realtime');
const mqttClient = require('./mqttClient');
const routes = require('./routes');
const { seed } = require('./seed');
const swaggerUi = require('swagger-ui-express');
const openapi = require('./openapi');
const weather = require('./services/weather');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '256kb' }));
// log API calls except the high-frequency ingest endpoint
app.use(morgan('tiny', { skip: (req) => req.originalUrl === '/api/ingest' || req.originalUrl.startsWith('/api/docs') }));

// API documentation: interactive Swagger UI at /api/docs, raw OpenAPI spec at /api/openapi.json
app.get('/api/openapi.json', (req, res) => res.json(openapi));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'FlowSense API' }));

app.use('/api', routes);

// Serve the built React dashboard if present (single-container deployment option)
const staticDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get(/^\/(?!api|socket\.io).*/, (req, res) => res.sendFile(path.join(staticDir, 'index.html')));
}

app.use((req, res) => res.status(404).json({ error: 'not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.name === 'ValidationError' ? 400 : 500);
  if (status >= 500) console.error('[api]', err);
  res.status(status).json({ error: err.message || 'internal error' });
});

async function connectMongo() {
  for (let attempt = 1; ; attempt++) {
    try {
      await mongoose.connect(config.mongoUrl, { serverSelectionTimeoutMS: 5000 });
      console.log(`[mongo] connected`);
      return;
    } catch (err) {
      console.warn(`[mongo] connection attempt ${attempt} failed: ${err.message}; retrying in 3s`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function main() {
  await connectMongo();
  await seed();

  const server = http.createServer(app);
  realtime.init(server, config.corsOrigin);
  mqttClient.connect(config.mqttUrl);
  weather.start().catch((err) => console.warn('[weather] start failed', err.message));

  server.listen(config.port, () => console.log(`[api] listening on :${config.port}`));

  const shutdown = async () => {
    console.log('[api] shutting down');
    weather.stop();
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { app };
