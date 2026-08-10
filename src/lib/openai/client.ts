import "server-only";

import OpenAI from "openai";
import { APIError } from "openai/error";
import { zodResponseFormat, zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

import { torExtractionSystemPrompt, workExtractionSystemPrompt } from "@/lib/ai/work-system-prompt";
import { env } from "@/lib/env";
import {
  mergeTorExtractions,
  normalizeTorExtraction,
  normalizeWorkExtraction,
  torExtractionSchema,
  workExtractionSchema,
  type TorExtraction,
  type WorkExtraction,
} from "@/lib/validation/ai";
import { resolveOpenAiSettings } from "@/server/services/ai-settings-service";

type AiConfig = Awaited<ReturnType<typeof resolveOpenAiSettings>>;

type TorPageInput = { pageNumber: number; text: string };

function aiTimeoutMs() {
  return Math.min(env.AI_REQUEST_TIMEOUT_MS, 300_000);
}

/** งบเวลาต่อ chunk ให้รวมไม่เกินเพดานฟังก์ชัน Vercel ~300s */
function perChunkTimeoutMs(chunkCount: number) {
  const budget = Math.min(aiTimeoutMs(), 280_000);
  return Math.max(45_000, Math.floor(budget / Math.max(chunkCount, 1)));
}

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

function usesCompletionTokenParam(model: string) {
  return /^(gpt-5|o\d|o1|o3|o4)/i.test(model.trim()) || /reasoning/i.test(model);
}

function tokenLimitFields(model: string, maxTokens: number) {
  // โมเดล reasoning/gpt-5 ใช้ max_completion_tokens — ใส่ max_tokens แล้วเกตเวย์มักคืน content ว่าง
  if (usesCompletionTokenParam(model)) {
    return { max_completion_tokens: maxTokens };
  }
  return { max_tokens: maxTokens };
}

function readCompletionText(
  message: OpenAI.Chat.Completions.ChatCompletionMessage | undefined,
): string | null {
  if (!message) return null;

  if (typeof message.content === "string" && message.content.trim()) {
    return message.content;
  }

  const content = message.content as unknown;
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const record = part as Record<string, unknown>;
        if (typeof record.text === "string") return record.text;
        if (typeof record.content === "string") return record.content;
        return "";
      })
      .join("")
      .trim();
    if (joined) return joined;
  }

  const record = message as unknown as Record<string, unknown>;
  for (const key of ["output_text", "text", "reasoning_content", "reasoning"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim() && /[{[]/.test(value)) {
      return value;
    }
  }

  return null;
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  if (start < 0) return JSON.parse(candidate) as unknown;

  const slice = candidate.slice(start);
  try {
    return JSON.parse(slice) as unknown;
  } catch {
    // โมเดล reasoning มักตัด JSON กลางคัน — พยายามปิดวงเล็บที่ค้าง
    const repaired = repairTruncatedJson(slice);
    return JSON.parse(repaired) as unknown;
  }
}

function repairTruncatedJson(raw: string) {
  let text = raw.trim();
  // ตัดเศษหลัง comma ท้ายค้าง
  text = text.replace(/,\s*$/, "");

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    if (ch === "}" || ch === "]") {
      if (stack.length && stack[stack.length - 1] === ch) stack.pop();
    }
  }
  if (inString) text += "\"";
  text = text.replace(/,\s*$/, "");
  while (stack.length) text += stack.pop();
  return text;
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
  system: string,
  user: string,
  options?: { maxTokens?: number },
) {
  const jsonHint = "ตอบเป็น JSON object เดียวเท่านั้น ห้ามมี markdown หรือข้อความนอก JSON";
  // gpt-5/reasoning ใช้โทเคน reasoning ก่อน content — ต้องเผื่อเยอะกว่าปกติ
  const maxTokens = options?.maxTokens
    ?? (usesCompletionTokenParam(config.model) ? 12_288 : 2_048);
  const tokenFields = tokenLimitFields(config.model, maxTokens);

  // เกตเวย์ภายใน: ยิงครั้งเดียวแบบ Postman — อย่า retry timeout ซ้ำ
  const attempts: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming[] = config.baseURL
    ? [
        {
          model: config.model,
          messages: [
            { role: "system", content: `${system}\n${jsonHint}` },
            { role: "user", content: user },
          ],
          ...tokenFields,
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
          ...tokenFields,
        },
        {
          model: config.model,
          messages: [
            { role: "system", content: `${system}\n${jsonHint}` },
            { role: "user", content: user },
          ],
          ...tokenFields,
        },
      ];

  const errors: string[] = [];
  for (const body of attempts) {
    try {
      const response = await client.chat.completions.create(body);
      const choice = response.choices[0];
      const text = readCompletionText(choice?.message);
      if (!text) {
        const finish = choice?.finish_reason ?? "unknown";
        const keys = choice?.message ? Object.keys(choice.message).join(",") : "none";
        throw new Error(`AI did not return content (finish=${finish}; messageKeys=${keys})`);
      }
      return extractJsonObject(text);
    } catch (reason) {
      const formatted = formatAiError(reason);
      errors.push(formatted);
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
      });
      const parsed = response.choices[0]?.message.parsed;
      if (parsed) return normalize(parsed);
    } catch {
      // fall through to json completion
    }
  }

  return normalize(await completeJson(client, config, system, user, { maxTokens: options?.maxTokens }));
}

