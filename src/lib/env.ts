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
  OPENAI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  OPENAI_MODEL: z.preprocess(emptyToUndefined, z.string().optional()),
  OPENAI_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  OPENAI_STORE_RESPONSES: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).default("false").transform((value) => value === "true")),
  LOCAL_STORAGE_PATH: z.preprocess(emptyToUndefined, z.string().min(1).default("./storage")),
  OCR_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["mock"]).default("mock")),
  OCR_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  APP_URL: z.preprocess(emptyToUndefined, z.string().url().default("http://localhost:3000")),
  APP_TIMEZONE: z.preprocess(emptyToUndefined, z.literal("Asia/Bangkok").default("Asia/Bangkok")),
  MAX_TOR_FILE_SIZE_MB: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().max(100).default(20)),
  MAX_WORK_HOURS_PER_DAY: z.preprocess(emptyToUndefined, z.coerce.number().positive().max(24).default(24)),
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
