# Smart Traffic Management System (IoT)

Python virtual sensors → MQTT (Mosquitto) → Node-RED → Node.js/Express + Socket.IO → MongoDB → React dashboard.

## Step 1 — project skeleton (current)

Every service starts and connects:

- `sensors/` — Python simulator publishing basic readings to `traffic/sensors/<id>`
- `mosquitto/` — MQTT broker
- `node-red/` — flow that receives sensor data (visible in the Node-RED debug sidebar)
- `backend/` — Express API (`/api/health`), MongoDB connection, Socket.IO, MQTT client
- `frontend/` — React dashboard showing the status of every component

## Run

Requirement: Docker Desktop running.

```bash
docker compose up -d --build      # or double-click start.bat
```

| Service | URL |
|---|---|
| Dashboard | http://localhost:8080 |
| Node-RED | http://localhost:1880 |
| Backend health | http://localhost:4000/api/health |
| MQTT | localhost:1883 |
| MongoDB | localhost:27017 |

After ~15 seconds all six indicators on the dashboard should be green.
Stop: `docker compose down` (add `-v` to delete the database).

## Next steps

2. Realistic sensor simulation (traffic dynamics, incidents, emergency vehicles)
3. Node-RED processing: validation, density/flow, congestion detection
4. Signal optimization (Webster) + emergency pre-emption
5. Backend: MongoDB models, REST API, Socket.IO events
6. Dashboard: live monitoring, congestion map, analytics, alerts, signal control