function formatTorPageBlock(page: TorPageInput) {
  return `[หน้า ${page.pageNumber}]\n${page.text.trim()}`;
}

function pagesFromTorInput(input: string | TorPageInput[]): TorPageInput[] {
  if (Array.isArray(input)) {
    return input
      .map((page) => ({ pageNumber: page.pageNumber, text: page.text.trim() }))
      .filter((page) => page.text.length > 0);
  }
  const trimmed = input.trim();
  if (!trimmed) return [];
  const parts = trimmed.split(/\n\n(?=\[หน้า\s+\d+\])/);
  if (parts.length > 1) {
    return parts.map((part, index) => {
      const match = part.match(/^\[หน้า\s+(\d+)\]\n?([\s\S]*)$/);
      if (!match) return { pageNumber: index + 1, text: part.trim() };
      return { pageNumber: Number(match[1]), text: match[2].trim() };
    });
  }
  return [{ pageNumber: 1, text: trimmed }];
}

function buildTorTextChunks(pages: TorPageInput[], maxChars: number) {
  if (!pages.length) return [] as string[];
  const chunks: string[] = [];
  let current = "";
  for (const page of pages) {
    const block = formatTorPageBlock(page);
    if (current && current.length + block.length + 2 > maxChars) {
      chunks.push(current);
      current = block;
      continue;
    }
    current = current ? `${current}\n\n${block}` : block;
  }
  if (current) chunks.push(current);
  return chunks;
}

function splitOversizedChunk(text: string, maxChars: number) {
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    parts.push(text.slice(cursor, cursor + maxChars));
    cursor += maxChars;
  }
  return parts;
}

async function extractTorChunk(
  client: OpenAI,
  config: AiConfig,
  payload: string,
  options: { maxTokens: number; label?: string },
) {
  const userPayload = options.label
    ? `${options.label}\n\n${payload}`
    : payload;

  if (config.apiStyle === "chat") {
    return parseWithChatCompletions(
      client,
      config,
      torExtractionSchema,
      "tor_extraction",
      torExtractionSystemPrompt,
      userPayload,
      {
        preferJsonObject: true,
        maxTokens: options.maxTokens,
        normalize: (raw) => {
          const normalized = normalizeTorExtraction(raw);
          if (!normalized.topics.length) {
            console.error(
              "[tor] empty topics after normalize, raw keys:",
              raw && typeof raw === "object" ? Object.keys(raw as object) : typeof raw,
            );
          }
          return normalized;
        },
      },
    );
  }

  try {
    const response = await client.responses.parse({
      model: config.model,
      store: config.store,
      instructions: torExtractionSystemPrompt,
      input: userPayload,
      text: { format: zodTextFormat(torExtractionSchema, "tor_extraction") },
    });
    if (!response.output_parsed) throw new Error("AI did not return a valid TOR extraction");
    return normalizeTorExtraction(response.output_parsed);
  } catch (primaryError) {
    try {
      return await parseWithChatCompletions(
        client,
        config,
        torExtractionSchema,
        "tor_extraction",
        torExtractionSystemPrompt,
        userPayload,
        {
          preferJsonObject: true,
          maxTokens: options.maxTokens,
          normalize: normalizeTorExtraction,
        },
      );
    } catch (fallbackError) {
      throw new Error(`${formatAiError(primaryError)} | ${formatAiError(fallbackError)}`);
    }
  }
}

