"""
FlowSense - Virtual Traffic Sensor Generator (step 2)
=====================================================

Simulates IoT traffic sensors at 6 signalised intersections in Jerez de la
Frontera and publishes their measurements over MQTT.

Each intersection has four approaches (N, S, E, W). Every tick the simulator:
  * generates vehicle arrivals from a time-of-day demand profile
    (morning and evening rush hours, quiet nights) with random noise,
  * lets vehicles through according to the green time the traffic light
    currently gives that approach (default fixed plan, or the plan received
    on traffic/signals/<id>), so queues build up and clear realistically,
  * derives vehicle count, average speed, road occupancy and queue length,
  * occasionally creates an incident (capacity drop on one approach),
  * occasionally injects an emergency vehicle (ambulance / fire / police),
  * applies the current weather (rain / fog slow traffic down).

Simulated time
--------------
The simulator runs on an accelerated clock so a full day can be observed
quickly: with SIM_TIME_SCALE=60 one real second is one simulated minute and a
day lasts 24 real minutes. Every tick (INTERVAL_SEC real seconds) therefore
covers a measurement window of INTERVAL_SEC * SIM_TIME_SCALE simulated seconds
(5 s * 60 = 5 simulated minutes).

MQTT topics
-----------
  publish    traffic/sensors/<intersectionId>   sensor reading (JSON)
  publish    traffic/status/simulator           {"online": true|false} (retained)
  subscribe  traffic/signals/<intersectionId>   signal plan (from Node-RED, step 4)
  subscribe  traffic/weather                    current weather (from backend, weather step)

Environment variables
---------------------
  MQTT_HOST (localhost)   MQTT_PORT (1883)   INTERVAL_SEC (5)
  SIM_TIME_SCALE (60)     simulated seconds per real second
  START_HOUR (now)        simulated hour to start at, e.g. 7.5 to start just before rush hour
  EMERGENCY_PROB (0.01)   chance per intersection per tick of an emergency vehicle
  INCIDENT_PROB (0.0015)  chance per approach per tick of an incident
  WEATHER (clear)         initial weather: clear | rain | heavy_rain | fog | storm
  SEED                    fixed random seed (reproducible runs)

Run without a broker to inspect the output:
  python simulator.py --dry-run          print one reading
  python simulator.py --day              print a simulated 24 h summary
"""

import json
import math
import os
import random
import signal
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

# ---------------------------------------------------------------- settings
MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
INTERVAL_SEC = float(os.getenv("INTERVAL_SEC", "5"))
SIM_TIME_SCALE = float(os.getenv("SIM_TIME_SCALE", "60"))
START_HOUR = os.getenv("START_HOUR")
EMERGENCY_PROB = float(os.getenv("EMERGENCY_PROB", "0.01"))
INCIDENT_PROB = float(os.getenv("INCIDENT_PROB", "0.0015"))
INITIAL_WEATHER = os.getenv("WEATHER", "clear")
if os.getenv("SEED"):
    random.seed(int(os.environ["SEED"]))

WINDOW_SEC = INTERVAL_SEC * SIM_TIME_SCALE  # simulated seconds covered by one tick

# ---------------------------------------------------------------- traffic model
APPROACHES = ("N", "S", "E", "W")
SATURATION_FLOW = 1800        # vehicles / hour / lane while the light is green
VEHICLE_LENGTH_M = 6.5        # average vehicle length incl. gap (for occupancy)
DETECTION_ZONE_M = 120        # length of road each sensor observes, per lane
QUEUE_STORAGE_PER_LANE = 60   # max vehicles that fit between intersections (~400 m)

# Default fixed-time plan (used until Node-RED sends adaptive plans in step 4)
DEFAULT_PLAN = {"cycleLength": 90, "nsGreen": 40, "ewGreen": 40}

