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

The Compose defaults are for local development only. Before exposing the stack, set strong `POSTGRES_PASSWORD` and `AUTH_SECRET` values in an uncommitted `.env`, configure Microsoft Entra and/or CMU plus OpenAI as needed, and place a reverse proxy with TLS and request limits in front of the application. Uploaded TOR files persist in the Docker volume `tori_tor_files`.

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

### Microsoft Entra ID

Set in `.env` (and Azure App registration Redirect URI must match):

- `ENTRA_TENANT_ID`
- `ENTRA_CLIENT_ID`
- `ENTRA_CLIENT_SECRET`
- `ENTRA_REDIRECT_URI` (e.g. `http://localhost:4600/api/auth/entra/callback`)
- Optional admin mapping: `ENTRA_ADMIN_EMAILS`, `ENTRA_ADMIN_GROUP_IDS`, or Entra App role `Admin`

Each Entra account maps to one TORI user (1 คน = 1 โปรไฟล์). TOR/chat/JA stay scoped by `userId`. `/settings/ai` remains ADMIN-only and uses the shared system AI config.

CMU OIDC (optional) requires `CMU_CLIENT_ID`, `CMU_CLIENT_SECRET`, `CMU_ISSUER`, and `CMU_REDIRECT_URI`. AI operations require both `OPENAI_API_KEY` and `OPENAI_MODEL` (or admin-configured keys). TOR uploads use `LOCAL_STORAGE_PATH` (default `./storage`, or `/data/tori` in Docker). No integration secret belongs in source control.

## Deploy (Vercel + Neon + Blob)

1. Set Vercel region to `sin1` and env: `DATABASE_URL`, `AUTH_SECRET`, `STORAGE_DRIVER=vercel-blob`, `BLOB_READ_WRITE_TOKEN`, `APP_URL`, optionally `MAX_TOR_FILE_SIZE_MB=4`.
2. Run `npx prisma migrate deploy` against Neon **before** (or with) each schema-changing release — migrations are **not** applied at build time.
3. Auth: configure Microsoft Entra (`ENTRA_*`) or temporary `DEMO_LOGIN_ENABLED=true` with email/password until Entra is ready.
4. Thai user manual: [`manual.pdf`](./manual.pdf).

Local Docker still uses Compose; storage defaults to `STORAGE_DRIVER=local`.

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
