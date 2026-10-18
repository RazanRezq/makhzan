# Makhzan (مخزن)

Makhzan is a bilingual (English and Arabic) multi-tenant inventory management
platform for small and medium businesses in the MENA region.

The current application is a single Next.js App Router workspace at `apps/web`.
Its dashboard supports English and Arabic and includes a read-only product
catalog backed by synthetic demo data. Database access, authentication, and
product mutations are not implemented yet.

## Run with Docker

Use Docker Desktop with Linux containers on macOS or Windows, or Docker Engine
with the Compose v2 plugin on Linux. Start/resume Docker before running commands.
Run everything below from the repository root.

```sh
docker compose up --build -d --wait web
```

Open **http://localhost:3000**, which redirects to `/en`. Arabic is available at
http://localhost:3000/ar. Stop any local Next.js server using port 3000 first.
The web container listens on all container interfaces; its published port is
restricted to localhost.

The image pins **Node.js 24.22.0 LTS** on Debian Bookworm, matching `.nvmrc`.
It supports both ARM64 and AMD64 without forcing architecture emulation.
You do not need Node.js or a host `node_modules` installation to use Docker.
Initial builds require internet access for npm packages and Next.js font downloads.

```sh
docker compose ps
docker compose logs -f web
docker compose stop web
docker compose up -d --wait web
docker compose down
```

`stop` keeps the container for reuse; `down` removes containers and the network.
Named volumes survive both commands.

## Source changes and dependencies

Edit files on your computer as usual. Compose bind-mounts `src`, `messages`,
`public`, npm manifests, and the existing Next.js/TypeScript/ESLint configuration
into the container. Mounts are read-only inside the container, so generated files
cannot overwrite host sources. Next.js Fast Refresh updates the browser on save.
Docker-only polling supports file changes across macOS, Windows, and Linux.

Linux dependencies, the Next.js output directory, and the npm download cache use
separate named volumes: `web_node_modules`, `web_next`, and `web_npm_cache`.
Host `node_modules` and `.next` directories are never mounted. The application
runs as the image's non-root `node` user.

Both the image build and container startup use `npm ci --include=dev` with the
root `package-lock.json`. Startup intentionally reinstalls dependencies to keep
persistent volumes consistent with the lockfile; the npm cache reduces downloads.
Do not remove the lockfile or run a separate install inside `apps/web`.

After changing dependencies, update the root lockfile using npm on the host, then:

```sh
docker compose up --build -d --force-recreate --wait web
```

Rebuild after adding configuration files outside the mounted paths. If a new
workspace is introduced later, update the Dockerfile's manifest copies and
Compose mounts to include it.

## Environment files

The dashboard starts without an `.env` file. To customize host ports, copy
`.env.example` to `.env` once using your editor or file manager. On macOS/Linux
use `cp .env.example .env`; in PowerShell use `Copy-Item .env.example .env`.
Preserve any existing local settings.

Compose reads the root `.env` for variable substitution; it does not automatically
pass those values to Next.js. Only the web service's explicit `environment`
entries are passed into its process. No host `.env` file is mounted or copied
into the image. The build context also excludes local credentials, private keys,
host dependencies, and generated output through `.dockerignore`.

| Setting | Default | Purpose |
| --- | --- | --- |
| `WEB_PORT` | `3000` | Host port for the dashboard |
| `ENABLE_DEMO_PRODUCTS_API` | `false` | Enables the synthetic `GET /api/products` endpoint in production |
| `DOCKER_WATCH_POLLING` | `1` | Enables 1-second file polling in Docker; use `0` for native events |
| `POSTGRES_PORT` | `5432` | Host port for optional PostgreSQL |
| `REDIS_PORT` | `6379` | Host port for optional Redis |

Keep `.env` untracked. Document new environment settings in `.env.example`.

## Optional PostgreSQL and Redis

The existing service configurations and PostgreSQL data volume are preserved.
They are not required by the current dashboard and do not start by default.

```sh
docker compose --profile database up -d --wait postgres
docker compose --profile cache up -d --wait redis
docker compose --profile database --profile cache up -d --wait
docker compose --profile database --profile cache down
```

Both services expose ports only on `127.0.0.1`. Their example credentials are for
local development. The connection URLs in `.env.example` are for host processes;
a future containerized database client must use service names `postgres:5432`
and `redis:6379`, rather than localhost.

**Do not use `docker compose down --volumes` to troubleshoot the web app:** it can
delete PostgreSQL data as well as web caches.

## Verification

Stop the development server before running checks against its shared build volume:

```sh
docker compose stop web
docker compose run --rm --no-deps web sh -c "npm run typecheck && npm run lint && npm run build"
docker compose up -d --wait web
```

There is no unit-test suite configured yet. Existing development-tool audit
findings must be reviewed separately; do not use `npm audit fix --force`.

For native development, install the version in `.nvmrc` using your Node version
manager, then run:

```sh
npm ci
npm run dev
```

Native verification commands are `npm run typecheck`, `npm run lint`, and
`npm run build`. Read [AGENTS.md](AGENTS.md) before changing code.

## Troubleshooting

- **Docker is paused or unavailable:** resume/start Docker Desktop and check
  `docker info`. On Linux, ensure your user can access the running Docker daemon.
- **Port 3000 is occupied:** stop the existing development server, or set
  `WEB_PORT=3001` in the root `.env` and recreate the web container. Open the
  matching port in your browser.
- **Source changes do not appear:** check `docker compose logs -f web`, confirm
  `DOCKER_WATCH_POLLING=1`, and recreate the container after changing this setting.
  On Docker Desktop, ensure the repository directory is shared with Docker.
  On Windows with WSL2, prefer a checkout in the WSL Linux filesystem.
- **Dependencies differ after pulling changes:** rebuild/recreate with the command
  above. Startup will reinstall from the root lockfile. Do not copy host modules
  into the container.
- **Stale Next.js output:** stop web, then run
  `docker compose run --rm --no-deps web node -e "const fs = require('node:fs'); for (const name of fs.readdirSync('apps/web/.next')) fs.rmSync('apps/web/.next/' + name, {recursive:true, force:true})"`.
  This clears only the web build cache, preserving the mount point and database.
  Restart with `docker compose up -d --wait web`.
- **Font downloads or npm requests fail:** check Docker's network/proxy access.
  The current application uses `next/font/google`; do not disable TLS validation.
