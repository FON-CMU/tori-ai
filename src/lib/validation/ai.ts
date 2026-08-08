import { z } from "zod";

import { workSubtypeSchemaValues } from "@/lib/ai/work-system-prompt";

export const categorySchema = z.enum(["ROUTINE", "ASSIGNED", "DEVELOPMENT"]);
export const workSubtypeSchema = z.enum(workSubtypeSchemaValues);

const nullableString = z.string().nullable();

function asNullableString(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === "null") return null;
    return trimmed;
  }
  return String(value);
}

function asNullableUuid(value: unknown) {
  const text = asNullableString(value);
  if (!text) return null;
  return z.uuid().safeParse(text).success ? text : null;
}

function asNullableCategory(value: unknown) {
  const raw = asNullableString(value);
  if (!raw) return null;

  const upper = raw.toUpperCase().replace(/\s+/g, "_");
  const direct = categorySchema.safeParse(upper);
  if (direct.success) return direct.data;

  const compact = raw.toLowerCase().replace(/[\s_\-./]/g, "");
  const aliases: Record<string, z.infer<typeof categorySchema>> = {
    routine: "ROUTINE",
    a: "ROUTINE",
    "1": "ROUTINE",
    งานประจำ: "ROUTINE",
    ประจำ: "ROUTINE",
    หน้าที่หลัก: "ROUTINE",
    assigned: "ASSIGNED",
    b: "ASSIGNED",
    "2": "ASSIGNED",
    งานที่ได้รับมอบหมาย: "ASSIGNED",
    ได้รับมอบหมาย: "ASSIGNED",
    มอบหมาย: "ASSIGNED",
    งานอื่น: "ASSIGNED",
    development: "DEVELOPMENT",
    develop: "DEVELOPMENT",
    c: "DEVELOPMENT",
    "3": "DEVELOPMENT",
    งานเชิงพัฒนา: "DEVELOPMENT",
    เชิงพัฒนา: "DEVELOPMENT",
    พัฒนา: "DEVELOPMENT",
    พัฒนาตนเอง: "DEVELOPMENT",
    ภาระงานเชิงพัฒนา: "DEVELOPMENT",
  };
  if (aliases[compact]) return aliases[compact];
  if (aliases[raw]) return aliases[raw];

  if (/ประจำ|routine|^a\b/i.test(raw)) return "ROUTINE";
  if (/มอบหมาย|กรรมการ|กิจกรรม|บริการวิชาการ|assigned|^b\b/i.test(raw)) return "ASSIGNED";
  if (/พัฒนา|อบรม|สัมมนา|ประชุม|ดูงาน|development|^c\b/i.test(raw)) return "DEVELOPMENT";
  return null;
}

function inferCategoryFromText(...parts: Array<string | null | undefined>) {
  const text = parts.filter(Boolean).join(" ");
  if (!text) return null;
  return asNullableCategory(text);
}

function asNullableSubtype(value: unknown) {
  const text = asNullableString(value)?.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  if (!text) return null;
  const aliases: Record<string, z.infer<typeof workSubtypeSchema>> = {
    A: "A",
    ROUTINE: "A",
    B_2_1: "B_2_1",
    B21: "B_2_1",
    "2_1": "B_2_1",
    B_2_2: "B_2_2",
    B22: "B_2_2",
    "2_2": "B_2_2",
    B_2_3: "B_2_3",
    B23: "B_2_3",
    "2_3": "B_2_3",
    C_3_1: "C_3_1",
    C31: "C_3_1",
    "3_1": "C_3_1",
    C_3_2: "C_3_2",
    C32: "C_3_2",
    "3_2": "C_3_2",
  };
  if (aliases[text]) return aliases[text];
  const parsed = workSubtypeSchema.safeParse(text);
  return parsed.success ? parsed.data : null;
}

function asNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function asConfidence(value: unknown) {
  const number = asNullableNumber(value);
  if (number === null) return 0.5;
  if (number > 1 && number <= 100) return Math.min(1, number / 100);
  return Math.min(1, Math.max(0, number));
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((item) => String(item)).filter(Boolean);
}

