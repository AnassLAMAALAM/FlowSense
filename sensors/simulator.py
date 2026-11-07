"""
Step 1 - Basic virtual traffic sensor.
Publishes a simple reading for each intersection every INTERVAL_SEC seconds
on MQTT topic traffic/sensors/<intersectionId>.
(Realistic traffic dynamics come in a later step.)
"""
import json
import os
import random
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
INTERVAL_SEC = float(os.getenv("INTERVAL_SEC", "5"))
INTERSECTIONS = ["INT-001", "INT-002", "INT-003", "INT-004", "INT-005", "INT-006"]


def reading(intersection_id):
    return {
        "sensorId": f"SENSOR-{intersection_id}",
        "intersectionId": intersection_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "vehicleCount": random.randint(5, 60),
        "avgSpeed": round(random.uniform(10, 60), 1),
        "occupancy": round(random.uniform(2, 80), 1),
        "emergency": {"detected": random.random() < 0.02},
    }


def main():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="traffic-sim")
    while True:
        try:
            client.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
            break
        except OSError as exc:
            print(f"[sim] broker not reachable ({exc}); retrying in 3s", flush=True)
            time.sleep(3)
    client.loop_start()
    print(f"[sim] connected to mqtt://{MQTT_HOST}:{MQTT_PORT}", flush=True)
    while True:
        for i in INTERSECTIONS:
            client.publish(f"traffic/sensors/{i}", json.dumps(reading(i)))
        print(f"[sim] published {len(INTERSECTIONS)} readings", flush=True)
        time.sleep(INTERVAL_SEC)


if __name__ == "__main__":
    main()
