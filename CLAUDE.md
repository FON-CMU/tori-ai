# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

TORI — a chat-first Thai-language web app where CMU staff narrate their work in chat and the system records it as **JA** (ผลการปฏิบัติงานจริง) entries matched against topics extracted from their uploaded **TOR** document, then exports the whole TOR-vs-JA form to DOCX/PDF.

## Commands

```bash
npm run dev                 # next dev
npm run check               # lint + typecheck + test — run before claiming work is done
npm run lint / typecheck / test
npm run test:watch
npm run build               # next build; if Turbopack cannot spawn workers, use: npx next build --webpack

npm run prisma:generate     # REQUIRED before typecheck/build/test on a fresh clone (see below)
npm run prisma:migrate      # prisma migrate dev
npm run db:seed             # seeds demo user demo.user@cmu.ac.th with EMPLOYEE + ADMIN
npm run docker:up           # postgres + migrate deploy + seed + app on :4600
npm run docker:reset        # docker compose down --volumes (destroys the DB volume)
```

Single test: `npx vitest run tests/unit/core.test.ts`, or by name: `npx vitest run -t "converts Buddhist years"`.

The Prisma client is generated into `src/generated/prisma` (gitignored), so **nothing type-checks until it has been generated**. `postinstall` runs `prisma generate`, so a plain `npm install` is enough; `npm run prisma:generate` re-runs it after a schema edit. Import it as `@/generated/prisma/client` — never `@prisma/client`.

Migrations live in `prisma/migrations/` and are **applied by hand, never from a build**: `npx prisma migrate dev --name <change>` locally, then `npx prisma migrate deploy` against the target database. The Docker `database` stage runs `migrate deploy` for the same reason. Deploying code that expects a new column without running it first fails at runtime.

`prisma.config.ts` reads `DATABASE_URL` for every CLI command; there is deliberately no `DIRECT_URL`. Neon's pooler handles both runtime queries and migrations here — if a `migrate` command ever fails on an advisory lock, set `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=true` for that one command.

## Layering

Route Handler / Server Component → `src/server/services/*` → `prisma`. Route handlers stay thin: resolve the session, parse the body, call one service, map errors. All business logic, transactions, and audit writes live in services. `src/lib` holds framework-agnostic helpers (env, date, validation, crypto, storage, OpenAI client).

Anything touching the DB, secrets, or a third-party SDK starts with `import "server-only"` — keep that.

## Auth and ownership

- Session = HS256 JWT (`jose`) in the httpOnly `tori_session` cookie, payload `{ userId, unitId, roles }`, 8h. [src/lib/auth/session.ts](src/lib/auth/session.ts). In a route handler that redirects, use `redirectWithSession()` — `setSessionCookie()` writes through `cookies()`, which a `NextResponse.redirect` does not carry.
- Three sign-in paths land on the same `upsertIdentity(profile: IdentityProfile)` ([src/lib/auth/types.ts](src/lib/auth/types.ts)): Microsoft Entra (`ENTRA_*`), CMU OIDC (`CMU_*`), and the demo login. `profile.suggestedRoles` decides the roles granted — omit it and the account gets `EMPLOYEE` only. Roles are never revoked on re-login, so a missing group claim cannot lock an admin out.
- [src/proxy.ts](src/proxy.ts) is this Next version's middleware entry point (`export function proxy` + `config.matcher`). It only checks cookie *presence* and stamps `x-request-id` — it is not authorization.
- Use `requireSession()` in route handlers (throws `ApiError` 401) and `requirePageSession()` in server components (redirects to `/login`). Admin-only: `requireAdminSession()` / `requireAdminPageSession()`.
- **Every owner-scoped query must include `userId` in the `where` clause** — see the `findFirst({ where: { id, userId } })` pattern throughout the services. Role checks live in [src/server/policies/ownership.ts](src/server/policies/ownership.ts). UI visibility is never treated as authorization.

## API contract

Success: `{ data, requestId }`. Failure: throw `ApiError(status, code, thaiMessage, fieldErrors?)` and return `errorResponse(error, requestId)` — which yields `{ error: { code, message, fieldErrors, requestId } }` and logs unknown errors as one-line JSON. `requestId` comes from `getRequestId(request)`. [src/lib/http/api-error.ts](src/lib/http/api-error.ts)

## Domain flow

1. **TOR ingest** — `uploadTor` (magic-byte MIME sniff, sha256 dedupe, per-user version bump, stored via `objectStorage`) → `processTor` (pdf-parse / mammoth → `TorPage` rows, status `REVIEW_REQUIRED`) → `analyzeTor` (AI → deletes and rebuilds the `TorTopic` tree, status `ACTIVE`). `ingestTor` chains both and tolerates analysis failure — so a 200 from `/api/tor/[id]/process` means the text was read, **not** that the document has topics. `POST /api/tor/upload` only stores the file; the client calls process as a second request. [src/server/services/tor-processing-service.ts](src/server/services/tor-processing-service.ts)
2. **TorTopic is a tree** with `kind` SECTION → TOPIC → SUBITEM, preserving the form's numbering. Only rows that are `kind: TOPIC`, `matchable: true`, `status: CONFIRMED`, on a `torDocument.status: ACTIVE` are eligible for JA matching — that quadruple filter is repeated in chat, commands, and reports; keep it consistent.
3. **Chat** — `sendChatMessage` first tries `tryHandleChatCommand` (deterministic Thai commands: ช่วยเหลือ, counts, ดู TOR, ส่งออก PDF, ลบแชท, navigation…) *before* any AI call, then requires at least one active TOR topic, then calls `extractWork` and merges the result into the conversation's single `WorkDraft`. [src/server/services/chat-service.ts](src/server/services/chat-service.ts)
4. **Draft completeness is decided server-side, not by the model.** `requiredFieldsForSubtype(workSubtype)` drives which fields are mandatory (`B_2_1`/`B_2_2` need `location`, `B_2_3` needs `relatedUnit`, `C_3_1` needs `location` + `competency`). The system prompts are deliberately short because of this — put new rules in [src/lib/validation/work.ts](src/lib/validation/work.ts), not in the prompt. Draft-only fields (`workSubtype`, `competency`, `eventDate`, `startTime`, `endTime`) are accumulated across turns inside `WorkDraft.confirmedFieldsJson`.
5. **Confirm** — `confirmJa` re-validates, rejects duplicates, and in one transaction writes `JaRecord` (+ `runningNumber` `JA-<year>-000001`), `JaRecordVersion` v1, and an `AuditLog` row. Deletes are archives, never row deletions, and also write a version + audit row.
   A JA may be saved with **no schedule at all** (`isSkipScheduleIntent` → `scheduleSkipped`), so `startAt`, `endAt` and `totalHours` are **nullable** — the duplicate check switches to `workTitle` + null times, `runningNumber` falls back to the current year, and every reader must tolerate null (`formatDateTime` and `sumJaHours` already render/count these as `ไม่ระบุ`/0).
