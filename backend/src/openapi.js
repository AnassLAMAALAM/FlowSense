// OpenAPI 3 description of the FlowSense REST API.
// Served as JSON at /api/openapi.json and as interactive Swagger UI at /api/docs.
const ID = { name: 'id', in: 'path', required: true, schema: { type: 'string', example: 'INT-003' }, description: 'Intersection id (INT-001 … INT-006)' };
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema, description = 'OK') => ({ description, content: { 'application/json': { schema } } });
const error = (description) => json(ref('Error'), description);
const query = (name, schema, description) => ({ name, in: 'query', required: false, schema, description });

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'FlowSense — Smart Traffic Management API',
    version: '1.0.0',
    description:
      'REST API of the FlowSense IoT system (Jerez de la Frontera).\n\n' +
      'Data flow: Python sensors → MQTT → Node-RED → **POST /api/ingest** → MongoDB → Socket.IO → dashboard.\n\n' +
      '**Real-time events** are pushed over Socket.IO (WebSocket) on the same port: `traffic:update`, `alert:new`, ' +
      '`alert:updated`, `signal:update`, `emergency`, `weather:update`, `system:status`.',
  },
  servers: [{ url: '/', description: 'This server' }],
  tags: [
    { name: 'System', description: 'Health of every component' },
    { name: 'Ingestion', description: 'Processed readings from Node-RED' },
    { name: 'Intersections', description: 'Live state of the 6 intersections' },
    { name: 'Traffic & analytics', description: 'History and aggregated statistics from MongoDB' },
    { name: 'Alerts', description: 'Congestion, incident, emergency, weather and signal-change alerts' },
    { name: 'Vehicles', description: 'Notable vehicle detections' },
    { name: 'Signals', description: 'Traffic light plans and manual control' },
    { name: 'Weather', description: 'Live Jerez weather (Open-Meteo) and demo simulation' },
  ],
  paths: {
    '/api/health': {
      get: { tags: ['System'], summary: 'Status of MongoDB, MQTT, Node-RED, sensors and weather', responses: { 200: json(ref('Health')) } },
    },
    '/api/ingest': {
      post: {
        tags: ['Ingestion'],
        summary: 'Store one processed reading (called by Node-RED)',
        description: 'Stores the reading, updates the intersection live state, alerts and signal plan, then pushes WebSocket events.',
        security: [{ ingestToken: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: ref('ProcessedReading') } } },
        responses: {
          201: json({ type: 'object', properties: { stored: { type: 'boolean' }, alerts: { type: 'integer' }, vehicles: { type: 'integer' } } }, 'Stored'),
          400: error('Invalid body'), 401: error('Missing or wrong x-ingest-token'), 404: error('Unknown intersection'),
        },
      },
    },
    '/api/intersections': {
      get: { tags: ['Intersections'], summary: 'All intersections with live state and signal plan', responses: { 200: json({ type: 'array', items: ref('Intersection') }) } },
    },
    '/api/intersections/{id}': {
      get: {
        tags: ['Intersections'], summary: 'One intersection with its signal plan and 10 most recent alerts', parameters: [ID],
        responses: { 200: json(ref('Intersection')), 404: error('Intersection not found') },
      },
    },
    '/api/traffic/history': {
      get: {
        tags: ['Traffic & analytics'], summary: 'Time series averaged per time bucket',
        parameters: [
          query('minutes', { type: 'integer', default: 30, minimum: 1, maximum: 10080 }, 'Time window'),
          query('bucket', { type: 'integer', default: 30, minimum: 5, maximum: 3600 }, 'Bucket size in seconds'),
          query('intersectionId', { type: 'string', example: 'INT-002' }, 'Only this intersection'),
          query('split', { type: 'string', enum: ['intersection'] }, 'One series per intersection'),
        ],
        responses: { 200: json({ type: 'array', items: ref('HistoryPoint') }) },
      },
    },
    '/api/analytics/summary': {
      get: {
        tags: ['Traffic & analytics'], summary: 'KPIs, time per congestion level, alerts and per-intersection stats',
        parameters: [query('minutes', { type: 'integer', default: 60, minimum: 1, maximum: 10080 }, 'Time window')],
        responses: { 200: json(ref('AnalyticsSummary')) },
      },
    },
    '/api/alerts': {
      get: {
        tags: ['Alerts'], summary: 'List alerts, newest first',
        parameters: [
          query('status', { type: 'string', enum: ['active', 'acknowledged', 'resolved'] }, 'Filter by status'),
          query('severity', { type: 'string', enum: ['info', 'warning', 'critical'] }, 'Filter by severity'),
          query('intersectionId', { type: 'string' }, 'Filter by intersection (NETWORK = city-wide)'),
          query('limit', { type: 'integer', default: 50, minimum: 1, maximum: 500 }, 'Max results'),
        ],
        responses: { 200: json({ type: 'array', items: ref('Alert') }) },
      },
    },
    '/api/alerts/{id}/ack': {
      patch: {
        tags: ['Alerts'], summary: 'Acknowledge one active alert',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Alert _id' }],
        requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', properties: { user: { type: 'string', example: 'operator' } } } } } },
        responses: { 200: json(ref('Alert')), 400: error('Invalid alert id'), 404: error('Active alert not found') },
      },
    },
    '/api/alerts/ack-all': {
      post: {
        tags: ['Alerts'], summary: 'Acknowledge every active alert',
        responses: { 200: json({ type: 'object', properties: { acknowledged: { type: 'integer' } } }) },
      },
    },
    '/api/vehicles': {
      get: {
        tags: ['Vehicles'], summary: 'Notable vehicle detections (heavy, speeding, emergency)',
        parameters: [
          query('intersectionId', { type: 'string' }, 'Filter by intersection'),
          query('emergency', { type: 'string', enum: ['true'] }, 'Only emergency vehicles'),
          query('speeding', { type: 'string', enum: ['true'] }, 'Only speeding vehicles'),
          query('limit', { type: 'integer', default: 50, minimum: 1, maximum: 500 }, 'Max results'),
        ],
        responses: { 200: json({ type: 'array', items: ref('Vehicle') }) },
      },
    },
    '/api/signals': {
      get: { tags: ['Signals'], summary: 'Current traffic light plan of every intersection', responses: { 200: json({ type: 'array', items: ref('SignalConfig') }) } },
    },
    '/api/signals/{id}': {
      put: {
        tags: ['Signals'], summary: 'Manual control: set a fixed plan, or return to adaptive mode',
        description: 'The command is sent to Node-RED over MQTT (`traffic/control/<id>`). A manual plan stays until you send `{"mode":"adaptive"}`.',
        parameters: [ID],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: ref('SignalCommand'),
              examples: {
                manual: { summary: 'Manual plan', value: { mode: 'manual', nsGreen: 30, ewGreen: 70 } },
                adaptive: { summary: 'Back to adaptive', value: { mode: 'adaptive' } },
              },
            },
          },
        },
        responses: { 200: json(ref('SignalConfig')), 400: error('Invalid command'), 404: error('Intersection not found'), 503: error('MQTT broker not reachable') },
      },
    },
    '/api/signals/{id}/history': {
      get: {
        tags: ['Signals'], summary: 'Recent plan changes of one intersection',
        parameters: [ID, query('limit', { type: 'integer', default: 50, minimum: 1, maximum: 500 }, 'Max results')],
        responses: { 200: json({ type: 'array', items: ref('SignalHistory') }) },
      },
    },
    '/api/weather': {
      get: {
        tags: ['Weather'], summary: 'Current Jerez weather and history',
        parameters: [query('hours', { type: 'integer', default: 24, minimum: 1, maximum: 720 }, 'History window')],
        responses: { 200: json({ type: 'object', properties: { current: ref('Weather'), history: { type: 'array', items: ref('Weather') } } }) },
      },
    },
    '/api/weather/simulate': {
      post: {
        tags: ['Weather'], summary: 'Demo: force a weather condition until the next real update (10 min)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['condition'], properties: { condition: ref('WeatherCondition') } }, example: { condition: 'heavy_rain' } } },
        },
        responses: { 200: json(ref('Weather')), 400: error('Unknown condition') },
      },
    },
  },
  components: {
    securitySchemes: {
      ingestToken: { type: 'apiKey', in: 'header', name: 'x-ingest-token', description: 'Shared secret between Node-RED and the backend (INGEST_TOKEN)' },
    },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string', example: 'intersection not found' } } },
      Level: { type: 'string', enum: ['free', 'moderate', 'heavy', 'severe'] },
      WeatherCondition: { type: 'string', enum: ['clear', 'cloudy', 'rain', 'heavy_rain', 'fog', 'storm'] },
      Health: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' }, time: { type: 'string', format: 'date-time' }, mongo: { type: 'boolean' },
          websocketClients: { type: 'integer' }, broker: { type: 'boolean' }, simulator: { type: 'boolean', nullable: true },
          nodeRed: { type: 'boolean', nullable: true }, lastSensorMessage: { type: 'string', format: 'date-time', nullable: true },
          weather: { allOf: [ref('WeatherCondition')], nullable: true },
        },
      },
      Approach: {
        type: 'object',
        properties: {
          approach: { type: 'string', enum: ['N', 'S', 'E', 'W'] }, vehicleCount: { type: 'integer' }, avgSpeed: { type: 'number', description: 'km/h' },
          occupancy: { type: 'number', description: '%' }, queueLength: { type: 'integer' }, flowVph: { type: 'integer' }, density: { type: 'number' },
          congestionScore: { type: 'number', minimum: 0, maximum: 1 }, congestionLevel: ref('Level'), incident: { type: 'boolean' },
        },
      },
      LiveState: {
        type: 'object',
        properties: {
          timestamp: { type: 'string', format: 'date-time' }, vehicleCount: { type: 'integer' }, flowVph: { type: 'integer' }, avgSpeed: { type: 'number' },
          avgOccupancy: { type: 'number' }, totalQueue: { type: 'integer' }, density: { type: 'number' }, congestionScore: { type: 'number' },
          congestionLevel: ref('Level'), incidents: { type: 'array', items: { type: 'string' } }, emergency: { type: 'object', nullable: true },
          approaches: { type: 'array', items: ref('Approach') },
        },
      },
      Intersection: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'INT-001' }, name: { type: 'string', example: 'Main St & 1st Ave' },
          location: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
          lanes: { type: 'integer' }, freeFlowSpeed: { type: 'number' }, latest: ref('LiveState'), signal: ref('SignalConfig'),
        },
      },
      ProcessedReading: {
        type: 'object', required: ['intersectionId', 'timestamp', 'summary', 'approaches'],
        properties: {
          intersectionId: { type: 'string', example: 'INT-001' }, sensorId: { type: 'string' }, timestamp: { type: 'string', format: 'date-time' },
          approaches: { type: 'array', items: ref('Approach') },
          summary: { type: 'object', description: 'Intersection totals computed by Node-RED' },
          vehicles: { type: 'array', items: ref('Vehicle') }, emergency: { type: 'object' },
          alerts: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, severity: { type: 'string' }, message: { type: 'string' } } } },
          signal: ref('SignalConfig'),
        },
      },
      HistoryPoint: {
        type: 'object',
        properties: {
          time: { type: 'string', format: 'date-time' }, intersectionId: { type: 'string' }, flowVph: { type: 'integer' }, avgSpeed: { type: 'number' },
          occupancy: { type: 'number' }, density: { type: 'number' }, queue: { type: 'integer' }, congestion: { type: 'number' }, vehicles: { type: 'integer' },
        },
      },
      AnalyticsSummary: {
        type: 'object',
        properties: {
          windowMinutes: { type: 'integer' },
          network: { type: 'object', properties: {
            totalVehicles: { type: 'integer' }, currentFlowVph: { type: 'integer' }, currentAvgSpeed: { type: 'number' },
            congestedNow: { type: 'integer' }, activeAlerts: { type: 'integer' }, emergencyDetections: { type: 'integer' } } },
          levelDistribution: { type: 'array', items: { type: 'object', properties: { level: ref('Level'), share: { type: 'number', description: '% of readings' } } } },
          alertsByType: { type: 'object', additionalProperties: { type: 'integer' } },
          intersections: { type: 'array', items: { type: 'object' } },
        },
      },
      Alert: {
        type: 'object',
        properties: {
          _id: { type: 'string' }, intersectionId: { type: 'string', example: 'INT-002' },
          type: { type: 'string', enum: ['congestion', 'congestion_cleared', 'incident', 'emergency', 'emergency_cleared', 'weather', 'weather_cleared', 'system'] },
          severity: { type: 'string', enum: ['info', 'warning', 'critical'] }, message: { type: 'string' },
          status: { type: 'string', enum: ['active', 'acknowledged', 'resolved'] },
          acknowledgedAt: { type: 'string', format: 'date-time' }, acknowledgedBy: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Vehicle: {
        type: 'object',
        properties: {
          vehicleId: { type: 'string' }, intersectionId: { type: 'string' }, timestamp: { type: 'string', format: 'date-time' },
          type: { type: 'string', example: 'ambulance' }, speed: { type: 'number' }, approach: { type: 'string' },
          isEmergency: { type: 'boolean' }, speeding: { type: 'boolean' },
        },
      },
      SignalConfig: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: 'INT-003' }, mode: { type: 'string', enum: ['adaptive', 'manual', 'emergency'] },
          cycleLength: { type: 'number', description: 's' }, nsGreen: { type: 'number', description: 's' }, ewGreen: { type: 'number', description: 's' },
          yellow: { type: 'number' }, allRed: { type: 'number' }, preemptApproach: { type: 'string', nullable: true }, reason: { type: 'string' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      SignalCommand: {
        type: 'object', required: ['mode'],
        properties: {
          mode: { type: 'string', enum: ['manual', 'adaptive'] },
          nsGreen: { type: 'integer', minimum: 10, maximum: 120, description: 'Required for manual (s)' },
          ewGreen: { type: 'integer', minimum: 10, maximum: 120, description: 'Required for manual (s)' },
          user: { type: 'string', example: 'operator' },
        },
      },
      SignalHistory: {
        type: 'object',
        properties: {
          intersectionId: { type: 'string' }, timestamp: { type: 'string', format: 'date-time' }, mode: { type: 'string' },
          cycleLength: { type: 'number' }, nsGreen: { type: 'number' }, ewGreen: { type: 'number' }, reason: { type: 'string' },
        },
      },
      Weather: {
        type: 'object',
        properties: {
          timestamp: { type: 'string', format: 'date-time' }, city: { type: 'string', example: 'Jerez de la Frontera' }, condition: ref('WeatherCondition'),
          description: { type: 'string', example: 'Moderate rain' }, weatherCode: { type: 'integer', description: 'WMO code' },
          temperatureC: { type: 'number' }, humidity: { type: 'number' }, precipitationMm: { type: 'number' }, windKmh: { type: 'number' },
          isDay: { type: 'boolean' }, source: { type: 'string', enum: ['open-meteo', 'manual'] },
        },
      },
    },
  },
};
