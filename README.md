# Palworld Server Dashboard

Palworld Server Dashboard is a browser-based admin panel for managing a Palworld dedicated server through its REST API.

It gives you one place to handle the jobs you do most often:

- checking whether the server is healthy
- watching live player activity
- sending announcements
- kicking, banning, and unbanning players
- viewing live map positions
- monitoring FPS, uptime, and other server metrics

Built with Next.js, designed for self-hosting, and meant to feel much friendlier than working with raw API calls.

## Live Demo 🌐

[Open the live demo](https://palworld-server-dashboard.vercel.app/)

## Preview 🖼️

Sensitive data in the dashboard screenshot below has been blurred.

### Dashboard

![Palworld Server Dashboard screenshot with sensitive data blurred](public/readme/dashboard-preview-redacted.png)

### Login Screen

![Palworld Server Dashboard login screen](public/readme/login-preview.png)

### Live Map

![Palworld Server Dashboard live map screen](public/readme/live-map-preview.png)

## Table of Contents

- [Live Demo](#live-demo-)
- [Project Status](#project-status-)
- [Overview](#overview-)
- [Features](#features-)
- [How It Works](#how-it-works-)
- [Requirements](#requirements-)
- [Docker Quick Start](#docker-quick-start-)
- [First Connection Walkthrough](#first-connection-walkthrough-)
- [Quick Start](#quick-start-)
- [Available Scripts](#available-scripts-)
- [Development Notes](#development-notes-)
- [Production and Deployment](#production-and-deployment-)
- [Security Notes](#security-notes-)
- [Project Structure](#project-structure-)
- [UI Library and Styling](#ui-library-and-styling-)
- [Troubleshooting](#troubleshooting-)
- [Contributing](#contributing-)
- [Tech Stack](#tech-stack-)
- [License](#license-)

## Project Status ⚠️

This is a hobby project that was largely vibe-coded and shared in good faith, so expect rough edges, bugs, missing safeguards, and breaking changes over time.

Please treat it as a self-hosted community tool, not a guaranteed production platform. You are responsible for reviewing, testing, securing, and operating your own deployment.

## Overview 🎮

Running a game server usually means doing a lot of repetitive operational work:

- checking if the server is online
- seeing who is connected
- warning players before maintenance
- saving the world before a restart
- watching performance when the server is under load

This dashboard brings those tasks together into a single control surface with a more approachable UI.

## Features ✨

### Dashboard Overview

The main dashboard gives you a quick read on the current state of the server, including:

- connection status
- online player count
- uptime
- server information
- world settings
- recent in-app console activity

### Player Management

You can manage players directly from the UI:

- view online players
- search by name or user ID
- kick players
- ban players
- unban players

### Server Operations

The control cards let you handle common admin actions:

- send custom announcements
- use quick preset messages
- save the world
- schedule restart warnings
- shut down the server
- force stop the server

### Metrics and Monitoring

The metrics panel helps you keep an eye on performance:

- live FPS
- FPS history graph
- frame time
- uptime
- player capacity
- world day

### Live Map

The map view shows:

- player positions
- optional fast travel markers
- optional boss tower markers
- zoom and pan controls
- grouped player markers when players are close together

### Server Settings Editor 🛠️

The Settings tab reads and writes the game's `PalWorldSettings.ini` directly (rates like EXP, capture, drop, work speed, and death penalty). Saving triggers a server restart so the new values take effect.

This requires the dashboard container to have read/write access to the file, so it's only available when running [docker-compose.full.yml](./docker-compose.full.yml) (or an equivalent setup where `PALWORLD_INI_PATH` points at a mounted `PalWorldSettings.ini`). It doesn't work with the plain [docker-compose.yml](./docker-compose.yml) setup, since that one doesn't mount a config volume.

Configuration:

- `PALWORLD_INI_PATH` - path to `PalWorldSettings.ini` inside the container (defaults to `/config/PalWorldSettings.ini`)
- `SETTINGS_EDITOR_PASSWORD` - optional second password required to save changes, separate from the dashboard's own connection password. Since this app has no built-in login, this is the only thing gating who can rewrite your server config if the dashboard is reachable on the network — set it.

### Visual Customization

The dashboard includes multiple built-in visual themes, so server admins can choose the look they prefer without changing the code.

## How It Works 🔌

The browser never talks to the Palworld REST API directly.

Instead, the frontend sends requests to a local Next.js API route, and that route forwards the request to your Palworld server. This gives the project a few practical benefits:

- the admin password is not placed in URL query strings
- browser code stays simpler
- requests can be normalized before forwarding them

The app also stores some state in the browser, such as recent server data and optional saved connection details.

## Requirements 📋

You will need:

- Node.js `20.9.0` or newer
- npm `10` or newer
- a Palworld server with the REST API enabled
- the admin password for that server

Before starting, make sure you know:

- `Server IP or URL`
- `REST API port`
- `Game port`
- `Admin password`

Typical defaults used by the UI are:

- `REST API port`: `8212`
- `Game port`: `8211`

The exact server-side setup depends on how your Palworld server is hosted. If you are using a hosted panel, Docker image, or custom server setup, check that provider's instructions for enabling the REST API.

## Docker Quick Start 🐳

If you just want to run the dashboard, you can pull the published container image instead of building from source.

Before using the commands below, install Docker first:

- Docker Desktop is the easiest recommended option because it includes Docker Engine and Docker Compose on Windows, macOS, and Linux
- if you are on Linux and already manage Docker yourself, Docker Engine plus the Docker Compose plugin also works

Official install docs:

- [Docker Desktop](https://docs.docker.com/desktop/)
- [Docker Compose](https://docs.docker.com/compose/install/)
- [Docker Engine](https://docs.docker.com/engine/install/)

### Pull the Image

```bash
docker pull ghcr.io/rnz01/palworld-server-dashboard:latest
```

### Run the Image

```bash
docker run -d \
  --name palworld-server-dashboard \
  --restart unless-stopped \
  -p 3000:3000 \
  ghcr.io/rnz01/palworld-server-dashboard:latest
```

Then open:

```text
http://localhost:3000
```

### Run with Docker Compose

This repository includes a ready-to-use [docker-compose.yml](./docker-compose.yml) that pulls the published image by default.

```bash
docker compose pull
docker compose up -d
```

Optional overrides:

- `PALWORLD_SERVER_DASHBOARD_IMAGE` to point at a different tag or registry
- `PALWORLD_SERVER_DASHBOARD_PORT` to change the host port

### Run Server and Dashboard Together

If you don't have a Palworld server yet, or want to manage server settings directly from the dashboard, use [docker-compose.full.yml](./docker-compose.full.yml) instead. It runs a Palworld dedicated server ([thijsvanloef/palworld-server-docker](https://github.com/thijsvanloef/palworld-server-docker)) alongside a dashboard built from this repo's source, and wires them together so the dashboard can read and write the server's `PalWorldSettings.ini` directly (see [Server Settings Editor](#server-settings-editor-)).

**Requirements:** the Palworld dedicated server needs at least 8GB RAM available to the container. On Linux hosts (including most cloud VMs) Docker uses the host's RAM directly, so just make sure the machine itself has enough. On macOS/Windows, Docker runs containers inside a VM (Docker Desktop, or `colima` if you're not using Docker Desktop) — that VM's own memory allocation needs to be raised to 8GB+, since it defaults much lower. If the server gets killed shortly after "Game version is..." in the logs, this is almost always why.

```bash
cp .env.example .env
# edit .env with real passwords
./scripts/deploy-full.sh
```

The first startup takes a while: the Palworld image downloads the dedicated server binary, and the dashboard is built from source. `deploy-full.sh` waits for the server to become healthy, then locks in `PalWorldSettings.ini` so the dashboard's Settings page can write to it without those changes getting overwritten on future restarts. Run it again any time (e.g. after a restart) — it's safe to re-run.

Day-to-day you rarely need the script again:

| Situation | What to do |
|---|---|
| Host machine reboots | Nothing — `restart: unless-stopped` brings both containers back automatically |
| Restart just the game server | `docker compose -f docker-compose.full.yml restart palworld` (or use the dashboard) |
| Updated the dashboard code | Re-run `./scripts/deploy-full.sh` — it rebuilds the image; the ini stays locked, so server settings are untouched |
| Fresh deploy on a new machine | `./scripts/deploy-full.sh` — this is what it's for |

<details>
<summary>What the script does, if you want to run it by hand or it fails partway</summary>

Bringing the stack up actually requires two steps, in order, because the official Palworld image and the dashboard's ini-editing feature want mutually exclusive things: the image needs to generate `PalWorldSettings.ini` itself on first boot (using the environment variables in `docker-compose.full.yml`, including enabling the REST API), but once that's done, it must stop touching the file so the dashboard's writes stick.

```bash
# 1. first boot: DISABLE_GENERATE_SETTINGS must be false (the default in
#    .env.example) so the image generates a real PalWorldSettings.ini
docker compose -f docker-compose.full.yml up -d --build

# wait for it to become healthy
docker compose -f docker-compose.full.yml ps

# 2. once confirmed healthy: set DISABLE_GENERATE_SETTINGS=true in .env,
#    then recreate just the palworld service so the ini file becomes the
#    source of truth from now on
docker compose -f docker-compose.full.yml up -d --force-recreate palworld
```

Doing step 2 too early (before the server has booted once) means the image never gets a chance to write real settings, leaving `PalWorldSettings.ini` empty and the REST API disabled — see [Troubleshooting](#troubleshooting-).

</details>

## First Connection Walkthrough 🧭

When you open the app, you will see the login/connect screen.

Fill in the fields like this:

### Server IP or URL

This is the host where your Palworld server can be reached.

Examples:

- `192.168.1.50`
- `play.example.com`
- `http://192.168.1.50`

### REST API Port

This is the Palworld REST API port, not the public gameplay port.

Default:

```text
8212
```

### Game Port

This is the gameplay port your server uses.

Default:

```text
8211
```

The dashboard stores this as part of the server profile so the UI can show the full server connection details.

### Admin Password

This is the password used to authenticate against the Palworld REST API.

### Remember Me

If enabled, the app stores the connection details in browser local storage on that machine so you do not need to re-enter them every time.

## Quick Start 🚀

Clone the project, install dependencies, and start the development server:

```bash
git clone <your-fork-or-repo-url>
cd palworld-server-dashboard
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

If you are developing from another device on your local network, the dev server also exposes a network URL when started.

## Available Scripts 🛠️

### `npm run dev`

Starts the Next.js development server.

### `npm run typecheck`

Generates Next.js route types and runs the TypeScript checker.

### `npm run build`

Creates a production build.

### `npm run start`

Starts the production server from a built app.

### `npm run check`

Runs the full local verification flow:

- typecheck
- production build

## Development Notes 💻

### Local Network Access

This project is configured to allow development access from the machine's active local IPv4 addresses. That helps when you want to open the app from a LAN address instead of only `localhost`.

### Type Generation

The typecheck script clears `.next` before regenerating route types. This avoids stale generated files causing false TypeScript errors after route changes.

## Production and Deployment 🌐

To create a production build:

```bash
npm run build
npm run start
```

The project uses Next.js standalone output, which makes self-hosting easier and is a good starting point for:

- VPS deployments
- internal dashboards
- containerized deployments
- reverse-proxy setups

### Container Image

The production container image is published to:

```text
ghcr.io/rnz01/palworld-server-dashboard:latest
```

The image is built from the included [Dockerfile](./Dockerfile) and runs the Next.js standalone server on port `3000`.

### Automatic Image Publishing

The repository includes a GitHub Actions workflow at [.github/workflows/publish-docker-image.yml](./.github/workflows/publish-docker-image.yml).

On every push to `main`, the workflow:

- builds the Docker image
- publishes it to GitHub Container Registry
- updates the `latest` tag
- publishes a commit-specific `sha-<commit>` tag

If this is the first time the package is published, verify the package visibility in GitHub Packages and set it to public if needed.

This app is best treated as an internal admin tool, not a public-facing website.

Recommended deployment patterns:

- private home lab or LAN
- VPN-only access
- reverse proxy with authentication
- internal server management network

## Security Notes 🔐

This project handles server admin access, so a few things are important.

### Good News

- the admin password is proxied through Next.js API routes
- the password is not sent in URL query strings
- the app does not require a separate database

### Important Tradeoff

If `Remember me` is enabled, the server IP, ports, and admin password are stored in browser local storage on that machine.

That means:

- it is convenient for trusted personal devices
- it is a bad idea on shared or public machines

### Recommended Practice

If you plan to deploy this for regular use:

- put it behind authentication
- keep it on a trusted network
- use HTTPS if exposed beyond your LAN
- avoid sharing browser profiles that have saved credentials

### Use at Your Own Risk

This project is provided as-is, without warranty or liability.

By using it, you accept responsibility for common self-hosting risks such as:

- misconfiguration
- downtime
- broken updates
- security exposure
- credential leakage on your own devices
- data loss or world-state issues
- moderation mistakes or unintended server actions

## Project Structure 🗂️

This is a quick guide to the main folders:

```text
app/          Next.js app routes, layout, providers, API routes
components/   UI components and dashboard panels
lib/          shared helpers, state, types, and Palworld request utilities
public/       static assets such as icons and map images
```

Some especially useful files:

- `app/api/palworld/[...path]/route.ts` - proxy route to the Palworld REST API
- `app/api/settings-file/route.ts` - reads and writes `PalWorldSettings.ini`
- `components/settings-editor.tsx` - Settings editor UI used inside the dashboard
- `next.config.mjs` - Next.js config, including the old `/settings` redirect
- `lib/server-context.tsx` - app-wide server/session state
- `lib/palworld.ts` - Palworld API helpers and payload normalization
- `lib/palworld-ini.ts` - `PalWorldSettings.ini` parsing and serialization
- `components/dashboard.tsx` - main dashboard shell
- `components/live-map.tsx` - live map view
- `Dockerfile` - production container build
- `docker-compose.yml` - dashboard-only deployment using the published image
- `docker-compose.full.yml` - Palworld server + dashboard together, built from source
- `scripts/deploy-full.sh` - one-command bring-up for docker-compose.full.yml
- `.github/workflows/publish-docker-image.yml` - container build and publish automation

## UI Library and Styling 🎨

This project does not use a large all-in-one UI framework like MUI, Ant Design, or Chakra UI.

Instead, the UI is built with a lighter custom stack:

- Tailwind CSS for styling and layout
- Radix UI primitives for accessible low-level UI behavior
- custom reusable components inside `components/` and `components/ui/`
- a visual style and component direction influenced by `thegridcn`
- Sonner for toast notifications

In practice, that means the visual design is mostly custom and shaped by the `thegridcn` aesthetic, while accessibility and interaction behavior for dialogs, dropdowns, tabs, switches, and sheets are powered by Radix UI primitives.

## Troubleshooting 🧯

### The app opens, but it cannot connect to my server

Check:

- server IP or hostname
- REST API port
- admin password
- firewall rules
- whether the REST API is actually enabled on the server

### The gameplay server works, but the dashboard cannot connect

That usually means the game port is reachable but the REST API is not. Double-check the REST API port and its authentication settings.

### Using docker-compose.full.yml: dashboard says "Cannot reach the REST API", server logs end with "Killed"

The Palworld dedicated server process got OOM-killed — it needs at least 8GB RAM available to the container. See the requirements note in [Run Server and Dashboard Together](#run-server-and-dashboard-together-). On macOS/Windows, raise the memory allocated to Docker's VM (Docker Desktop settings, or `colima start --memory 8` if using colima), then re-run `./scripts/deploy-full.sh`.

### Using docker-compose.full.yml: dashboard says "Cannot reach the REST API", server is healthy, `PalWorldSettings.ini` is basically empty (1 byte)

`DISABLE_GENERATE_SETTINGS` got set to `true` in `.env` before the server ever booted successfully, so the official image never got a chance to generate real settings (including enabling the REST API). This shouldn't happen if you used `scripts/deploy-full.sh`, but if you set it manually: set `DISABLE_GENERATE_SETTINGS=false` in `.env`, delete the empty `.ini` files under `./data/Pal/Saved/Config/LinuxServer/`, and re-run `./scripts/deploy-full.sh` to let it generate a real config and re-lock it once healthy.

### Using docker-compose.full.yml: saving in Settings fails with "EACCES: permission denied, open '/config/PalWorldSettings.ini.bak'"

The `palworld` service creates `./data/Pal/Saved/Config/LinuxServer/` as whatever uid its image runs as (1000 by default for `thijsvanloef/palworld-server-docker`), but the dashboard container defaults to a different uid, so it can't write into that folder. Check the actual owner with `ls -la ./data/Pal/Saved/Config/LinuxServer` and set `PALWORLD_UID`/`PALWORLD_GID` in `.env` to match (run `id -u`/`id -g` as that owner, or just its uid/gid number), then `docker compose -f docker-compose.full.yml up -d --force-recreate dashboard`.

### The page loads, but development hot reload is not working

Restart the dev server with:

```bash
npm run dev
```

If you are using a LAN URL, make sure you are opening the same machine's active network address and not an outdated one.

### TypeScript complains about generated route files

Run:

```bash
npm run typecheck
```

The script already resets and regenerates the route types for you.

## Contributing 🤝

Contributions are welcome.

Good ways to contribute:

- fix bugs
- improve the UI
- improve server compatibility
- improve the documentation
- add tests
- suggest deployment improvements

If you open an issue or pull request, it helps to include:

- what you expected
- what actually happened
- steps to reproduce the problem
- screenshots or logs when relevant

## Tech Stack 🧰

- Next.js
- React
- TypeScript
- Tailwind CSS
- Radix UI primitives
- Sonner

## License 📄

MIT. See [LICENSE](./LICENSE).
