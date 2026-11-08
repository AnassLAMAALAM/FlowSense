# FlowSense - create all project tickets as GitHub issues and add them to project board #8
# Requirements: GitHub CLI  ->  winget install GitHub.cli
#               then:        gh auth login
#               then:        gh auth refresh -s project      (permission to edit project boards)
# Run:  powershell -ExecutionPolicy Bypass -File .\create-tickets.ps1

$ErrorActionPreference = "Stop"
$Repo    = "AnassLAMAALAM/FlowSense"
$Owner   = "AnassLAMAALAM"
$Project = 8

# ---------- labels (one per epic) ----------
$labels = @(
  @{ name = "epic: setup";      color = "5f5e5a"; desc = "Epic 1 - Project setup" },
  @{ name = "epic: sensors";    color = "1baf7a"; desc = "Epic 2 - IoT sensor layer" },
  @{ name = "epic: node-red";   color = "6250d6"; desc = "Epic 3 - Node-RED processing" },
  @{ name = "epic: backend";    color = "2a78d6"; desc = "Epic 4 - Backend (Node.js + MongoDB)" },
  @{ name = "epic: dashboard";  color = "eb6834"; desc = "Epic 5 - React dashboard" },
  @{ name = "epic: quality";    color = "e87ba4"; desc = "Epic 6 - Quality and delivery" }
)
foreach ($l in $labels) {
  gh label create $l.name --repo $Repo --color $l.color --description $l.desc --force | Out-Null
  Write-Host "label: $($l.name)"
}

