# Makhzan (مخزن)

Makhzan is a bilingual (English and Arabic) multi-tenant inventory management
platform for small and medium businesses in the MENA region.

This foundation provides PostgreSQL 16 and Redis 7 for local development. The
NestJS API and Next.js web app have not been created yet.

## Start locally

Install and start Docker Desktop, or use Docker Engine with the Docker Compose
plugin. Run these commands from the repository root:

```sh
cp .env.example .env
docker compose up -d --wait
```

Copy the environment template only on initial setup; keep any existing local
changes to `.env`. The template's connection URLs match the Compose services.
The database credentials are for local development only.

| Service | Host | Default port |
| --- | --- | --- |
| PostgreSQL | `127.0.0.1` | `5432` |
| Redis | `127.0.0.1` | `6379` |

If either port is already in use, change `POSTGRES_PORT` or `REDIS_PORT` in `.env`
and update the corresponding connection URL to use the same port before starting.

Check service health and view logs:

```sh
docker compose ps
docker compose logs -f
```

Stop the services:

```sh
docker compose down
```

PostgreSQL data persists in the named `postgres_data` volume across container
restarts and `docker compose down`. Adding `--volumes` to the stop command deletes
that data.

## Development

Read [AGENTS.md](AGENTS.md) before changing code. Use npm when the application
workspaces are added. Typecheck, lint, and test scripts are not available yet.

Keep `.env` untracked; commit new configuration placeholders to `.env.example`.