export async function extractTor(_userId: string, input: string | TorPageInput[]) {
  const config = await resolveOpenAiSettings();
  const pages = pagesFromTorInput(input);
  if (!pages.length) {
    return { topics: [], warnings: ["เอกสารไม่มีข้อความให้วิเคราะห์"] } satisfies TorExtraction;
  }

  const gateway = Boolean(config.baseURL);
  // เกตเวย์ภายในช้า — ตัด prompt สั้น + จำกัดโทเคนคำตอบ แล้วแบ่งหลายรอบ
  const maxChars = gateway ? 10_000 : 120_000;
  const maxTokens = gateway
    ? 4_096
    : usesCompletionTokenParam(config.model)
      ? 12_288
      : 4_096;

  let chunks = buildTorTextChunks(pages, maxChars).flatMap((chunk) =>
    splitOversizedChunk(chunk, maxChars),
  );
  if (!chunks.length) chunks = [formatTorPageBlock(pages[0]!)];

  // ถ้ายังชิ้นเดียวและยาวมาก ให้ผ่าครึ่งเพื่อลดโอกาส timeout
  if (gateway && chunks.length === 1 && (chunks[0]?.length ?? 0) > maxChars * 0.7) {
    chunks = splitOversizedChunk(chunks[0]!, Math.ceil((chunks[0]?.length ?? 0) / 2));
  }

  const timeout = perChunkTimeoutMs(chunks.length);
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout,
    maxRetries: 0,
  });

  console.info(
    "[tor] extractTor chunks:",
    chunks.length,
    "timeoutMs:",
    timeout,
    "maxTokens:",
    maxTokens,
    "gateway:",
    gateway,
  );

  const results: TorExtraction[] = [];
  const errors: string[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]!;
    const label =
      chunks.length > 1
        ? `นี่คือส่วนที่ ${index + 1}/${chunks.length} ของเอกสาร TOR — สกัดเฉพาะหัวข้อที่ปรากฏในส่วนนี้`
        : undefined;
    try {
      results.push(await extractTorChunk(client, config, chunk, { maxTokens, label }));
    } catch (reason) {
      const formatted = formatAiError(reason);
      errors.push(`chunk ${index + 1}/${chunks.length}: ${formatted}`);
      console.error("[tor] extractTor chunk failed:", formatted);
      // ถ้าทุก chunk ล้ม ให้โยน; ถ้าได้บางส่วนแล้วไปรวมต่อ
      if (!results.length && index === chunks.length - 1) {
        throw new Error(
          `model=${config.model}; baseURL=${config.baseURL ?? "openai"}; ${errors.join(" | ")}`,
        );
      }
    }
  }

  if (!results.length) {
    throw new Error(
      `model=${config.model}; baseURL=${config.baseURL ?? "openai"}; ${errors.join(" | ") || "no TOR chunks succeeded"}`,
    );
  }

  const merged = mergeTorExtractions(results);
  if (errors.length) {
    merged.warnings.push(`วิเคราะห์บางส่วนไม่สำเร็จ (${errors.length} ส่วน) — ผลอาจไม่ครบ`);
  }
  return merged;
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
  const config = await resolveOpenAiSettings({ model: options?.model });
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: aiTimeoutMs(),
    maxRetries: 0,
  });
  const content = JSON.stringify(compactWorkPayload(input));

  if (config.apiStyle === "chat") {
    return parseWithChatCompletions(
      client,
      config,
      workExtractionSchema,
      "work_extraction",
      workExtractionSystemPrompt,
      content,
      {
        preferJsonObject: true,
        maxTokens: usesCompletionTokenParam(config.model) ? 12_288 : 2_048,
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
    });
    if (!response.output_parsed) throw new Error("AI did not return a valid work extraction");
    return normalizeWorkExtraction(response.output_parsed);
  } catch (primaryError) {
    try {
      return await parseWithChatCompletions(
        client,
        config,
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
