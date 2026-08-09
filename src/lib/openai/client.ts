import "server-only";

import OpenAI from "openai";
import { APIError } from "openai/error";
import { zodResponseFormat, zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

import { torExtractionSystemPrompt, workExtractionSystemPrompt } from "@/lib/ai/work-system-prompt";
import {
  normalizeTorExtraction,
  normalizeWorkExtraction,
  torExtractionSchema,
  workExtractionSchema,
  type WorkExtraction,
} from "@/lib/validation/ai";
import { resolveOpenAiSettings } from "@/server/services/ai-settings-service";

type AiConfig = Awaited<ReturnType<typeof resolveOpenAiSettings>>;

function formatAiError(reason: unknown) {
  if (reason instanceof APIError) {
    const body =
      typeof reason.error === "object" && reason.error
        ? JSON.stringify(reason.error)
        : reason.message;
    return `HTTP ${reason.status ?? "?"} model request failed: ${body}`;
  }
  if (reason instanceof Error) {
    if (/timed?\s*out|timeout|ETIMEDOUT|AbortError/i.test(reason.message)) {
      return `timeout: ${reason.message}`;
    }
    return reason.message;
  }
  return "AI request failed";
}

function isTimeoutError(message: string) {
  return /timed?\s*out|timeout|ETIMEDOUT|AbortError/i.test(message);
}

/**
 * One AI operation may make several sequential calls (structured parse, then a
 * JSON-mode retry, then a bare completion). Each has its own timeout, so the
 * chain could outlive the hosting platform's function ceiling — and a request
 * the platform kills returns an opaque 504 instead of the Thai message the
 * callers already produce. The budget caps the whole chain instead.
 *
 * It covers only the model calls. The surrounding request also pays for a cold
 * start, the session check, two settings queries, document parsing and the
 * topic transaction, so this sits well under the 300s route ceiling rather
 * than filling it.
 */
const AI_TOTAL_BUDGET_MS = 200_000;
const AI_MIN_ATTEMPT_MS = 20_000;

type AiBudget = { take: (wanted: number) => number };

function startAiBudget(totalMs = AI_TOTAL_BUDGET_MS): AiBudget {
  const startedAt = Date.now();
  return {
    take(wanted: number) {
      const elapsed = Date.now() - startedAt;
      const left = totalMs - elapsed;
      // "timed out" is what isTimeoutError and the Thai error classifiers in
      // chat-service and tor-processing-service match on.
      if (left < AI_MIN_ATTEMPT_MS) throw new Error(`AI budget timed out after ${elapsed}ms`);
      return Math.min(wanted, left);
    },
  };
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(candidate.slice(start, end + 1)) as unknown;
  }
  return JSON.parse(candidate) as unknown;
}

function compactWorkPayload(input: {
  message: string;
  topics: unknown;
  currentDraft: unknown;
  learningRules?: unknown;
  referenceDate?: unknown;
  recentMessages?: unknown;
  alreadyFilled?: unknown;
}) {
  const topics = Array.isArray(input.topics)
    ? input.topics.slice(0, 40).map((topic) => {
        const item = topic as Record<string, unknown>;
        return {
          id: item.id,
          category: item.category,
          categoryLabel: item.categoryLabel,
          sectionLabel: item.sectionLabel ?? null,
          title: item.title,
          code: item.code ?? null,
          hoursPerWeek: item.hoursPerWeek ?? null,
        };
      })
    : [];

  const recentMessages = Array.isArray(input.recentMessages)
    ? input.recentMessages.slice(-6).map((message) => {
        const item = message as Record<string, unknown>;
        const content = typeof item.content === "string" ? item.content.slice(0, 500) : "";
        return { role: item.role, content };
      })
    : [];

  return {
    message: input.message,
    referenceDate: input.referenceDate,
    currentDraft: input.currentDraft,
    alreadyFilled: input.alreadyFilled,
    learningRules: input.learningRules,
    recentMessages,
    topics,
  };
}