6. **Export** — [ja-report-service.ts](src/server/services/ja-report-service.ts) builds the report model; [ja-export-service.ts](src/server/services/ja-export-service.ts) renders it as a 4-column TOR/JA table via `docx` and `pdfkit`, embedding the Thai fonts in [assets/fonts/](assets/fonts/) (`process.cwd()`-relative, so they must ship with the runtime image).

## AI configuration

Configured system-wide in a single `SystemAiConfig` row (`id: "default"`) editable by ADMIN at `/settings/ai`, with env vars as fallback. API keys are AES-256-GCM encrypted with a key derived from `AUTH_SECRET` ([src/lib/crypto/secrets.ts](src/lib/crypto/secrets.ts)) — rotating `AUTH_SECRET` invalidates stored keys.

`resolveOpenAiSettings()` returns `apiStyle: "responses"` for stock OpenAI and `"chat"` whenever a custom `baseURL` is set (CMU gateway, Google AI Studio's OpenAI-compatible endpoint). The chat path degrades on purpose: structured parse → `json_object` → bare completion + `extractJsonObject`. The client uses `maxRetries: 0` and 120s/180s timeouts — internal gateways are slow, and retrying doubles the timeout. Requested models must match the allowed catalog (`matchAllowedModel`). [src/lib/openai/client.ts](src/lib/openai/client.ts)

Model output is never trusted directly: `normalizeWorkExtraction` / `normalizeTorExtraction` in [src/lib/validation/ai.ts](src/lib/validation/ai.ts) coerce messy shapes (Thai category names, `"3.1"` subtypes, non-UUID topic ids, percent confidences, topics grouped under Thai keys) before Zod parsing. Add new tolerances there and cover them in `tests/unit/core.test.ts`.

## Locale and time

UI strings, AI replies, and error messages are Thai; identifiers and log events are English. Everything is `Asia/Bangkok` and Buddhist-era (`TorDocument.year` defaults to 2569). Never do ad-hoc date math — use [src/lib/date.ts](src/lib/date.ts) (`bangkokDateISO`, `composeBangkokDateTime`, `splitBangkokDateTime`, `parseThaiDateToISO`, `parseTimeRange`, `calculateHours`, Buddhist year conversion).

`Decimal` columns (`totalHours`, `hoursPerWeek`) come back as `Prisma.Decimal` — wrap in `Number()` before arithmetic or JSON.

## Env

[src/lib/env.ts](src/lib/env.ts) parses `process.env` at import and throws on invalid values, so a bad variable 500s every page rather than failing at the point of use — see [.env.example](.env.example) for the full list. Most fields are optional so a build can run with placeholders; use `requireDatabaseEnv()` / `requireOpenAiEnv()` where needed. `AUTH_SECRET` must be ≥32 chars.

`STORAGE_DRIVER` picks the `objectStorage` implementation: `local` writes to `LOCAL_STORAGE_PATH`, `vercel-blob` needs `BLOB_READ_WRITE_TOKEN` and a **private** store. Serverless hosts have no durable filesystem, so `local` there breaks the retry path in `processTor` — the one place a stored file is read back in a later request.

`POST /api/auth/mock` (the demo login) 404s unless `NODE_ENV=development`, or both `ALLOW_MOCK_LOGIN` and `MOCK_LOGIN_PASSWORD` are set. It signs in as the seeded ADMIN account; delete it once Entra or CMU OIDC is configured. The gate in [login/page.tsx](src/app/(auth)/login/page.tsx) must stay identical to the route's, or the form renders against a 404.

## UI

Server components by default; the twelve files under [src/components/](src/components/) marked `"use client"` are the only interactive ones. Tailwind v4 (`@import "tailwindcss"`) with an Apple-ish token set (`--apple-bg`, `--apple-ink`, `--apple-blue`, …) defined in [src/app/globals.css](src/app/globals.css); prefer those variables over hardcoded colors. Routes are grouped `(app)` (session-guarded via the layout) and `(auth)`. React Compiler is on and the build is `output: "standalone"`.

## Tests

Vitest, node environment, `tests/**/*.test.ts`. [tests/unit/core.test.ts](tests/unit/core.test.ts) is the regression net for the pure business rules — date/Buddhist-year conversion, missing-field questions, subtype requirements, AI payload normalization, model-catalog resolution, ownership. There is no DB or HTTP test harness; keep new rules in pure functions so they stay testable.
