# TORI — AI Secretary

Chat-first web application for recording work against each CMU employee's Terms of Reference (TOR).

## Run with Docker

Docker Compose starts PostgreSQL, applies the current Prisma schema, seeds the development account, and starts the production Next.js container:

```bash
docker compose up --build
```

Open <http://localhost:4600> and use **เข้าใช้บัญชีสาธิต**. Follow logs with `docker compose logs -f app`; stop services with `docker compose down`.

Local database data persists in the `tori_postgres_data` volume. To intentionally remove it and start from an empty database:

```bash
docker compose down --volumes
```

The Compose defaults are for local development only. Before exposing the stack, set strong `POSTGRES_PASSWORD` and `AUTH_SECRET` values in an uncommitted `.env`, configure CMU/OpenAI as needed, and place a reverse proxy with TLS and request limits in front of the application. Uploaded TOR files persist in the Docker volume `tori_tor_files`.

## Local setup

Requirements: Node.js 20+, PostgreSQL, and npm.

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate -- --name tori_foundation
npm run db:seed
npm run dev
```

Set `AUTH_SECRET` to a random value of at least 32 characters. The development-only mock sign-in is available on `/login`; it is unavailable when `NODE_ENV=production`.

CMU OIDC requires `CMU_CLIENT_ID`, `CMU_CLIENT_SECRET`, `CMU_ISSUER`, and `CMU_REDIRECT_URI`. AI operations require both `OPENAI_API_KEY` and `OPENAI_MODEL`. TOR uploads use `LOCAL_STORAGE_PATH` (default `./storage`, or `/data/tori` in Docker). No integration secret belongs in source control.

## Quality commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

If Turbopack cannot create worker processes in a restricted CI sandbox, run `npx next build --webpack`; the production webpack build is also verified by this project.

## Architecture

- `src/app`: server-first pages and Route Handlers
- `src/lib`: server integrations, environment validation, HTTP helpers, and shared validation
- `src/server/services`: business transactions
- `src/server/policies`: authorization policies
- `prisma`: PostgreSQL schema and seed data
- `tests`: unit, integration, E2E, and AI evaluation fixtures as they are added phase-by-phase

Database access and third-party SDKs remain server-only. Every owner-scoped query must include the authenticated `userId`; UI visibility is never treated as authorization.
