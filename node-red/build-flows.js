// Generates flows.json from the function sources in ./functions
// Usage: node build-flows.js   (re-run after editing any function file, then rebuild the container)
const fs = require('fs');
const path = require('path');

const fn = (name) => fs.readFileSync(path.join(__dirname, 'functions', name + '.js'), 'utf8');
const TAB = 'tab_traffic';
const BROKER = 'broker_mosquitto';

const nodes = [
  { id: TAB, type: 'tab', label: 'FlowSense processing', disabled: false,
    info: 'MQTT ingestion -> data validation -> traffic metrics & congestion detection -> adaptive signal timing (Webster) -> emergency priority -> publish signal plans, processed data and alerts -> forward to the backend (MongoDB + WebSocket)' },
  { id: BROKER, type: 'mqtt-broker', name: 'Mosquitto', broker: '${MQTT_HOST}', port: '1883',
    clientid: 'node-red-flowsense', autoConnect: true, usetls: false, protocolVersion: '4', keepalive: '60',
    cleansession: true, birthTopic: 'traffic/status/node-red', birthQos: '0', birthRetain: 'true', birthPayload: '{"online":true}',
    closeTopic: '', willTopic: 'traffic/status/node-red', willQos: '0', willRetain: 'true', willPayload: '{"online":false}' },

  { id: 'c1', type: 'comment', z: TAB, name: '1. MQTT ingestion + data validation (ST-5)', x: 200, y: 40, wires: [] },
  { id: 'mqtt_in_sensors', type: 'mqtt in', z: TAB, name: 'traffic/sensors/+', topic: 'traffic/sensors/+', qos: '0',
    datatype: 'json', broker: BROKER, nl: false, rap: true, rh: 0, inputs: 0, x: 140, y: 100, wires: [['fn_validate']] },
  { id: 'fn_validate', type: 'function', z: TAB, name: 'Data validation', func: fn('validate'), outputs: 2,
    noerr: 0, x: 360, y: 100, wires: [['fn_process'], ['dbg_rejected']] },
  { id: 'dbg_rejected', type: 'debug', z: TAB, name: 'Rejected readings', active: true, tosidebar: true,
    console: true, complete: 'payload', statusVal: 'payload.reason', statusType: 'msg', x: 590, y: 140, wires: [] },

  { id: 'c2', type: 'comment', z: TAB, name: '2. Traffic metrics + congestion detection (ST-6)', x: 220, y: 200, wires: [] },
  { id: 'fn_process', type: 'function', z: TAB, name: 'Metrics + congestion detection', func: fn('process'), outputs: 1,
    x: 220, y: 260, wires: [['fn_signal']] },
  { id: 'c4', type: 'comment', z: TAB, name: '3. Adaptive signals (ST-7) + emergency priority (ST-8)', x: 640, y: 200, wires: [] },
  { id: 'fn_signal', type: 'function', z: TAB, name: 'Signal optimization (Webster)', func: fn('signal'), outputs: 1,
    x: 520, y: 260, wires: [['fn_emergency']] },
  { id: 'fn_emergency', type: 'function', z: TAB, name: 'Emergency priority', func: fn('emergency'), outputs: 2,
    x: 780, y: 260, wires: [['fn_publish', 'fn_route'], ['mqtt_out_signals', 'dbg_signals']] },
  { id: 'mqtt_out_signals', type: 'mqtt out', z: TAB, name: 'traffic/signals/<id>', topic: '', qos: '', retain: '',
    broker: BROKER, x: 1020, y: 240, wires: [] },
  { id: 'dbg_signals', type: 'debug', z: TAB, name: 'Signal plans', active: false, tosidebar: true, console: false,
    complete: 'payload', statusVal: 'payload.mode', statusType: 'msg', x: 1000, y: 280, wires: [] },

  { id: 'c3', type: 'comment', z: TAB, name: '4. Publish processed data and alerts', x: 190, y: 340, wires: [] },
  { id: 'fn_publish', type: 'function', z: TAB, name: 'Publish results', func: fn('publish'), outputs: 2,
    x: 180, y: 400, wires: [['mqtt_out', 'dbg_processed'], ['mqtt_out', 'dbg_alerts']] },
  { id: 'mqtt_out', type: 'mqtt out', z: TAB, name: 'traffic/processed|alerts/<id>', topic: '', qos: '', retain: '',
    broker: BROKER, x: 460, y: 380, wires: [] },
  { id: 'dbg_processed', type: 'debug', z: TAB, name: 'Processed (summary)', active: false, tosidebar: true,
    console: false, complete: 'payload.summary', statusVal: 'payload.summary.congestionLevel', statusType: 'msg', x: 460, y: 420, wires: [] },
  { id: 'dbg_alerts', type: 'debug', z: TAB, name: 'Alerts', active: true, tosidebar: true,
    console: false, complete: 'payload', statusVal: 'payload.message', statusType: 'msg', x: 430, y: 460, wires: [] },

  { id: 'c5', type: 'comment', z: TAB, name: '5. Backend routing (ST-10)', x: 690, y: 340, wires: [] },
  { id: 'fn_route', type: 'function', z: TAB, name: 'Backend routing', func: fn('route'), outputs: 1,
    x: 660, y: 400, wires: [['http_backend']] },
  { id: 'http_backend', type: 'http request', z: TAB, name: 'POST /api/ingest', method: 'use', ret: 'obj',
    paytoqs: 'ignore', url: '', tls: '', persist: true, proxy: '', insecureHTTPParser: false, authType: '',
    senderr: false, headers: [], x: 860, y: 400, wires: [['fn_http_status']] },
  { id: 'fn_http_status', type: 'function', z: TAB, name: 'Check backend response',
    func: "if (msg.statusCode >= 300 || msg.statusCode === undefined) {\n  node.status({ fill: 'red', shape: 'ring', text: 'backend ' + (msg.statusCode || 'unreachable') });\n  node.warn('Backend rejected ingest: ' + (msg.statusCode || 'unreachable') + ' ' + JSON.stringify(msg.payload));\n} else {\n  node.status({ fill: 'green', shape: 'dot', text: 'backend ok' });\n}\nreturn null;",
    outputs: 1, x: 1070, y: 400, wires: [[]] },

  { id: 'c6', type: 'comment', z: TAB, name: '6. Manual signal control from the dashboard (ST-12)', x: 230, y: 600, wires: [] },
  { id: 'mqtt_in_control', type: 'mqtt in', z: TAB, name: 'traffic/control/+', topic: 'traffic/control/+', qos: '1',
    datatype: 'json', broker: BROKER, nl: false, rap: true, rh: 0, inputs: 0, x: 140, y: 660, wires: [['fn_control']] },
  { id: 'fn_control', type: 'function', z: TAB, name: 'Apply manual override', func: fn('control'), outputs: 1,
    x: 380, y: 660, wires: [[]] },

  { id: 'catch_all', type: 'catch', z: TAB, name: 'Errors', scope: null, uncaught: false, x: 120, y: 740, wires: [['dbg_errors']] },
  { id: 'dbg_errors', type: 'debug', z: TAB, name: 'Flow errors', active: true, tosidebar: true, console: true,
    complete: 'error', x: 300, y: 740, wires: [] },
];

fs.writeFileSync(path.join(__dirname, 'flows.json'), JSON.stringify(nodes, null, 2));
console.log(`flows.json written (${nodes.length} nodes)`);
