module.exports = {
  port: Number(process.env.PORT || 4000),
  mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27017/smart_traffic',
  mqttUrl: process.env.MQTT_URL || 'mqtt://localhost:1883',
  ingestToken: process.env.INGEST_TOKEN || 'dev-ingest-token',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  // raw readings older than this are removed automatically (TTL index)
  readingsTtlDays: Number(process.env.READINGS_TTL_DAYS || 30),
  // Weather (Open-Meteo, free, no API key). Default location: Jerez de la Frontera.
  weather: {
    enabled: (process.env.WEATHER_ENABLED || 'true') !== 'false',
    city: process.env.WEATHER_CITY || 'Jerez de la Frontera',
    lat: Number(process.env.WEATHER_LAT || 36.6866),
    lon: Number(process.env.WEATHER_LON || -6.1372),
    intervalMin: Number(process.env.WEATHER_INTERVAL_MIN || 10),
  },
};
