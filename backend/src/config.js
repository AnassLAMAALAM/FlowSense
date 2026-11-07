module.exports = {
  port: Number(process.env.PORT || 4000),
  mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27017/smart_traffic',
  mqttUrl: process.env.MQTT_URL || 'mqtt://localhost:1883',
  corsOrigin: process.env.CORS_ORIGIN || '*',
};