function asIsoDateTime(value: unknown) {
  const text = asNullableString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Schema สำหรับ OpenAI structured output — ไม่ใช้ transform */
export const workExtractionSchema = z.object({
  workTitle: nullableString,
  category: categorySchema.nullable(),
  workSubtype: workSubtypeSchema.nullable(),
  torTopicId: z.string().nullable(),
  description: nullableString,
  relatedUnit: nullableString,
  location: nullableString,
  eventDate: nullableString,
  startTime: nullableString,
  endTime: nullableString,
  startAt: nullableString,
  endAt: nullableString,
  totalHours: z.number().nullable(),
  result: nullableString,
  competency: nullableString,
  missingFields: z.array(z.string()),
  confidence: z.number(),
  nextQuestion: nullableString,
  userFacingReply: z.string(),
});

export type WorkExtraction = z.infer<typeof workExtractionSchema>;

/** แปลง JSON จากเกตเวย์ที่มักไม่ตรง schema เป๊ะ ให้ใช้งานได้ */
export function normalizeWorkExtraction(raw: unknown): WorkExtraction {
  const record = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};

  const userFacingReply =
    asNullableString(record.userFacingReply)
    ?? asNullableString(record.nextQuestion)
    ?? "กรุณาให้ข้อมูลงานเพิ่มเติม";

  return {
    workTitle: asNullableString(record.workTitle),
    category: asNullableCategory(record.category),
    workSubtype: asNullableSubtype(record.workSubtype),
    torTopicId: asNullableUuid(record.torTopicId),
    description: asNullableString(record.description),
    relatedUnit: asNullableString(record.relatedUnit),
    location: asNullableString(record.location),
    eventDate: asNullableString(record.eventDate),
    startTime: asNullableString(record.startTime),
    endTime: asNullableString(record.endTime),
    startAt: asIsoDateTime(record.startAt),
    endAt: asIsoDateTime(record.endAt),
    totalHours: (() => {
      const value = asNullableNumber(record.totalHours);
      return value === null || value < 0 ? null : value;
    })(),
    result: asNullableString(record.result),
    competency: asNullableString(record.competency),
    missingFields: asStringArray(record.missingFields),
    confidence: asConfidence(record.confidence),
    nextQuestion: asNullableString(record.nextQuestion),
    userFacingReply,
  };
}

export const torExtractionSchema = z.object({
  topics: z.array(
    z.object({
      category: categorySchema,
      code: z.string().nullable(),
      title: z.string().min(1),
      description: z.string().nullable(),
      sourcePage: z.number().int().positive().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  warnings: z.array(z.string()),
});

export type TorExtraction = z.infer<typeof torExtractionSchema>;

/** แปลง JSON จากเกตเวย์ให้เข้า schema TOR ได้แม้ฟิลด์ไม่เป๊ะ */
export function normalizeTorExtraction(raw: unknown): TorExtraction {
  const record =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  let topicsRaw: unknown[] = [];
  if (Array.isArray(record.topics)) topicsRaw = record.topics;
  else if (Array.isArray(record.items)) topicsRaw = record.items;
  else if (Array.isArray(record.data)) topicsRaw = record.data;
  else {
    // รูปแบบจัดกลุ่มตามหมวด เช่น { ROUTINE: [...], "งานประจำ": [...] }
    for (const [key, value] of Object.entries(record)) {
      if (!Array.isArray(value)) continue;
      const category = asNullableCategory(key);
      if (!category) continue;
      for (const item of value) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          topicsRaw.push({ ...(item as object), category });
        } else if (typeof item === "string" && item.trim()) {
          topicsRaw.push({ title: item.trim(), category });
        }
      }
    }
  }

  const topics = topicsRaw
    .map((item) => {
      if (typeof item === "string" && item.trim()) {
        return {
          category: "ROUTINE" as const,
          code: null,
          title: item.trim(),
          description: null,
          sourcePage: null,
          confidence: 0.5,
        };
      }
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const title =
        asNullableString(row.title)
        ?? asNullableString(row.name)
        ?? asNullableString(row.topic)
        ?? asNullableString(row.หัวข้อ)
        ?? asNullableString(row.ชื่องาน);
      if (!title) return null;

      const category =
        asNullableCategory(row.category)
        ?? asNullableCategory(row.หมวด)
        ?? asNullableCategory(row.type)
        ?? asNullableCategory(row.group)
        ?? inferCategoryFromText(title, asNullableString(row.description))
        ?? "ROUTINE";

      const sourcePage = asNullableNumber(row.sourcePage ?? row.page ?? row.pageNumber ?? row.หน้า);
      return {
        category,
        code: asNullableString(row.code ?? row.รหัส),
        title,
        description: asNullableString(row.description ?? row.detail ?? row.รายละเอียด),
        sourcePage: sourcePage && sourcePage > 0 ? Math.round(sourcePage) : null,
        confidence: asConfidence(row.confidence ?? row.คะแนน),
      };
    })
    .filter((topic): topic is NonNullable<typeof topic> => Boolean(topic));

  // ตัดหัวข้อซ้ำชื่อในหมวดเดียวกัน
  const unique = new Map<string, (typeof topics)[number]>();
  for (const topic of topics) {
    const key = `${topic.category}::${topic.title.toLowerCase()}`;
    if (!unique.has(key)) unique.set(key, topic);
  }

  return {
    topics: [...unique.values()],
    warnings: asStringArray(record.warnings ?? record.notes ?? record.คำเตือน),
  };
}