async function completeJson(
  client: OpenAI,
  config: AiConfig,
  budget: AiBudget,
  system: string,
  user: string,
  options?: { maxTokens?: number },
) {
  const jsonHint = "ตอบเป็น JSON object เดียวเท่านั้น ห้ามมี markdown หรือข้อความนอก JSON";
  const maxTokens = options?.maxTokens ?? 2_048;

  // เกตเวย์ภายใน: ยิงครั้งเดียวแบบ Postman — อย่า retry ซ้ำเพราะจะ timeout สองเท่า
  const attempts: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming[] = config.baseURL
    ? [
        {
          model: config.model,
          messages: [
            { role: "system", content: `${system}\n${jsonHint}` },
            { role: "user", content: user },
          ],
          max_tokens: maxTokens,
        },
      ]
    : [
        {
          model: config.model,
          messages: [
            { role: "system", content: `${system}\n${jsonHint}` },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: maxTokens,
        },
        {
          model: config.model,
          messages: [
            { role: "system", content: `${system}\n${jsonHint}` },
            { role: "user", content: user },
          ],
          max_tokens: maxTokens,
        },
      ];

  const errors: string[] = [];
  for (const body of attempts) {
    try {
      const response = await client.chat.completions.create(body, {
        timeout: budget.take(config.baseURL ? 180_000 : 60_000),
      });
      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error("AI did not return content");
      return extractJsonObject(text);
    } catch (reason) {
      const formatted = formatAiError(reason);
      errors.push(formatted);
      // ถ้า timeout แล้ว ไม่ต้องลอง attempt ถัดไป — จะช้าซ้ำโดยเปล่าประโยชน์
      if (isTimeoutError(formatted)) break;
    }
  }

  throw new Error(
    `model=${config.model}; baseURL=${config.baseURL ?? "openai"}; ${errors.join(" | ")}`,
  );
}

async function parseWithChatCompletions<TSchema, TResult = TSchema>(
  client: OpenAI,
  config: AiConfig,
  budget: AiBudget,
  schema: z.ZodType<TSchema>,
  name: string,
  system: string,
  user: string,
  options?: {
    normalize?: (raw: unknown) => TResult;
    preferJsonObject?: boolean;
    maxTokens?: number;
  },
): Promise<TResult> {
  const normalize =
    options?.normalize
    ?? ((raw: unknown) => schema.parse(raw) as unknown as TResult);

  if (!options?.preferJsonObject && !config.baseURL) {
    try {
      const response = await client.chat.completions.parse({
        model: config.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: zodResponseFormat(schema, name),
      }, { timeout: budget.take(60_000) });
      const parsed = response.choices[0]?.message.parsed;
      if (parsed) return normalize(parsed);
    } catch {
      // fall through to json completion
    }
  }

  return normalize(await completeJson(client, config, budget, system, user, { maxTokens: options?.maxTokens }));
}

export async function extractTor(_userId: string, text: string) {
  const budget = startAiBudget();
  const config = await resolveOpenAiSettings();
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: config.baseURL ? 180_000 : 120_000,
    maxRetries: 0,
  });

  // เกตเวย์ภายในมักช้าและมี limit ขนาด prompt
  const maxChars = config.baseURL ? 24_000 : 120_000;
  let payload = text.trim();
  if (payload.length > maxChars) {
    const head = Math.floor(maxChars * 0.7);
    const tail = maxChars - head - 80;
    payload = `${payload.slice(0, head)}\n\n[...ตัดข้อความกลางเอกสาร...]\n\n${payload.slice(-tail)}`;
  }

  if (config.apiStyle === "chat") {
    const parsed = await parseWithChatCompletions(
      client,
      config,
      budget,
      torExtractionSchema,
      "tor_extraction",
      torExtractionSystemPrompt,
      payload,
      {
        preferJsonObject: true,
        maxTokens: 8_192,
        normalize: (raw) => {
          const normalized = normalizeTorExtraction(raw);
          if (!normalized.topics.length) {
            console.error("[tor] empty topics after normalize, raw keys:", raw && typeof raw === "object" ? Object.keys(raw as object) : typeof raw);
          }
          return normalized;
        },
      },
    );
    return parsed;
  }

  try {
    const response = await client.responses.parse({
      model: config.model,
      store: config.store,
      instructions: torExtractionSystemPrompt,
      input: payload,
      text: { format: zodTextFormat(torExtractionSchema, "tor_extraction") },
    }, { timeout: budget.take(80_000) });
    if (!response.output_parsed) throw new Error("AI did not return a valid TOR extraction");
    return normalizeTorExtraction(response.output_parsed);
  } catch (primaryError) {
    try {
      return await parseWithChatCompletions(
        client,
        config,
        budget,
        torExtractionSchema,
        "tor_extraction",
        torExtractionSystemPrompt,
        payload,
        {
          preferJsonObject: true,
          normalize: normalizeTorExtraction,
        },
      );
    } catch (fallbackError) {
      throw new Error(`${formatAiError(primaryError)} | ${formatAiError(fallbackError)}`);
    }
  }
}

export async function extractWork(
  _userId: string,
  input: {
    message: string;
    topics: unknown;
    currentDraft: unknown;
    learningRules?: unknown;
    referenceDate?: unknown;
    recentMessages?: unknown;
    alreadyFilled?: unknown;
  },
  options?: { model?: string | null },
): Promise<WorkExtraction> {
  const budget = startAiBudget();
  const config = await resolveOpenAiSettings({ model: options?.model });
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: config.baseURL ? 180_000 : 120_000,
    maxRetries: 0,
  });
  const content = JSON.stringify(compactWorkPayload(input));

  if (config.apiStyle === "chat") {
    return parseWithChatCompletions(
      client,
      config,
      budget,
      workExtractionSchema,
      "work_extraction",
      workExtractionSystemPrompt,
      content,
      {
        preferJsonObject: true,
        maxTokens: 2_048,
        normalize: normalizeWorkExtraction,
      },
    );
  }

  try {
    const response = await client.responses.parse({
      model: config.model,
      store: config.store,
      instructions: workExtractionSystemPrompt,
      input: content,
      text: { format: zodTextFormat(workExtractionSchema, "work_extraction") },
    }, { timeout: budget.take(80_000) });
    if (!response.output_parsed) throw new Error("AI did not return a valid work extraction");
    return normalizeWorkExtraction(response.output_parsed);
  } catch (primaryError) {
    try {
      return await parseWithChatCompletions(
        client,
        config,
        budget,
        workExtractionSchema,
        "work_extraction",
        workExtractionSystemPrompt,
        content,
        {
          preferJsonObject: true,
          normalize: normalizeWorkExtraction,
        },
      );
    } catch (fallbackError) {
      throw new Error(`${formatAiError(primaryError)} | ${formatAiError(fallbackError)}`);
    }
  }
}
