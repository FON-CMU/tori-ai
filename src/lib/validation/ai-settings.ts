import { z } from "zod";

/**
 * Normalize model ids.
 * - Display names with spaces (e.g. "Gemini 3.6 Flash") → kebab lowercase
 * - API ids (e.g. "Qwen/Qwen2.5-72B") → preserve case; gateways often need exact ids
 */
export function normalizeAiModelId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/\s/.test(trimmed)) {
    return trimmed
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9._/-]+/g, "")
      .replace(/\/+/g, "/")
      .replace(/-+/g, "-")
      .replace(/^[-./]+|[-./]+$/g, "");
  }

  return trimmed
    .replace(/[^a-zA-Z0-9._/:-]+/g, "")
    .replace(/\/+/g, "/")
    .replace(/^[-./:]+|[-./:]+$/g, "");
}

/** Accept full Postman URLs and normalize to OpenAI SDK baseURL. */
export function normalizeOpenAiBaseUrl(value: string) {
  let url = value.trim().replace(/\/+$/, "");
  if (url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  url = url.replace(/\/chat\/completions$/i, "");
  url = url.replace(/\/completions$/i, "");
  return url.replace(/\/+$/, "");
}

const modelSchema = z
  .string()
  .trim()
  .min(1, "กรุณาระบุชื่อโมเดล")
  .max(120)
  .transform(normalizeAiModelId)
  .pipe(
    z
      .string()
      .min(1, "กรุณาระบุชื่อโมเดล")
      .max(120)
      .regex(/^[a-zA-Z0-9._/:-]+$/, "ชื่อโมเดลมีรูปแบบไม่ถูกต้อง"),
  );

const apiKeySchema = z
  .string()
  .trim()
  .min(8, "API key สั้นเกินไป")
  .max(512)
  .refine((value) => !/\s/.test(value), "API key ต้องไม่มีช่องว่าง");

const baseUrlSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return normalizeOpenAiBaseUrl(trimmed);
  },
  z
    .string()
    .url("Base URL ไม่ถูกต้อง ต้องขึ้นต้นด้วย https:// เช่น https://chatgen.scmc.cmu.ac.th/api")
    .max(500)
    .optional(),
);

export const aiSettingsSchema = z.object({
  apiKey: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    apiKeySchema.optional(),
  ),
  model: modelSchema,
});

export const openAiSettingsSchema = z.object({
  apiKey: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    apiKeySchema.optional(),
  ),
  model: modelSchema,
  baseUrl: baseUrlSchema,
  chatModels: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(2000).optional(),
  ),
});

const OPENAI_CHAT_MODEL_DEFAULTS = [
  "gpt-4.1-mini",
  "gpt-4.1",
  "gpt-4o-mini",
  "gpt-4o",
  "o4-mini",
];

const GOOGLE_CHAT_MODEL_DEFAULTS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-flash-latest",
];

export function parseChatModelsText(raw: string | null | undefined) {
  if (!raw) return [] as string[];
  const models = raw
    .split(/[\n,]+/)
    .map((item) => normalizeAiModelId(item))
    .filter(Boolean);
  return [...new Set(models)];
}

export function formatChatModelsText(models: string[]) {
  return models.join("\n");
}

/** Match requested model against allowlist (case-insensitive), return canonical id. */
export function matchAllowedModel(requested: string | null | undefined, allowed: string[]) {
  if (!requested || !allowed.length) return null;
  const normalized = normalizeAiModelId(requested);
  const exact = allowed.find((model) => model === normalized || model === requested);
  if (exact) return exact;
  const lower = normalized.toLowerCase();
  return allowed.find((model) => model.toLowerCase() === lower) ?? null;
}

export function resolveChatModelCatalog(input: {
  provider: "OPENAI" | "GOOGLE_AI_STUDIO";
  defaultModel: string;
  configuredModels?: string[] | null;
  /** เกตเวย์ภายในไม่ควรโชว์รายการ gpt-* มาตรฐาน */
  customGateway?: boolean;
}) {
  const configured = (input.configuredModels ?? []).map(normalizeAiModelId).filter(Boolean);
  const builtin =
    input.provider === "GOOGLE_AI_STUDIO"
      ? GOOGLE_CHAT_MODEL_DEFAULTS
      : input.customGateway
        ? []
        : OPENAI_CHAT_MODEL_DEFAULTS;
  const source = configured.length ? configured : builtin;
  const defaultModel = normalizeAiModelId(input.defaultModel) || source[0] || "";
  if (!defaultModel) {
    return { defaultModel: "", models: [] as string[] };
  }
  const models = [defaultModel, ...source.filter((model) => model.toLowerCase() !== defaultModel.toLowerCase())];
  return {
    defaultModel,
    models: [...new Set(models)],
  };
}
