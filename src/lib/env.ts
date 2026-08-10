import "server-only";

import { z } from "zod";

const emptyToUndefined = (value: unknown) => value === "" ? undefined : value;

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  DIRECT_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  AUTH_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  CMU_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  CMU_CLIENT_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  CMU_ISSUER: z.preprocess(emptyToUndefined, z.string().url().optional()),
  CMU_REDIRECT_URI: z.preprocess(emptyToUndefined, z.string().url().optional()),
  ENTRA_TENANT_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  ENTRA_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  ENTRA_CLIENT_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  ENTRA_REDIRECT_URI: z.preprocess(emptyToUndefined, z.string().url().optional()),
  /** อีเมลที่ถือว่าเป็น ADMIN คั่นด้วยจุลภาคหรือขึ้นบรรทัดใหม่ */
  ENTRA_ADMIN_EMAILS: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Object ID ของ Entra group ที่ถือว่าเป็น ADMIN คั่นด้วยจุลภาคหรือขึ้นบรรทัดใหม่ */
  ENTRA_ADMIN_GROUP_IDS: z.preprocess(emptyToUndefined, z.string().optional()),
  OPENAI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  OPENAI_MODEL: z.preprocess(emptyToUndefined, z.string().optional()),
  OPENAI_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  OPENAI_STORE_RESPONSES: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  STORAGE_DRIVER: z.enum(["local", "vercel-blob"]).default("local"),
  BLOB_READ_WRITE_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),
  LOCAL_STORAGE_PATH: z.string().min(1).default("./storage"),
  /** งบเวลาเรียก AI ต่อครั้ง (ms) — Vercel เพดานฟังก์ชัน ~300s */
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(300_000).default(240_000),
  DEMO_LOGIN_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  DEMO_LOGIN_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),
  DEMO_LOGIN_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(8).optional()),
  OCR_PROVIDER: z.enum(["mock"]).default("mock"),
  OCR_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_TIMEZONE: z.literal("Asia/Bangkok").default("Asia/Bangkok"),
  MAX_TOR_FILE_SIZE_MB: z.coerce.number().int().positive().max(100).default(20),
  MAX_WORK_HOURS_PER_DAY: z.coerce.number().positive().max(24).default(24),
});

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Environment configuration is invalid: ${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;

export function requireDatabaseEnv() {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required for database operations");
  return env.DATABASE_URL;
}

export function requireOpenAiEnv() {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for AI operations");
  if (!env.OPENAI_MODEL) throw new Error("OPENAI_MODEL is required for AI operations");
  return { apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL, store: env.OPENAI_STORE_RESPONSES };
}
