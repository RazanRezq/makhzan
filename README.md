# Makhzan (مخزن)

Makhzan is a bilingual (English and Arabic) multi-tenant inventory management
platform for small and medium businesses in the MENA region.

The current application is a single Next.js App Router workspace at `apps/web`.
Its dashboard supports English and Arabic and includes a read-only product
catalog backed by synthetic demo data. Better Auth provides email/password
identity and database-backed sessions; tenant membership, RBAC, onboarding, and
product mutations are not implemented yet.

## Prerequisites and first checkout

- Git.
- Docker Desktop with Linux containers on Windows/macOS, or Docker Engine with
  the Compose v2 plugin on Linux.
- Node.js is optional for the Docker-first workflow. Native commands require the
  exact version in `.nvmrc`; use npm only.

```sh
git clone https://github.com/RazanRezq/makhzan.git
cd makhzan
docker compose build web
docker compose up -d --wait postgres
docker compose run --rm --no-deps web npm run db:migrate
docker compose up -d --wait web
```

## Run with Docker

Start or resume Docker before running commands. Run everything below from the
repository root.

```sh
docker compose up --build -d --wait
```

Open **http://localhost:3000**, which redirects to `/en`. Arabic is available at
http://localhost:3000/ar. Stop any local Next.js server using port 3000 first.
The web container listens on all container interfaces; its published port is
restricted to localhost.

The image pins **Node.js 24.22.0 LTS** on Debian Bookworm, matching `.nvmrc`.
It supports both ARM64 and AMD64 without forcing architecture emulation.
You do not need Node.js or a host `node_modules` installation to use Docker.
Initial builds require internet access for npm packages and Next.js font downloads.
PostgreSQL is required for authentication and starts with the web service.

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

## Development commands

The Docker development service runs `npm run dev` with Fast Refresh. For an
optional native workflow, first run `npm ci` at the repository root, then use:

```sh
npm run dev
npm run typecheck
npm run lint
npm run test:unit
npm run test:http
npm run test:auth
npm run test:watch
npm run benchmark:products
npm run build
```

Do not install dependencies from `apps/web`; npm Workspaces and the root
`package-lock.json` are authoritative.

## Environment files

Docker development starts with local-only defaults. To customize settings, copy
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
| `BETTER_AUTH_SECRET` | Development fallback | Cookie-signing secret; use a unique random value of at least 32 characters outside local development |
| `BETTER_AUTH_URL` | `http://localhost:3000` | Public origin used by Better Auth; HTTPS is required in production |
| `AUTH_TRUSTED_ORIGINS` | Localhost origins | Exact comma-separated browser origins allowed for auth requests |
| `POSTGRES_PORT` | `5432` | Loopback host port for development PostgreSQL |
| `POSTGRES_DB` | `makhzan` | Local development database name |
| `POSTGRES_USER` | `makhzan` | Local development database user |
| `POSTGRES_PASSWORD` | `makhzan` | Local-only example password; replace outside disposable development |
| `DATABASE_URL` | See `.env.example` | Native-tool connection URL; Compose injects its service-network URL separately |
| `REDIS_PORT` | `6379` | Host port for optional Redis |

Keep `.env` untracked. Document new environment settings in `.env.example`.

## Switching development computers

Commit source and the root lockfile, clone the repository on the other computer,
and recreate any untracked `.env` manually from `.env.example`. Then run
the first-checkout sequence above. Docker volumes, local database data, and
secrets are machine-local and must not be copied through Git. If manifests
changed, always rebuild the web image so `npm ci` refreshes the dependency
volume from the lockfile.

## PostgreSQL and migrations

PostgreSQL is required for authentication, migrations, and integration tests.
Development data stays in the existing `postgres_data` volume.

```sh
docker compose up -d --wait postgres
docker compose run --rm --no-deps web npm run db:migrate
docker compose run --rm --no-deps web npm run db:check
```

After an approved Drizzle schema change, generate and review a migration before
applying it:

```sh
docker compose run --rm --no-deps web npm run db:generate
docker compose run --rm --no-deps web npm run db:check
docker compose run --rm --no-deps web npm run db:migrate
```

Do not use `drizzle-kit push` against shared or production databases. The web
container uses `postgres:5432`; the host URL in `.env.example` uses
`127.0.0.1:${POSTGRES_PORT}`.

Run the isolated real-PostgreSQL suite with:

```sh
docker compose --profile database-test up -d --wait postgres-test
docker compose run --rm --no-deps -e NODE_ENV=test -e TEST_DATABASE_URL=postgresql://makhzan_test:makhzan_test@postgres-test:5432/makhzan_test web npm run test:db
docker compose run --rm --no-deps -e NODE_ENV=test -e TEST_DATABASE_URL=postgresql://makhzan_test:makhzan_test@postgres-test:5432/makhzan_test web npm run test:auth
docker compose --profile database-test rm -sf postgres-test
```

