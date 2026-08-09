import "server-only";

import OpenAI from "openai";
import { z } from "zod";

import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  aiSettingsSchema,
  matchAllowedModel,
  openAiSettingsSchema,
  parseChatModelsText,
  resolveChatModelCatalog,
} from "@/lib/validation/ai-settings";

export {
  aiSettingsSchema,
  matchAllowedModel,
  normalizeAiModelId,
  normalizeOpenAiBaseUrl,
  openAiSettingsSchema,
  parseChatModelsText,
  resolveChatModelCatalog,
} from "@/lib/validation/ai-settings";

const SYSTEM_AI_CONFIG_ID = "default";

function suffix(encrypted: string | null) {
  if (!encrypted) return null;
  try {
    return decryptSecret(encrypted).slice(-4);
  } catch {
    return null;
  }
}

async function getOrCreateSystemConfig() {
  return prisma.systemAiConfig.upsert({
    where: { id: SYSTEM_AI_CONFIG_ID },
    update: {},
    create: { id: SYSTEM_AI_CONFIG_ID },
  });
}

export async function getAiSettings() {
  const config = await getOrCreateSystemConfig();
  const envConfigured = Boolean(env.OPENAI_API_KEY);
  return {
    configured: Boolean(config.openAiApiKeyEncrypted) || envConfigured,
    suffix: suffix(config.openAiApiKeyEncrypted) ?? (envConfigured ? "env" : null),
    model: config.openAiModel ?? env.OPENAI_MODEL ?? "",
    baseUrl: config.openAiBaseUrl ?? env.OPENAI_BASE_URL ?? "",
    chatModels: config.chatModels ?? "",
    active: config.preferredAiProvider === "OPENAI",
    fromEnv: !config.openAiApiKeyEncrypted && envConfigured,
  };
}

export async function saveAiSettings(adminUserId: string, input: unknown) {
  const settings = openAiSettingsSchema.parse(input);
  const existing = await getOrCreateSystemConfig();

  if (!settings.apiKey && !existing.openAiApiKeyEncrypted && !env.OPENAI_API_KEY) {
    throw new Error("กรุณาใส่ API key");
  }

  const data = {
    openAiModel: settings.model,
    openAiBaseUrl: settings.baseUrl ?? null,
    chatModels: settings.chatModels?.trim() || null,
    preferredAiProvider: "OPENAI" as const,
    updatedById: adminUserId,
    ...(settings.apiKey ? { openAiApiKeyEncrypted: encryptSecret(settings.apiKey) } : {}),
  };

  const config = await prisma.systemAiConfig.upsert({
    where: { id: SYSTEM_AI_CONFIG_ID },
    update: data,
    create: {
      id: SYSTEM_AI_CONFIG_ID,
      openAiApiKeyEncrypted: settings.apiKey ? encryptSecret(settings.apiKey) : null,
      openAiModel: settings.model,
      openAiBaseUrl: settings.baseUrl ?? null,
      chatModels: settings.chatModels?.trim() || null,
      preferredAiProvider: "OPENAI",
      updatedById: adminUserId,
    },
  });

  return {
    configured: Boolean(config.openAiApiKeyEncrypted) || Boolean(env.OPENAI_API_KEY),
    suffix: suffix(config.openAiApiKeyEncrypted) ?? (env.OPENAI_API_KEY ? "env" : null),
    model: config.openAiModel ?? settings.model,
    baseUrl: config.openAiBaseUrl ?? "",
    chatModels: config.chatModels ?? "",
    active: true,
    fromEnv: !config.openAiApiKeyEncrypted && Boolean(env.OPENAI_API_KEY),
  };
}

export async function clearAiSettings(adminUserId: string) {
  await prisma.systemAiConfig.upsert({
    where: { id: SYSTEM_AI_CONFIG_ID },
    update: {
      openAiApiKeyEncrypted: null,
      openAiModel: null,
      openAiBaseUrl: null,
      chatModels: null,
      updatedById: adminUserId,
    },
    create: { id: SYSTEM_AI_CONFIG_ID, updatedById: adminUserId },
  });
}

export async function getGoogleAiSettings() {
  const config = await getOrCreateSystemConfig();
  return {
    configured: Boolean(config.googleAiApiKeyEncrypted),
    suffix: suffix(config.googleAiApiKeyEncrypted),
    model: config.googleAiModel ?? "",
    active: config.preferredAiProvider === "GOOGLE_AI_STUDIO",
  };
}

export async function saveGoogleAiSettings(adminUserId: string, input: unknown) {
  const settings = aiSettingsSchema.parse(input);
  const existing = await getOrCreateSystemConfig();

  if (!settings.apiKey && !existing.googleAiApiKeyEncrypted) {
    throw new Error("กรุณาใส่ API key");
  }

  // เขียนทับคีย์เฉพาะเมื่อส่งคีย์ใหม่มา — ไม่งั้นแก้โมเดลอย่างเดียวจะล้างคีย์เดิมทิ้ง
  const data = {
    googleAiModel: settings.model,
    preferredAiProvider: "GOOGLE_AI_STUDIO" as const,
    updatedById: adminUserId,
    ...(settings.apiKey ? { googleAiApiKeyEncrypted: encryptSecret(settings.apiKey) } : {}),
  };

  const config = await prisma.systemAiConfig.upsert({
    where: { id: SYSTEM_AI_CONFIG_ID },
    update: data,
    create: {
      id: SYSTEM_AI_CONFIG_ID,
      googleAiApiKeyEncrypted: settings.apiKey ? encryptSecret(settings.apiKey) : null,
      googleAiModel: settings.model,
      preferredAiProvider: "GOOGLE_AI_STUDIO",
      updatedById: adminUserId,
    },
  });
  return {
    configured: Boolean(config.googleAiApiKeyEncrypted),
    suffix: suffix(config.googleAiApiKeyEncrypted),
    model: config.googleAiModel ?? settings.model,
    active: true,
  };
}

