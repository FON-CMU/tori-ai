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

export const torTopicKindSchema = z.enum(["SECTION", "TOPIC", "SUBITEM"]);

/** Schema ส่งให้โมเดล — คงโครงตามฟอร์ม TOR (หมวด → หัวข้อ → รายการย่อย) */
export const torExtractionSchema = z.object({
  sections: z.array(
    z.object({
      category: categorySchema,
      label: z.string().nullable(),
      title: z.string().min(1),
      hoursPerWeek: z.number().nullable(),
      sourcePage: z.number().int().positive().nullable(),
      topics: z.array(
        z.object({
          code: z.string().nullable(),
          title: z.string().min(1),
          description: z.string().nullable(),
          hoursPerWeek: z.number().nullable(),
          sourcePage: z.number().int().positive().nullable(),
          confidence: z.number().min(0).max(1),
          items: z.array(
            z.object({
              code: z.string().nullable(),
              title: z.string().min(1),
              description: z.string().nullable(),
              hoursPerWeek: z.number().nullable(),
            }),
          ),
        }),
      ),
    }),
  ),
  warnings: z.array(z.string()),
});

export type TorExtractionTopic = {
  category: z.infer<typeof categorySchema>;
  kind: z.infer<typeof torTopicKindSchema>;
  sectionLabel: string | null;
  code: string | null;
  title: string;
  description: string | null;
  hoursPerWeek: number | null;
  sourcePage: number | null;
  confidence: number;
  matchable: boolean;
  selfKey: string;
  parentKey: string | null;
  sortOrder: number;
};

export type TorExtraction = {
  topics: TorExtractionTopic[];
  warnings: string[];
};

function asHoursPerWeek(value: unknown) {
  const number = asNullableNumber(value);
  if (number === null || number < 0) return null;
  return number;
}

function pushUniqueTopic(
  unique: Map<string, TorExtractionTopic>,
  topic: TorExtractionTopic,
) {
  const key = `${topic.kind}::${topic.category}::${topic.code ?? ""}::${topic.title.toLowerCase()}::${topic.parentKey ?? ""}`;
  if (!unique.has(key)) unique.set(key, topic);
}

function flattenLegacyTopicRow(
  row: Record<string, unknown>,
  fallbackCategory: z.infer<typeof categorySchema> | null,
  sortOrder: number,
): TorExtractionTopic | null {
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
    ?? fallbackCategory
    ?? inferCategoryFromText(title, asNullableString(row.description))
    ?? "ROUTINE";

  const kindRaw = asNullableString(row.kind)?.toUpperCase();
  const kind =
    kindRaw === "SECTION" || kindRaw === "SUBITEM" || kindRaw === "TOPIC"
      ? kindRaw
      : "TOPIC";

  const code = asNullableString(row.code ?? row.รหัส);
  const sectionLabel = asNullableString(row.sectionLabel ?? row.label ?? row.หมวดหัวข้อ);
  const selfKey =
    asNullableString(row.selfKey)
    ?? `${category}::${kind}::${code ?? title}`;
  const parentKey = asNullableString(row.parentKey);
  const sourcePage = asNullableNumber(row.sourcePage ?? row.page ?? row.pageNumber ?? row.หน้า);

  return {
    category,
    kind,
    sectionLabel,
    code,
    title,
    description: asNullableString(row.description ?? row.detail ?? row.รายละเอียด),
    hoursPerWeek: asHoursPerWeek(row.hoursPerWeek ?? row.hours ?? row.ชมต่อสัปดาห์ ?? row["ชม./สัปดาห์"]),
    sourcePage: sourcePage && sourcePage > 0 ? Math.round(sourcePage) : null,
    confidence: asConfidence(row.confidence ?? row.คะแนน),
    matchable: typeof row.matchable === "boolean" ? row.matchable : kind === "TOPIC",
    selfKey,
    parentKey,
    sortOrder: asNullableNumber(row.sortOrder) ?? sortOrder,
  };
}

