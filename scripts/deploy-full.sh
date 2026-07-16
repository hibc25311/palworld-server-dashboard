#!/usr/bin/env bash
# One-command bring-up for docker-compose.full.yml (palworld server + dashboard).
# Handles the two-phase first boot: let the official image generate a real
# PalWorldSettings.ini from env vars first, then lock the ini once the server
# is healthy. Only recreates the server when the lock actually needs to happen.
#
# When to run this: fresh deploys, and after updating the dashboard code
# (it rebuilds the image). Day-to-day you don't need it — containers restart
# on their own (restart: unless-stopped), and a plain server restart is just
# `docker compose -f docker-compose.full.yml restart palworld`.
# Safe to re-run any time; it won't touch server settings once the ini is locked.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.full.yml"
INI_PATH="data/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini"
HEALTH_TIMEOUT=1800   # seconds; first boot downloads the game binary, give it time
MIN_INI_BYTES=100

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Edit the password fields (PALWORLD_SERVER_PASSWORD etc.) and run this script again."
  exit 1
fi

$COMPOSE up -d --build

echo "Waiting for palworld to boot and pass its health check (first boot downloads the game binary, this can take several minutes)..."
elapsed=0
while true; do
  health="$(docker inspect palworld-server --format '{{.State.Health.Status}}' 2>/dev/null || echo unknown)"
  state="$(docker inspect palworld-server --format '{{.State.Status}}' 2>/dev/null || echo unknown)"

  if [ "$state" != "running" ]; then
    echo "palworld container is not running (current state: $state). Last logs:"
    docker logs --tail 30 palworld-server 2>&1 || true
    exit 1
  fi

  if docker logs palworld-server 2>&1 | tail -5 | grep -q '^Killed$'; then
    echo "The server process was killed by the system (OOM). Palworld needs at least 8GB of RAM."
    echo "On Mac/Windows with colima, try: colima start --cpu 4 --memory 8. With Docker Desktop, raise the memory limit in settings."
    exit 1
  fi

  [ "$health" = "healthy" ] && break

  if [ "$elapsed" -ge "$HEALTH_TIMEOUT" ]; then
    echo "Still not healthy after ${HEALTH_TIMEOUT}s. Check it yourself: docker logs -f palworld-server"
    exit 1
  fi

  sleep 15
  elapsed=$((elapsed + 15))
done

if [ ! -f "$INI_PATH" ] || [ "$(wc -c < "$INI_PATH")" -lt "$MIN_INI_BYTES" ]; then
  echo "palworld reports healthy but $INI_PATH looks empty. The image may not have generated the config yet; wait a bit and re-run this script."
  exit 1
fi

echo "palworld is healthy and the config file has been generated."

if grep -q '^DISABLE_GENERATE_SETTINGS=false' .env; then
  echo "Locking the ini so settings written by the dashboard won't be overwritten by env vars..."
  sed -i.bak 's/^DISABLE_GENERATE_SETTINGS=false/DISABLE_GENERATE_SETTINGS=true/' .env
  rm -f .env.bak
  $COMPOSE up -d --force-recreate palworld
  echo "Locked."
else
  echo "The ini is already locked; no recreate needed."
fi

echo ""
echo "Done. Dashboard: http://localhost:3000"
echo "Log in with the AdminPassword in PalWorldSettings.ini (see data/Pal/Saved/Config/LinuxServer/)."
echo "PALWORLD_ADMIN_PASSWORD in .env is only used for the initial ini generation — do not change it after lock."