# ---------- tickets ----------
$tickets = @(
  @{ id="ST-1";  label="epic: setup"; done=$true; title="Set up Docker project skeleton";
     body="Docker Compose with Mosquitto, MongoDB, Node-RED, backend, sensors and dashboard.`n`n**Acceptance criteria**`n- [x] ``docker compose up -d --build`` starts all 6 services`n- [x] Every status indicator on the dashboard is green" },

  @{ id="ST-2";  label="epic: sensors"; title="Realistic traffic simulator";
     body="6 intersections x 4 approaches (N/S/E/W). Measures vehicle count, speed, occupancy and queue length, with morning and evening rush hours.`n`n**Acceptance criteria**`n- [ ] Values follow a daily demand profile`n- [ ] Queues build up at peak times and clear afterwards" },
  @{ id="ST-3";  label="epic: sensors"; title="Incidents and emergency vehicles";
     body="Random incidents that reduce road capacity, plus ambulance / fire / police vehicles with an approach direction and distance.`n`n**Acceptance criteria**`n- [ ] Both appear in the MQTT payload`n- [ ] Probabilities are configurable (EMERGENCY_PROB, INCIDENT_PROB)" },
  @{ id="ST-4";  label="epic: sensors"; title="Sensors react to signal timings";
     body="The simulator subscribes to ``traffic/signals/<id>``; the green time it receives changes how many vehicles get through.`n`n**Acceptance criteria**`n- [ ] A longer green on one direction shortens that direction's queue" },

  @{ id="ST-5";  label="epic: node-red"; title="Data validation";
     body="Reject malformed, stale or duplicate readings; clamp out-of-range values.`n`n**Acceptance criteria**`n- [ ] Invalid messages are rejected and the reason is shown in the debug panel" },
  @{ id="ST-6";  label="epic: node-red"; title="Traffic metrics and congestion detection";
     body="Compute flow (veh/h), density and a congestion score (0-1). Classify each intersection as free / moderate / heavy / severe.`n`n**Acceptance criteria**`n- [ ] Alerts fire only when entering heavy/severe and when clearing (no spam)" },
  @{ id="ST-7";  label="epic: node-red"; title="Adaptive signal optimization (Webster)";
     body="Cycle length and green split calculated from traffic demand, published to ``traffic/signals/<id>``.`n`n**Acceptance criteria**`n- [ ] The busier direction gets the longer green`n- [ ] Cycle stays between 40 and 150 s, minimum green 10 s" },
  @{ id="ST-8";  label="epic: node-red"; title="Emergency vehicle priority";
     body="Give green to the emergency vehicle's approach, raise a critical alert, return to normal control after it passes.`n`n**Acceptance criteria**`n- [ ] Signal switches within one reading of detection" },

  @{ id="ST-9";  label="epic: backend"; title="MongoDB models";
     body="Collections: intersections, traffic readings, vehicle records, alerts, signal configs, signal history.`n`n**Acceptance criteria**`n- [ ] Indexes created`n- [ ] Traffic history auto-deleted after 30 days (TTL)" },
  @{ id="ST-10"; label="epic: backend"; title="Ingestion endpoint and REST API";
     body="``POST /api/ingest`` (token-protected) plus endpoints for intersections, history, analytics, alerts and signals.`n`n**Acceptance criteria**`n- [ ] Invalid input returns 400 with a clear message" },
  @{ id="ST-11"; label="epic: backend"; title="Real-time WebSocket events (Socket.IO)";
     body="Events: ``traffic:update``, ``alert:new``, ``signal:update``, ``emergency``.`n`n**Acceptance criteria**`n- [ ] Dashboard updates without reloading the page" },
  @{ id="ST-12"; label="epic: backend"; title="Manual signal control";
     body="``PUT /api/signals/:id`` sends manual timings to Node-RED over MQTT, or switches back to adaptive mode.`n`n**Acceptance criteria**`n- [ ] Manual plan stays until released`n- [ ] Every change is recorded in signal history" },

  @{ id="ST-13"; label="epic: dashboard"; title="Live monitoring page";
     body="KPIs, a card per intersection, signal phase bar, emergency banner.`n`n**Acceptance criteria**`n- [ ] All values update live over WebSocket" },
  @{ id="ST-14"; label="epic: dashboard"; title="Congestion map";
     body="Leaflet map with markers coloured by congestion level and roads coloured between intersections.`n`n**Acceptance criteria**`n- [ ] Clicking an intersection shows its details" },
  @{ id="ST-15"; label="epic: dashboard"; title="Analytics page";
     body="Charts for flow, speed and occupancy over time, congestion per intersection, time-window filter.`n`n**Acceptance criteria**`n- [ ] Charts read from stored MongoDB history`n- [ ] Window filter: 15 min / 1 h / 6 h / 24 h" },
  @{ id="ST-16"; label="epic: dashboard"; title="Alerts page";
     body="Filter by status, acknowledge one or all alerts, pop-up notifications for new alerts.`n`n**Acceptance criteria**`n- [ ] New alerts appear live without refresh" },
  @{ id="ST-17"; label="epic: dashboard"; title="Signal control page";
     body="Sliders for NS / EW green time, return-to-adaptive button, plan history.`n`n**Acceptance criteria**`n- [ ] Manual plan is applied end-to-end (dashboard -> backend -> MQTT -> Node-RED -> sensors)" },

  @{ id="ST-18"; label="epic: quality"; title="End-to-end testing";
     body="Check the full path: sensor -> MQTT -> Node-RED -> API -> MongoDB -> WebSocket -> dashboard.`n`n**Acceptance criteria**`n- [ ] No rejected or failed messages over a 10-minute run" },
  @{ id="ST-19"; label="epic: quality"; title="Documentation and diagrams";
     body="README, architecture diagram and functional diagram for the report.`n`n**Acceptance criteria**`n- [ ] Anyone can run the project from the README alone" }
)

# skip tickets that already exist (safe to run twice)
$existing = gh issue list --repo $Repo --state all --limit 200 --json title --jq ".[].title"

foreach ($t in $tickets) {
  $title = "[$($t.id)] $($t.title)"
  if ($existing -contains $title) { Write-Host "exists, skipped: $title"; continue }

  $url = gh issue create --repo $Repo --title $title --body $t.body --label $t.label
  Write-Host "created: $title  ->  $url"

  gh project item-add $Project --owner $Owner --url $url | Out-Null
  Write-Host "   added to project #$Project"

  if ($t.done) {
    gh issue close $url --reason completed | Out-Null
    Write-Host "   closed (already done)"
  }
}

Write-Host ""
Write-Host "Done. Open your board: https://github.com/users/$Owner/projects/$Project"