# Six intersections in a 2 x 3 grid. Must match the backend seed data.
# "vc" = peak volume/capacity ratio per approach under the default fixed plan
# (> 1.0 means that approach overflows at the evening peak).
INTERSECTIONS = [
    {"id": "INT-001", "lanes": 2, "free_flow": 50, "vc": {"N": 1.05, "S": 0.95, "E": 0.75, "W": 0.80}},
    {"id": "INT-002", "lanes": 3, "free_flow": 50, "vc": {"N": 1.15, "S": 1.10, "E": 0.60, "W": 0.65}},
    {"id": "INT-003", "lanes": 2, "free_flow": 50, "vc": {"N": 0.60, "S": 0.65, "E": 1.05, "W": 1.00}},
    {"id": "INT-004", "lanes": 2, "free_flow": 40, "vc": {"N": 0.85, "S": 0.80, "E": 0.85, "W": 0.80}},
    {"id": "INT-005", "lanes": 3, "free_flow": 50, "vc": {"N": 0.70, "S": 0.65, "E": 1.20, "W": 1.15}},
    {"id": "INT-006", "lanes": 1, "free_flow": 30, "vc": {"N": 0.90, "S": 0.85, "E": 0.80, "W": 0.85}},
]
PEAK_MULTIPLIER = 1.5  # value of day_profile() at the evening peak

VEHICLE_TYPES = [("car", 0.78), ("van", 0.10), ("truck", 0.05), ("bus", 0.04), ("motorbike", 0.03)]
EMERGENCY_TYPES = ("ambulance", "fire_truck", "police")

# Weather effects: (capacity factor, speed factor, demand factor)
WEATHER_EFFECTS = {
    "clear":      (1.00, 1.00, 1.00),
    "cloudy":     (1.00, 1.00, 1.00),
    "rain":       (0.90, 0.88, 1.05),
    "heavy_rain": (0.80, 0.75, 1.10),
    "fog":        (0.85, 0.70, 1.00),
    "storm":      (0.75, 0.65, 0.90),
}


def day_profile(sim_hour: float) -> float:
    """Demand multiplier over the day: morning peak ~08:15, evening peak ~18:00, quiet night."""
    morning = 0.95 * math.exp(-((sim_hour - 8.25) ** 2) / 1.2)
    evening = 1.05 * math.exp(-((sim_hour - 18.0) ** 2) / 1.8)
    midday = 0.25 * math.exp(-((sim_hour - 13.5) ** 2) / 3.0)
    day_level = 0.10 + 0.35 * (1 / (1 + math.exp(-(sim_hour - 6.5) * 2))) * (1 / (1 + math.exp((sim_hour - 22.5) * 2)))
    return day_level + morning + evening + midday


@dataclass
class Approach:
    name: str
    base_demand: float          # vehicles / hour when day_profile() == 1
    queue: float = 0.0          # vehicles waiting
    incident_ticks: int = 0     # remaining ticks of an active incident


