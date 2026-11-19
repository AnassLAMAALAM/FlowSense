# Deploying FlowSense (same VM as Vevora)

FlowSense uses the same pipeline as Vevora (EventBookingPlatform) and runs **on the same EC2 VM**, next to it:

| | Vevora | FlowSense |
|---|---|---|
| Folder on the VM | `~/eventbookingplatform` | `~/flowsense` |
| Compose project | `eventbookingplatform` | `flowsense` |
| Public ports | `80`, `443` | **`8080`** (dashboard) |
| URL | `https://16.171.47.208.sslip.io/` | `http://16.171.47.208:8080/` |

The two stacks have separate networks, volumes and containers, so deploying one never restarts the other.

On every push to `dev`, GitHub Actions:
1. **test**: syntax-checks the backend, builds the dashboard, validates the Node-RED flows and the sensor simulator.
2. **build-and-push**: builds 4 images (`flowsense-backend`, `flowsense-dashboard`, `flowsense-node-red`,
   `flowsense-sensors`) and pushes them to ghcr.io.
3. **deploy**: SSHes into the VM, copies `docker-compose.prod.yml` and `mosquitto/mosquitto.conf` to `~/flowsense`,
   pulls the new images and runs `docker compose up -d`. The VM never builds anything.

Pull requests to `dev` / `main` only run the tests.

## What is reachable from the internet

Only the dashboard on port **8080**. Its nginx forwards `/api/*` (REST + Swagger at `/api/docs`) and `/socket.io/`
(live updates) to the backend, so the backend, MongoDB and Mosquitto are **not** published.
Node-RED's editor listens on the VM's `127.0.0.1:1880` only. To open it from your PC:

```bash
ssh -i <your-key>.pem -L 1880:localhost:1880 ubuntu@16.171.47.208
# then browse to http://localhost:1880
```

## One-time setup

### 1. GitHub secrets (FlowSense repo)

Secrets are per repository, so add the **same three values as in the Vevora repo** under
Settings -> Secrets and variables -> Actions:

| Secret | Value |
|---|---|
| `EC2_HOST` | `16.171.47.208` |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Full contents of the same `.pem` private key |

### 2. Open port 8080 on the VM

AWS console -> EC2 -> the instance -> Security -> Security group -> Edit inbound rules -> add
**Custom TCP, port 8080, source 0.0.0.0/0**.

### 3. Add swap (strongly recommended)

The VM is a 1 GB free-tier box already running Vevora (Postgres, Redis, .NET API, nginx). FlowSense adds MongoDB,
Node-RED, the Node backend, the Python sensors and Mosquitto. The compose file caps each container's memory and
shrinks MongoDB's cache to the minimum, but without swap the kernel may still kill containers. Run once:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -m   # "Swap: 2047" should appear
```

If the VM still struggles (`free -m` shows almost no free memory, containers restarting), move to a `t3.small` (2 GB).

### 4. First deploy

Push (or merge) into `dev`. The first run creates `~/flowsense/.env` on the VM with random `INGEST_TOKEN` and
`NODE_RED_CREDENTIAL_SECRET`, so there is nothing to set up by hand. See `.env.example` for what it contains.

### 5. Make the images public

After the first successful workflow run, go to your GitHub profile -> Packages and set the four `flowsense-*`
packages to **Public** (same as Vevora's images). Until then the VM cannot pull them and the deploy step fails at
`docker compose pull`. Re-run the workflow after changing it.

## Day-to-day commands on the VM

```bash
cd ~/flowsense
export REGISTRY=ghcr.io IMAGE_OWNER=anasslamaalam IMAGE_TAG=latest
docker compose -f docker-compose.prod.yml --env-file .env ps
docker compose -f docker-compose.prod.yml --env-file .env logs -f backend
docker compose -f docker-compose.prod.yml --env-file .env restart sensors
docker stats --no-stream            # memory use of both apps' containers
```

## Changing the port

Edit `DASHBOARD_PORT` in `~/flowsense/.env` on the VM, open the new port in the security group, then
`docker compose -f docker-compose.prod.yml --env-file .env up -d dashboard`. Don't use 80 or 443, Vevora has them.

## Resetting the data

**Deletes all readings, alerts and signal history. Cannot be undone.**

From GitHub: Actions -> "Test, build and deploy (dev)" -> Run workflow on `dev`, tick *reset_database* and type
`DELETE-ALL-DATA` in *confirm*. This only touches the `flowsense_mongo-data` volume, never Vevora's database.