/** แปลง JSON จากเกตเวย์ให้เข้า schema TOR ได้แม้ฟิลด์ไม่เป๊ะ และคงลำดับตามฟอร์ม */
export function normalizeTorExtraction(raw: unknown): TorExtraction {
  const record =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const unique = new Map<string, TorExtractionTopic>();
  let order = 0;

  const sectionsRaw = Array.isArray(record.sections) ? record.sections : [];
  for (const sectionItem of sectionsRaw) {
    if (!sectionItem || typeof sectionItem !== "object" || Array.isArray(sectionItem)) continue;
    const section = sectionItem as Record<string, unknown>;
    const category =
      asNullableCategory(section.category)
      ?? asNullableCategory(section.หมวด)
      ?? inferCategoryFromText(
        asNullableString(section.label),
        asNullableString(section.title),
      )
      ?? "ROUTINE";
    const sectionLabel =
      asNullableString(section.label)
      ?? asNullableString(section.sectionLabel)
      ?? asNullableString(section.heading);
    const sectionTitle =
      asNullableString(section.title)
      ?? sectionLabel
      ?? categoryLabelFallback(category);
    const sectionKey = `${category}::SECTION::${sectionTitle}`;
    const sectionPage = asNullableNumber(section.sourcePage ?? section.page);

    pushUniqueTopic(unique, {
      category,
      kind: "SECTION",
      sectionLabel,
      code: asNullableString(section.code),
      title: sectionTitle,
      description: asNullableString(section.description),
      hoursPerWeek: asHoursPerWeek(section.hoursPerWeek),
      sourcePage: sectionPage && sectionPage > 0 ? Math.round(sectionPage) : null,
      confidence: asConfidence(section.confidence ?? 0.8),
      matchable: false,
      selfKey: sectionKey,
      parentKey: null,
      sortOrder: order++,
    });

    const topicsInSection = Array.isArray(section.topics) ? section.topics : [];
    for (const topicItem of topicsInSection) {
      if (!topicItem || typeof topicItem !== "object" || Array.isArray(topicItem)) continue;
      const topic = topicItem as Record<string, unknown>;
      const topicTitle =
        asNullableString(topic.title)
        ?? asNullableString(topic.name)
        ?? asNullableString(topic.หัวข้อ);
      if (!topicTitle) continue;
      const topicCode = asNullableString(topic.code ?? topic.รหัส);
      const topicKey = `${category}::TOPIC::${topicCode ?? topicTitle}`;
      const topicPage = asNullableNumber(topic.sourcePage ?? topic.page);

      pushUniqueTopic(unique, {
        category,
        kind: "TOPIC",
        sectionLabel,
        code: topicCode,
        title: topicTitle,
        description: asNullableString(topic.description ?? topic.detail ?? topic.รายละเอียด),
        hoursPerWeek: asHoursPerWeek(topic.hoursPerWeek ?? topic.hours),
        sourcePage: topicPage && topicPage > 0 ? Math.round(topicPage) : null,
        confidence: asConfidence(topic.confidence ?? 0.8),
        matchable: true,
        selfKey: topicKey,
        parentKey: sectionKey,
        sortOrder: order++,
      });

      const items = Array.isArray(topic.items)
        ? topic.items
        : Array.isArray(topic.subItems)
          ? topic.subItems
          : Array.isArray(topic.children)
            ? topic.children
            : [];
      for (const itemRaw of items) {
        if (typeof itemRaw === "string" && itemRaw.trim()) {
          pushUniqueTopic(unique, {
            category,
            kind: "SUBITEM",
            sectionLabel,
            code: null,
            title: itemRaw.trim(),
            description: null,
            hoursPerWeek: null,
            sourcePage: null,
            confidence: 0.7,
            matchable: false,
            selfKey: `${category}::SUBITEM::${itemRaw.trim()}`,
            parentKey: topicKey,
            sortOrder: order++,
          });
          continue;
        }
        if (!itemRaw || typeof itemRaw !== "object" || Array.isArray(itemRaw)) continue;
        const item = itemRaw as Record<string, unknown>;
        const itemTitle =
          asNullableString(item.title)
          ?? asNullableString(item.name)
          ?? asNullableString(item.หัวข้อ);
        if (!itemTitle) continue;
        const itemCode = asNullableString(item.code ?? item.รหัส);
        pushUniqueTopic(unique, {
          category,
          kind: "SUBITEM",
          sectionLabel,
          code: itemCode,
          title: itemTitle,
          description: asNullableString(item.description ?? item.detail ?? item.รายละเอียด),
          hoursPerWeek: asHoursPerWeek(item.hoursPerWeek ?? item.hours),
          sourcePage: null,
          confidence: asConfidence(item.confidence ?? 0.75),
          matchable: false,
          selfKey: `${category}::SUBITEM::${itemCode ?? itemTitle}`,
          parentKey: topicKey,
          sortOrder: order++,
        });
      }
    }
  }

  // รูปแบบเก่า: topics แบน หรือจัดกลุ่มตามหมวด
  let topicsRaw: unknown[] = [];
  if (Array.isArray(record.topics)) topicsRaw = record.topics;
  else if (Array.isArray(record.items)) topicsRaw = record.items;
  else if (Array.isArray(record.data)) topicsRaw = record.data;
  else if (!sectionsRaw.length) {
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

  for (const item of topicsRaw) {
    if (typeof item === "string" && item.trim()) {
      pushUniqueTopic(unique, {
        category: "ROUTINE",
        kind: "TOPIC",
        sectionLabel: null,
        code: null,
        title: item.trim(),
        description: null,
        hoursPerWeek: null,
        sourcePage: null,
        confidence: 0.5,
        matchable: true,
        selfKey: `ROUTINE::TOPIC::${item.trim()}`,
        parentKey: null,
        sortOrder: order++,
      });
      continue;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const flattened = flattenLegacyTopicRow(item as Record<string, unknown>, null, order++);
    if (flattened) pushUniqueTopic(unique, flattened);
  }

  const topics = [...unique.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    topics,
    warnings: asStringArray(record.warnings ?? record.notes ?? record.คำเตือน),
  };
}

function categoryLabelFallback(category: z.infer<typeof categorySchema>) {
  if (category === "ROUTINE") return "1. งานประจำ";
  if (category === "ASSIGNED") return "2. งานที่ได้รับมอบหมาย";
  return "3. ภาระงานเชิงพัฒนา";
}