class Intersection:
    def __init__(self, cfg: dict):
        self.id = cfg["id"]
        self.lanes = cfg["lanes"]
        self.free_flow = cfg["free_flow"]
        self.seq = 0
        self.emergency = None
        self.emergency_ticks = 0
        self.plan = dict(DEFAULT_PLAN, preemptApproach=None, mode="fixed")
        # capacity of one approach under the default plan -> base demand from v/c ratio
        default_ratio = DEFAULT_PLAN["nsGreen"] / DEFAULT_PLAN["cycleLength"]
        cap = SATURATION_FLOW * self.lanes * default_ratio
        self.approaches = {
            a: Approach(a, base_demand=cfg["vc"][a] * cap / PEAK_MULTIPLIER) for a in APPROACHES
        }

    def green_ratio(self, approach: str) -> float:
        """Share of the cycle during which this approach has green."""
        p = self.plan
        if p.get("preemptApproach"):
            same_phase = (p["preemptApproach"] in ("N", "S")) == (approach in ("N", "S"))
            return 0.9 if same_phase else 0.05
        green = p["nsGreen"] if approach in ("N", "S") else p["ewGreen"]
        return max(0.05, min(0.9, green / max(p["cycleLength"], 1)))

    def step(self, hour: float, weather: str) -> dict:
        self.seq += 1
        cap_f, speed_f, demand_f = WEATHER_EFFECTS.get(weather, WEATHER_EFFECTS["clear"])
        mult = day_profile(hour) * demand_f
        dt_h = WINDOW_SEC / 3600
        detection_capacity = self.lanes * DETECTION_ZONE_M / VEHICLE_LENGTH_M
        storage = self.lanes * QUEUE_STORAGE_PER_LANE

        # ---- emergency vehicle lifecycle (lasts a few ticks while it approaches)
        if self.emergency:
            self.emergency_ticks -= 1
            self.emergency["distanceM"] = max(0, self.emergency["distanceM"] - random.randint(60, 120))
            if self.emergency_ticks <= 0:
                self.emergency = None
        elif random.random() < EMERGENCY_PROB:
            self.emergency = {
                "detected": True,
                "vehicleId": f"EV-{uuid.uuid4().hex[:5].upper()}",
                "type": random.choice(EMERGENCY_TYPES),
                "approach": random.choice(APPROACHES),
                "distanceM": random.randint(250, 450),
            }
            self.emergency_ticks = random.randint(3, 5)

        readings, vehicles = [], []
        for a in self.approaches.values():
            # ---- incidents: capacity drop on one approach for 6-18 ticks (30-90 sim min)
            if a.incident_ticks > 0:
                a.incident_ticks -= 1
            elif random.random() < INCIDENT_PROB:
                a.incident_ticks = random.randint(6, 18)
            incident = a.incident_ticks > 0

            # ---- arrivals (Poisson-like) and departures (limited by green time)
            demand_vph = a.base_demand * mult * random.uniform(0.9, 1.1)
            expected = demand_vph * dt_h
            arrivals = max(0.0, random.gauss(expected, math.sqrt(max(expected, 1e-6))))
            capacity = SATURATION_FLOW * self.lanes * self.green_ratio(a.name) * dt_h * cap_f
            if incident:
                capacity *= 0.4
            departures = min(a.queue + arrivals, capacity * random.uniform(0.95, 1.03))
            # vehicles that don't fit in the queue reroute (spill-back)
            a.queue = min(storage, max(0.0, a.queue + arrivals - departures))

            # ---- derived measurements
            flow_vph = departures / dt_h
            moving_density = flow_vph / self.lanes / max(self.free_flow * 0.7, 5)       # veh/km/lane
            occupancy = a.queue / detection_capacity * 100 + moving_density * VEHICLE_LENGTH_M / 10
            occupancy = min(98.0, max(0.5, occupancy + random.uniform(-1.5, 1.5)))
            speed = self.free_flow * max(0.08, 1 - (occupancy / 100) ** 1.4) * speed_f
            if incident:
                speed *= 0.5
            speed = max(2.0, speed * random.uniform(0.94, 1.04))
            count = int(round(departures))

            readings.append({
                "approach": a.name,
                "vehicleCount": count,
                "avgSpeed": round(speed, 1),
                "occupancy": round(occupancy, 1),
                "queueLength": int(round(a.queue)),
                "incident": incident,
            })

            # ---- notable individual detections (speeding cars, heavy vehicles)
            for _ in range(min(count, 3)):
                vtype = random.choices([t for t, _ in VEHICLE_TYPES], [w for _, w in VEHICLE_TYPES])[0]
                vspeed = max(1.0, random.gauss(speed, speed * 0.18))
                if vspeed > self.free_flow * 1.2 or vtype in ("truck", "bus"):
                    vehicles.append({
                        "vehicleId": f"V-{uuid.uuid4().hex[:6].upper()}",
                        "type": vtype,
                        "speed": round(vspeed, 1),
                        "approach": a.name,
                        "isEmergency": False,
                    })

        if self.emergency:
            vehicles.append({
                "vehicleId": self.emergency["vehicleId"],
                "type": self.emergency["type"],
                "speed": round(random.uniform(35, 60), 1),
                "approach": self.emergency["approach"],
                "isEmergency": True,
            })

        return {
            "sensorId": f"SENSOR-{self.id}",
            "intersectionId": self.id,
            "seq": self.seq,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "intervalSec": WINDOW_SEC,          # measurement window in simulated seconds
            "simHour": round(hour, 2),
            "lanes": self.lanes,
            "freeFlowSpeed": self.free_flow,
            "weather": weather,
            "signal": {k: self.plan[k] for k in ("mode", "cycleLength", "nsGreen", "ewGreen", "preemptApproach")},
            "approaches": readings,
            "vehicles": vehicles,
            "emergency": dict(self.emergency) if self.emergency else {"detected": False},
        }


