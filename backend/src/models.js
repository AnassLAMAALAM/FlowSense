const mongoose = require('mongoose');
const { readingsTtlDays } = require('./config');

const { Schema } = mongoose;
const LEVELS = ['free', 'moderate', 'heavy', 'severe'];

// ---- Intersections (static metadata + latest live state) ----
const intersectionSchema = new Schema(
  {
    _id: { type: String }, // e.g. INT-001
    name: { type: String, required: true },
    location: { lat: Number, lng: Number },
    lanes: { type: Number, default: 2 },
    freeFlowSpeed: { type: Number, default: 50 },
    latest: {
      timestamp: Date,
      vehicleCount: Number,
      flowVph: Number,
      avgSpeed: Number,
      avgOccupancy: Number,
      totalQueue: Number,
      density: Number,
      congestionScore: Number,
      congestionLevel: { type: String, enum: LEVELS },
      incidents: [String],
      emergency: Schema.Types.Mixed,
      approaches: Schema.Types.Mixed,
    },
  },
  { timestamps: true, versionKey: false }
);

// ---- Traffic history (one document per intersection per sensor interval) ----
const approachSchema = new Schema(
  {
    approach: { type: String, enum: ['N', 'S', 'E', 'W'] },
    vehicleCount: Number,
    avgSpeed: Number,
    occupancy: Number,
    queueLength: Number,
    flowVph: Number,
    density: Number,
    congestionScore: Number,
    congestionLevel: { type: String, enum: LEVELS },
    incident: Boolean,
  },
  { _id: false }
);

const trafficReadingSchema = new Schema(
  {
    intersectionId: { type: String, required: true, ref: 'Intersection' },
    sensorId: String,
    timestamp: { type: Date, required: true },
    vehicleCount: Number,
    flowVph: Number,
    avgSpeed: Number,
    avgOccupancy: Number,
    totalQueue: Number,
    density: Number,
    congestionScore: Number,
    congestionLevel: { type: String, enum: LEVELS },
    approaches: [approachSchema],
  },
  { versionKey: false }
);
trafficReadingSchema.index({ intersectionId: 1, timestamp: -1 });
trafficReadingSchema.index({ timestamp: 1 }, { expireAfterSeconds: readingsTtlDays * 86400 });

// ---- Vehicle records (notable detections: heavy vehicles, speeding, emergency) ----
const vehicleRecordSchema = new Schema(
  {
    vehicleId: String,
    intersectionId: { type: String, required: true },
    timestamp: { type: Date, required: true },
    type: String,
    speed: Number,
    approach: String,
    isEmergency: { type: Boolean, default: false },
    speeding: { type: Boolean, default: false },
  },
  { versionKey: false }
);
vehicleRecordSchema.index({ intersectionId: 1, timestamp: -1 });
vehicleRecordSchema.index({ isEmergency: 1, timestamp: -1 });
vehicleRecordSchema.index({ timestamp: 1 }, { expireAfterSeconds: readingsTtlDays * 86400 });

// ---- Alerts ----
const alertSchema = new Schema(
  {
    intersectionId: { type: String, default: 'NETWORK' }, // NETWORK = city-wide alert (e.g. weather)
    type: {
      type: String,
      enum: ['congestion', 'congestion_cleared', 'incident', 'emergency', 'emergency_cleared', 'weather', 'weather_cleared', 'system'],
    },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
    message: String,
    status: { type: String, enum: ['active', 'acknowledged', 'resolved'], default: 'active' },
    acknowledgedAt: Date,
    acknowledgedBy: String,
  },
  { timestamps: true, versionKey: false }
);
alertSchema.index({ status: 1, createdAt: -1 });
alertSchema.index({ intersectionId: 1, createdAt: -1 });

// ---- Signal configuration (current plan per intersection) ----
const signalConfigSchema = new Schema(
  {
    _id: { type: String }, // intersectionId
    mode: { type: String, enum: ['adaptive', 'manual', 'emergency'], default: 'adaptive' },
    cycleLength: { type: Number, default: 90 },
    nsGreen: { type: Number, default: 40 },
    ewGreen: { type: Number, default: 40 },
    yellow: { type: Number, default: 3 },
    allRed: { type: Number, default: 2 },
    preemptApproach: { type: String, default: null },
    reason: String,
    manualOverride: {
      active: { type: Boolean, default: false },
      nsGreen: Number,
      ewGreen: Number,
      setBy: String,
      setAt: Date,
    },
  },
  { timestamps: true, versionKey: false }
);

// ---- Signal history (every significant plan change) ----
const signalHistorySchema = new Schema(
  {
    intersectionId: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    mode: String,
    cycleLength: Number,
    nsGreen: Number,
    ewGreen: Number,
    reason: String,
  },
  { versionKey: false }
);
signalHistorySchema.index({ intersectionId: 1, timestamp: -1 });

// ---- Weather (Open-Meteo readings for the city) ----
const weatherReadingSchema = new Schema(
  {
    timestamp: { type: Date, required: true },
    city: String,
    condition: { type: String, enum: ['clear', 'cloudy', 'rain', 'heavy_rain', 'fog', 'storm'] },
    description: String,
    weatherCode: Number,
    temperatureC: Number,
    humidity: Number,
    precipitationMm: Number,
    windKmh: Number,
    isDay: Boolean,
    source: { type: String, enum: ['open-meteo', 'manual'], default: 'open-meteo' },
  },
  { versionKey: false }
);
weatherReadingSchema.index({ timestamp: -1 });
weatherReadingSchema.index({ timestamp: 1 }, { expireAfterSeconds: readingsTtlDays * 86400 });

module.exports = {
  LEVELS,
  Intersection: mongoose.model('Intersection', intersectionSchema),
  TrafficReading: mongoose.model('TrafficReading', trafficReadingSchema),
  VehicleRecord: mongoose.model('VehicleRecord', vehicleRecordSchema),
  Alert: mongoose.model('Alert', alertSchema),
  SignalConfig: mongoose.model('SignalConfig', signalConfigSchema),
  SignalHistory: mongoose.model('SignalHistory', signalHistorySchema),
  WeatherReading: mongoose.model('WeatherReading', weatherReadingSchema),
};
