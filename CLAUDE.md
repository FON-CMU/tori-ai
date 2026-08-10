@AGENTS.md

# TORI deploy notes (Vercel + Neon + Blob)

## Before every schema deploy

Migration **does not** run during `next build`. Apply manually:

```bash
npx prisma migrate deploy
```

Initial migration includes `User.entraOid` and the full TORI schema.

## Vercel

- Region: `sin1` (Singapore) — keep aligned with Neon
- Env required: `DATABASE_URL`, `AUTH_SECRET`, `STORAGE_DRIVER=vercel-blob`, `BLOB_READ_WRITE_TOKEN`, `APP_URL`
- Recommended: `MAX_TOR_FILE_SIZE_MB=4`, `AI_REQUEST_TIMEOUT_MS=240000`
- Auth: Entra (`ENTRA_*`) and/or temporary demo login (`DEMO_LOGIN_ENABLED=true` + email/password)
- `postinstall` / `build` run `prisma generate` only

## Storage

- Dev/Docker: `STORAGE_DRIVER=local` + `LOCAL_STORAGE_PATH`
- Production: `STORAGE_DRIVER=vercel-blob`

## TOR pipeline

Upload → process → analyze are **separate** requests so each stays under function `maxDuration`.

## Manual

Thai user guide: `manual.pdf` (regenerate with `npx tsx scripts/generate-manual-pdf.ts`)