class Simulator:
    def __init__(self):
        self.intersections = {cfg["id"]: Intersection(cfg) for cfg in INTERSECTIONS}
        self.weather = INITIAL_WEATHER
        self.running = True
        self.real_start = time.time()
        now = datetime.now()
        self.start_hour = float(START_HOUR) if START_HOUR else now.hour + now.minute / 60
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"flowsense-sim-{uuid.uuid4().hex[:6]}")
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.client.will_set("traffic/status/simulator", json.dumps({"online": False}), retain=True)

    def sim_hour(self) -> float:
        return (self.start_hour + (time.time() - self.real_start) * SIM_TIME_SCALE / 3600) % 24

    # ---------------- MQTT callbacks
    def on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code.is_failure:
            print(f"[sim] MQTT connect failed: {reason_code}", flush=True)
            return
        print(f"[sim] connected to mqtt://{MQTT_HOST}:{MQTT_PORT}", flush=True)
        client.subscribe([("traffic/signals/+", 1), ("traffic/weather", 1)])
        client.publish("traffic/status/simulator", json.dumps({"online": True}), retain=True)

    def on_message(self, client, userdata, msg):
        try:
            data = json.loads(msg.payload)
        except ValueError:
            print(f"[sim] ignored non-JSON message on {msg.topic}", flush=True)
            return
        if msg.topic == "traffic/weather":
            condition = data.get("condition")
            if condition in WEATHER_EFFECTS and condition != self.weather:
                print(f"[sim] weather changed: {self.weather} -> {condition}", flush=True)
                self.weather = condition
            return
        inter = self.intersections.get(msg.topic.rsplit("/", 1)[-1])
        if not inter:
            return
        try:
            ns, ew = float(data.get("nsGreen", inter.plan["nsGreen"])), float(data.get("ewGreen", inter.plan["ewGreen"]))
            cycle = float(data.get("cycleLength", ns + ew + 10))
            if ns < 0 or ew < 0 or cycle <= 0:
                raise ValueError("negative timing")
        except (TypeError, ValueError) as exc:
            print(f"[sim] bad signal plan on {msg.topic}: {exc}", flush=True)
            return
        inter.plan = {"mode": data.get("mode", "adaptive"), "cycleLength": cycle, "nsGreen": ns, "ewGreen": ew,
                      "preemptApproach": data.get("preemptApproach")}

    # ---------------- main loop
    def run(self):
        while self.running:
            try:
                self.client.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
                break
            except OSError as exc:
                print(f"[sim] broker not reachable ({exc}); retrying in 3s", flush=True)
                time.sleep(3)
        self.client.loop_start()
        next_tick = time.time()
        while self.running:
            hour = self.sim_hour()
            queued = 0
            for inter in self.intersections.values():
                reading = inter.step(hour, self.weather)
                queued += sum(a["queueLength"] for a in reading["approaches"])
                self.client.publish(f"traffic/sensors/{inter.id}", json.dumps(reading))
            print(f"[sim] {int(hour):02d}:{int(hour % 1 * 60):02d} demand x{day_profile(hour):.2f} "
                  f"weather={self.weather} queued={queued} published={len(self.intersections)}", flush=True)
            next_tick += INTERVAL_SEC
            time.sleep(max(0.0, next_tick - time.time()))
        self.client.publish("traffic/status/simulator", json.dumps({"online": False}), retain=True)
        self.client.loop_stop()
        self.client.disconnect()

    def stop(self, *_):
        self.running = False


def simulate_day(weather: str = INITIAL_WEATHER):
    """Offline check: run 24 simulated hours and print hourly queue/speed per intersection."""
    inters = [Intersection(cfg) for cfg in INTERSECTIONS]
    ticks_per_hour = int(3600 / WINDOW_SEC)
    print(f"weather={weather}  window={WINDOW_SEC:.0f}s  (queue / avg speed km/h per intersection)")
    print("hour  demand  " + "  ".join(f"{i.id:>13}" for i in inters))
    for h in range(24):
        last = {}
        for t in range(ticks_per_hour):
            hour = h + t / ticks_per_hour
            for i in inters:
                last[i.id] = i.step(hour, weather)
        cells = []
        for i in inters:
            r = last[i.id]
            q = sum(a["queueLength"] for a in r["approaches"])
            v = sum(a["avgSpeed"] for a in r["approaches"]) / 4
            cells.append(f"{q:>5} / {v:>5.1f}")
        print(f"{h:02d}:00  x{day_profile(h):.2f}   " + "  ".join(f"{c:>13}" for c in cells))


if __name__ == "__main__":
    if "--dry-run" in sys.argv:
        print(json.dumps(Intersection(INTERSECTIONS[0]).step(18.0, INITIAL_WEATHER), indent=2))
        sys.exit(0)
    if "--day" in sys.argv:
        simulate_day()
        sys.exit(0)
    sim = Simulator()
    signal.signal(signal.SIGINT, sim.stop)
    signal.signal(signal.SIGTERM, sim.stop)
    sim.run()