export async function clearGoogleAiSettings(adminUserId: string) {
  await prisma.systemAiConfig.upsert({
    where: { id: SYSTEM_AI_CONFIG_ID },
    update: {
      googleAiApiKeyEncrypted: null,
      googleAiModel: null,
      preferredAiProvider: "OPENAI",
      updatedById: adminUserId,
    },
    create: {
      id: SYSTEM_AI_CONFIG_ID,
      preferredAiProvider: "OPENAI",
      updatedById: adminUserId,
    },
  });
}

export async function listChatModels() {
  const config = await getOrCreateSystemConfig();
  const provider = config.preferredAiProvider;
  const defaultModel =
    provider === "GOOGLE_AI_STUDIO"
      ? config.googleAiModel ?? ""
      : config.openAiModel ?? env.OPENAI_MODEL ?? "";
  const customGateway = provider === "OPENAI" && Boolean(config.openAiBaseUrl ?? env.OPENAI_BASE_URL);
  const catalog = resolveChatModelCatalog({
    provider,
    defaultModel,
    configuredModels: parseChatModelsText(config.chatModels),
    customGateway,
  });
  return {
    provider,
    defaultModel: catalog.defaultModel,
    models: catalog.models.map((id) => ({
      id,
      label: id === catalog.defaultModel ? `${id} (ค่าเริ่มต้น)` : id,
    })),
  };
}

export async function resolveOpenAiSettings(options?: { model?: string | null }) {
  const config = await getOrCreateSystemConfig();
  const catalog = await listChatModels();
  const allowed = catalog.models.map((model) => model.id);
  const selectedModel =
    matchAllowedModel(options?.model, allowed)
    ?? catalog.defaultModel;

  if (!selectedModel) {
    throw new Error("ยังไม่ได้ตั้งค่าโมเดล AI ในระบบ");
  }
  if (options?.model && !matchAllowedModel(options.model, allowed)) {
    throw new Error(`โมเดลที่เลือกไม่อยู่ในรายการที่ระบบอนุญาต: ${options.model}`);
  }

  if (config.preferredAiProvider === "GOOGLE_AI_STUDIO") {
    if (!config.googleAiApiKeyEncrypted) {
      throw new Error("ผู้ดูแลระบบยังไม่ได้ตั้งค่า Google AI Studio");
    }
    return {
      apiKey: decryptSecret(config.googleAiApiKeyEncrypted),
      model: selectedModel,
      store: false,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      provider: "google" as const,
      apiStyle: "chat" as const,
    };
  }

  const apiKey = config.openAiApiKeyEncrypted
    ? decryptSecret(config.openAiApiKeyEncrypted)
    : env.OPENAI_API_KEY;
  const baseURL = config.openAiBaseUrl ?? env.OPENAI_BASE_URL;
  if (!apiKey) throw new Error("ผู้ดูแลระบบยังไม่ได้ตั้งค่า OpenAI API key");
  return {
    apiKey,
    model: selectedModel,
    store: env.OPENAI_STORE_RESPONSES,
    baseURL: baseURL || undefined,
    provider: "openai" as const,
    apiStyle: baseURL ? ("chat" as const) : ("responses" as const),
  };
}

export const aiProviderSchema = z.enum(["OPENAI", "GOOGLE_AI_STUDIO"]);

export async function testAiConnection(providerInput: unknown) {
  const provider = aiProviderSchema.parse(providerInput);
  const config = await getOrCreateSystemConfig();
  const startedAt = Date.now();

  if (provider === "GOOGLE_AI_STUDIO") {
    if (!config.googleAiApiKeyEncrypted || !config.googleAiModel) {
      throw new Error("กรุณาบันทึกการตั้งค่า Google AI Studio ก่อนทดสอบ");
    }
    const model = config.googleAiModel;
    const baseURL = "https://generativelanguage.googleapis.com/v1beta/openai/";
    const client = new OpenAI({
      apiKey: decryptSecret(config.googleAiApiKeyEncrypted),
      baseURL,
      timeout: 30_000,
      maxRetries: 0,
    });
    await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Reply with OK." }],
      max_tokens: 8,
    });
    return { provider, model, latencyMs: Date.now() - startedAt, baseURL };
  }

  const apiKey = config.openAiApiKeyEncrypted
    ? decryptSecret(config.openAiApiKeyEncrypted)
    : env.OPENAI_API_KEY;
  const model = config.openAiModel ?? env.OPENAI_MODEL;
  const baseURL = config.openAiBaseUrl ?? env.OPENAI_BASE_URL;
  if (!apiKey || !model) {
    throw new Error("กรุณาบันทึกการตั้งค่า OpenAI ก่อนทดสอบ");
  }

  // ใช้โมเดลเดียวกับค่าเริ่มต้นของแชท (ไม่ใช่โมเดลจาก localStorage ของผู้ใช้)
  const client = new OpenAI({
    apiKey,
    baseURL: baseURL || undefined,
    timeout: 30_000,
    maxRetries: 0,
  });

  if (baseURL) {
    await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Reply with OK." }],
      max_tokens: 8,
    });
  } else {
    await client.responses.create({
      model,
      input: "Reply with OK.",
      max_output_tokens: 16,
      store: false,
    });
  }

  return { provider, model, latencyMs: Date.now() - startedAt, baseURL: baseURL || null };
}