The test service has no host port or persistent volume and the suite refuses to
reset a database other than the explicitly named local `makhzan_test` database.
Redis remains deferred and optional:

```sh
docker compose --profile cache up -d --wait redis
docker compose --profile cache up -d --wait
docker compose --profile cache down
```

Development PostgreSQL and Redis expose ports only on `127.0.0.1`. Their example
credentials are local-only and must not be reused for deployed environments.

**Do not use `docker compose down --volumes` to troubleshoot the web app:** it can
delete PostgreSQL data as well as web caches.

## Verification

Stop the development server before running checks against its shared build volume:

```sh
docker compose stop web
docker compose --profile database-test up -d --wait postgres-test
docker compose run --rm --no-deps web sh -c "npm run typecheck && npm run lint && npm run test:unit"
docker compose run --rm --no-deps -e NODE_ENV=test -e TEST_DATABASE_URL=postgresql://makhzan_test:makhzan_test@postgres-test:5432/makhzan_test web npm run test:db
docker compose run --rm --no-deps -e NODE_ENV=test -e TEST_DATABASE_URL=postgresql://makhzan_test:makhzan_test@postgres-test:5432/makhzan_test web npm run test:auth
docker compose run --rm --no-deps -e NODE_ENV=test -e TEST_DATABASE_URL=postgresql://makhzan_test:makhzan_test@postgres-test:5432/makhzan_test web npm run test:http
docker compose run --rm --no-deps -e NODE_ENV=production -e BETTER_AUTH_SECRET=synthetic-build-secret-at-least-32-characters -e BETTER_AUTH_URL=https://build.invalid -e AUTH_TRUSTED_ORIGINS=https://build.invalid web npm run build
docker compose --profile database-test rm -sf postgres-test
docker compose up -d --wait web
```

The HTTP suite creates an isolated production build, starts real Next.js servers
on available loopback ports, and removes its generated files after the run. It
does not depend on the development container being active. Run the repeatable
Products benchmark separately with:

```sh
docker compose run --rm --no-deps web npm run benchmark:products
```

`npm test` runs the Unit/Component suite followed by the HTTP suite. The guarded
database and authentication suites are separate because they require PostgreSQL.
Individual commands are `npm run test:unit`, `npm run test:http`,
`npm run test:db`, `npm run test:auth`, and
`npm run test:watch`.
Missing test files fail rather than being silently skipped. Existing
development-tool audit findings must be reviewed separately; do not use
`npm audit fix --force`.

## Continuous integration

GitHub Actions runs `npm ci`, typecheck, ESLint, 22 Unit/Component tests, 13
database tests, 9 authentication integration tests, a production build, and 12
real HTTP integration tests for every push and pull request. PostgreSQL is an
isolated CI service with synthetic credentials. The workflow uses the Node.js version in
`.nvmrc` and caches npm downloads using the root lockfile; it does not cache
`node_modules` or deploy the application.
See `.github/workflows/ci.yml`. A committed workflow must complete on a
GitHub-hosted runner before its status can be called passing.

## Dependency security

As of 24 October 2026, the full audit and `npm audit --omit=dev` each report four
moderate findings in Drizzle Kit's legacy esbuild loader chain. Better Auth
declares Drizzle Kit as an optional peer, so npm includes that development tool
in the `--omit=dev` graph; `npm audit --omit=dev --omit=optional` reports zero
runtime findings. The offered remediation is a breaking Drizzle Kit downgrade,
so it has not been applied. Do not use `npm audit fix --force`; reassess when a
compatible upstream release is available.

## Deployment readiness

Heroku is the provisional portfolio-demo target. No deployment or paid resource
has been created. Runtime requirements, current student-credit constraints, and
the future deployment checklist are documented in
[`docs/deployment/heroku.md`](docs/deployment/heroku.md).

For native development, install the version in `.nvmrc` using your Node version
manager, then run:

```sh
npm ci
npm run dev
```

Native verification commands mirror the Docker commands: `npm run typecheck`,
`npm run lint`, `npm run test:unit`, `npm run test:http`, and `npm run build`.
Docker remains the required completion environment. Read [AGENTS.md](AGENTS.md)
before changing code.

## Authentication scope

Development and isolated tests support email/password registration, sign-in,
database-backed sessions, and logout. Public production registration is
hard-disabled until a real email provider, email verification, password
recovery, and production abuse controls are configured. Sign-in remains
available for pre-provisioned accounts.

Authenticated users can access only the identity-level shell and synthetic demo
catalog. Authentication does not grant tenant membership or permission to real
business data. New development accounts land on `/[locale]/pending-setup` until
company onboarding is implemented. See
[`docs/architecture/authentication.md`](docs/architecture/authentication.md).

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
