import { z } from "zod";

import type { WorkSubtype } from "@/lib/ai/work-system-prompt";
import { workSubtypeLabel } from "@/lib/ai/work-system-prompt";
import { extractThaiMonthYearHint } from "@/lib/date";
import { categorySchema } from "./ai";

const categoryLabel = {
  ROUTINE: "งานประจำ",
  ASSIGNED: "งานที่ได้รับมอบหมาย",
  DEVELOPMENT: "งานเชิงพัฒนา",
} as const;

export const workInputSchema = z
  .object({
    workTitle: z.string().trim().min(1),
    category: categorySchema,
    torTopicId: z.uuid(),
    description: z.string().trim().min(1),
    relatedUnit: z.string().trim().optional(),
    location: z.string().trim().optional(),
    startAt: z.coerce.date().nullable().optional(),
    endAt: z.coerce.date().nullable().optional(),
    totalHours: z.coerce.number().nonnegative().nullable().optional(),
    result: z.string().trim().min(1),
    /** ผู้ใช้ยืนยันว่าไม่ระบุวัน–เวลาของงานชิ้นนี้ */
    scheduleSkipped: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    const hasStart = value.startAt instanceof Date && !Number.isNaN(value.startAt.getTime());
    const hasEnd = value.endAt instanceof Date && !Number.isNaN(value.endAt.getTime());
    const hasHours = typeof value.totalHours === "number" && Number.isFinite(value.totalHours);
    if (value.scheduleSkipped) return;
    if (!hasStart) {
      context.addIssue({ code: "custom", path: ["startAt"], message: "กรุณาระบุวันเวลาเริ่ม" });
    }
    if (!hasEnd) {
      context.addIssue({ code: "custom", path: ["endAt"], message: "กรุณาระบุวันเวลาสิ้นสุด" });
    }
    if (!hasHours) {
      context.addIssue({ code: "custom", path: ["totalHours"], message: "กรุณาระบุจำนวนชั่วโมง" });
    }
    if (hasStart && hasEnd && value.endAt! < value.startAt!) {
      context.addIssue({ code: "custom", path: ["endAt"], message: "เวลาสิ้นสุดต้องไม่ก่อนเวลาเริ่ม" });
    }
  });

export const requiredDraftFields = [
  "workTitle",
  "category",
  "torTopicId",
  "description",
  "startAt",
  "endAt",
  "totalHours",
  "result",
] as const;

const scheduleDraftFields = new Set(["startAt", "endAt", "totalHours", "eventDate", "startTime", "endTime"]);

function isBlank(value: unknown) {
  return value === null || value === undefined || value === "";
}

/** ฟิลด์ที่ต้องมีเพิ่มตามประเภทย่อย A/B/C */
export function requiredFieldsForSubtype(subtype: WorkSubtype | null | undefined): string[] {
  const base = [...requiredDraftFields];
  switch (subtype) {
    case "B_2_1":
    case "B_2_2":
      return [...base, "location"];
    case "B_2_3":
      return [...base, "relatedUnit"];
    case "C_3_1":
      return [...base, "location", "competency"];
    case "C_3_2":
      return base;
    case "A":
    default:
      return base;
  }
}

export function findMissingFields(
  draft: Record<string, unknown>,
  subtype?: WorkSubtype | null,
  options?: { scheduleOptional?: boolean },
) {
  return requiredFieldsForSubtype(subtype).filter((field) => {
    if (options?.scheduleOptional && scheduleDraftFields.has(field)) return false;
    return isBlank(draft[field]);
  });
}

/** ผู้ใช้บอกว่าไม่ต้อง / ไม่สามารถระบุวัน–เวลา */
export function isSkipScheduleIntent(message: string) {
  const text = message.replace(/\s+/g, " ").trim();
  if (!text) return false;
  const compact = text.toLowerCase().replace(/\s+/g, "");
  if (
    /^(ไม่ต้องระบุ|ไม่ระบุ|ข้าม|ไม่มีวันเวลา|ไม่มีเวลา)(วัน|เวลา|ช่วงเวลา|วันที่)?([และกับ].*)?[!.。]*$/i.test(
      compact,
    )
  ) {
    return true;
  }
  return (
    /ไม่(?:ต้อง|ได้|สามารถ)?(?:ระบุ|ใส่|ลง)?(?:วัน|เวลา|ช่วงเวลา|วันเวลา)/.test(text)
    || /(?:ระบุ|ใส่|ลง)(?:วัน|เวลา|ช่วงเวลา|วันเวลา).{0,12}ไม่ได้/.test(text)
    || /ข้าม(?:การ)?(?:ระบุ)?(?:วัน|เวลา|ช่วงเวลา)/.test(text)
    || /ไม่มี(?:วัน|เวลา|ช่วงเวลา)(?:ที่)?(?:ชัด|แน่นอน|ระบุ)?/.test(text)
    || /บันทึก(?:ไป)?(?:เลย)?(?:โดย)?ไม่(?:ต้อง)?(?:มี|ระบุ)(?:วัน|เวลา)/.test(text)
  );
}

/** ผู้ใช้ยืนยันให้บันทึกร่างที่มีอยู่ตามนี้ (ข้ามวัน–เวลาที่ยังขาดได้) */
export function isSaveAsIsIntent(message: string) {
  const compact = message.trim().toLowerCase().replace(/\s+/g, "");
  if (!compact) return false;
  return (
    /^(บันทึกตามนี้|บันทึกแบบนี้|บันทึกเลยตามนี้|เอาตามนี้|ตามนี้เลย|ตามนี้|โอเคตามนี้|ตกลงตามนี้|okตามนี้|saveasis|saveas-is)[!。.]*$/.test(
      compact,
    )
    || /บันทึกตามนี้|บันทึกแบบนี้|เอาตามร่างนี้/.test(message.replace(/\s+/g, " ").trim())
  );
}

/** ขาดแค่ฟิลด์วัน–เวลาเท่านั้นหรือไม่ */
export function onlyScheduleFieldsMissing(missing: string[]) {
  if (!missing.length) return false;
  return missing.every((field) =>
    field === "startAt"
    || field === "endAt"
    || field === "totalHours"
    || field === "eventDate"
    || field === "startTime"
    || field === "endTime",
  );
}

/** ผู้ใช้ต้องการเปลี่ยนหมวดของร่างที่มีอยู่ */
export function isCategoryChangeIntent(message: string) {
  const text = message.replace(/\s+/g, " ").trim();
  if (!text) return false;
  return (
    /เปลี่ยน\s*หมวด|ย้าย\s*(?:ไป\s*)?หมวด|แก้\s*หมวด|ปรับ\s*หมวด/.test(text)
    || /หมวด(?:นี้)?(?:เป็น|ไป(?:เป็น)?|คือ)/.test(text)
    || /เปลี่ยนเป็น(?:หมวด)?(?:งาน)?(?:ประจำ|มอบหมาย|เชิงพัฒนา)/.test(text)
  );
}

/** ดึงปี พ.ศ. ของ TOR จากข้อความ */
export function parseTorYearFromMessage(message: string) {
  const text = message.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const patterns = [
    /(?:ใช้|เลือก|เปลี่ยน)?(?:ปี|TOR)\s*(?:พ\.?\s*ศ\.?\s*)?(\d{4})/i,
    /พ\.?\s*ศ\.?\s*(\d{4})/i,
    /^(\d{4})$/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const year = Number(match[1]);
    if (year >= 2500 && year <= 2700) return year;
    if (year >= 2000 && year <= 2100) return year + 543;
  }
  return null;
}

export function isSaveDuplicateIntent(message: string) {
  const compact = message.trim().toLowerCase().replace(/\s+/g, "");
  return /^(บันทึกใหม่|บันทึกเป็นรายการใหม่|สร้างใหม่|ยืนยันบันทึกใหม่|saveasnew|save.?new)[!。.]*$/.test(
    compact,
  ) || /บันทึก(?:เป็น)?(?:รายการ)?ใหม่/.test(message);
}

export function isCancelDuplicateIntent(message: string) {
  const compact = message.trim().toLowerCase().replace(/\s+/g, "");
  return /^(ยกเลิก|ไม่บันทึก|ไม่เอา|cancel)[!。.]*$/.test(compact);
}

/** เลือกหมายเลขตัวเลือกหัวข้อ เช่น "1" / "หัวข้อ 2" */
export function parseTopicChoiceIndex(message: string, optionCount: number) {
  if (optionCount <= 0) return null;
  const text = message.replace(/\s+/g, " ").trim();
  const match =
    text.match(/^(?:เลือก\s*)?(?:หัวข้อ\s*)?(\d{1,2})(?:\s*[).）])?$/)
    ?? text.match(/^(\d{1,2})$/);
  if (!match?.[1]) return null;
  const index = Number(match[1]);
  if (!Number.isInteger(index) || index < 1 || index > optionCount) return null;
  return index - 1;
}

export function scoreTorTopicMatch(
  topic: { title: string; description?: string | null },
  workTitle: string | null,
  description: string | null,
) {
  const hay = `${topic.title} ${topic.description ?? ""}`.toLowerCase().replace(/\s+/g, " ");
  let score = 0;
  for (const raw of [workTitle, description]) {
    if (!raw?.trim()) continue;
    const needle = raw.toLowerCase().replace(/\s+/g, " ").trim();
    if (hay.includes(needle.slice(0, Math.min(24, needle.length)))) score += 4;
    if (needle.includes(topic.title.toLowerCase().slice(0, Math.min(20, topic.title.length)))) score += 5;
    for (const word of needle.split(" ").filter((item) => item.length > 2).slice(0, 10)) {
      if (hay.includes(word)) score += 1;
    }
  }
  return score;
}

export function selectTopicCandidates<T extends { id: string; title: string; description?: string | null }>(
  topics: T[],
  workTitle: string | null,
  description: string | null,
  limit = 5,
) {
  if (!topics.length) return [] as T[];
  const ranked = topics
    .map((topic) => ({ topic, score: scoreTorTopicMatch(topic, workTitle, description) }))
    .sort((a, b) => b.score - a.score || a.topic.title.localeCompare(b.topic.title, "th"));
  const best = ranked[0]!;
  if (best.score <= 0) {
    return ranked.slice(0, Math.min(3, ranked.length)).map((row) => row.topic);
  }
  const close = ranked.filter((row) => row.score >= best.score - 1);
  if (close.length >= 2) return close.slice(0, limit).map((row) => row.topic);
  return [best.topic];
}

/** แปลงคำตอบสั้น ๆ ของผู้ใช้เป็นหมวด TOR */
export function parseCategoryAnswer(message: string) {
  const text = message.trim();
  if (!text) return null;
  const compact = text.toLowerCase().replace(/\s+/g, "");

  if (
    /^(a|routine|ประจำ|งานประจำ)$/i.test(compact)
    || /งานประจำ|หมวดประจำ|หน้าที่หลัก/.test(text)
  ) {
    return "ROUTINE" as const;
  }
  if (
    /^(b|assigned|มอบหมาย|รับมอบหมาย)$/i.test(compact)
    || /งานที่ได้รับมอบหมาย|ได้รับมอบหมาย|หมวดมอบหมาย/.test(text)
  ) {
    return "ASSIGNED" as const;
  }
  if (
    /^(c|development|develop|พัฒนา|เชิงพัฒนา)$/i.test(compact)
    || /งานเชิงพัฒนา|ภาระงานเชิงพัฒนา|หมวดพัฒนา/.test(text)
  ) {
    return "DEVELOPMENT" as const;
  }
  return null;
}

/** เดาหมวดจากลักษณะงานเมื่อผู้ใช้เล่าเนื้อหา */
export function inferCategoryFromWorkText(message: string) {
  const text = message.trim();
  if (!text) return null;
  if (
    /อบรม|สัมมนา|ประชุม|ศึกษาดูงาน|workshop|training|พัฒนาตนเอง|เชิงพัฒนา|พัฒนาระบบ|พัฒนาซอฟต์แวร์|พัฒนาเว็บ|ปรับปรุงระบบ|edonation|e-donation/i.test(
      text,
    )
  ) {
    return "DEVELOPMENT" as const;
  }
  if (/กรรมการ|คณะกรรมการ|กิจกรรม|บริการวิชาการ|มอบหมาย/i.test(text)) {
    return "ASSIGNED" as const;
  }
  if (
    /งานประจำ|ประจำวัน|หน้าที่หลัก|ดูแลระบบ|ระบบสารสนเทศ|งานบริหาร|งานธุรการ|อัปเดตระบบ|update\s*ระบบ|ดูแล\s*url|ดูแลเว็บ/i.test(
      text,
    )
  ) {
    return "ROUTINE" as const;
  }
  return null;
}

export function inferSubtypeFromWorkText(
  message: string,
  category: "ROUTINE" | "ASSIGNED" | "DEVELOPMENT" | null,
): WorkSubtype | null {
  const text = message.trim();
  if (!text) return null;
  if (category === "ROUTINE") return "A";
  if (category === "DEVELOPMENT") {
    if (
      /ปรับปรุงกระบวนการ|พัฒนากระบวนการ|workflow|พัฒนาระบบ|พัฒนาซอฟต์แวร์|พัฒนาเว็บ|ปรับปรุงระบบ|edonation|e-donation/i.test(
        text,
      )
    ) {
      return "C_3_2";
    }
    if (/อบรม|สัมมนา|ประชุม|ศึกษาดูงาน|workshop|training/i.test(text)) return "C_3_1";
    return "C_3_1";
  }
  if (category === "ASSIGNED") {
    if (/กรรมการ|คณะกรรมการ/i.test(text)) return "B_2_2";
    if (/บริการวิชาการ/i.test(text)) return "B_2_3";
    if (/กิจกรรม|อบรม|เข้าร่วม/i.test(text)) return "B_2_1";
    return "B_2_1";
  }
  return null;
}

/** สร้างชื่องานสั้นจากข้อความผู้ใช้ โดยไม่ต้องถามซ้ำ */
export function deriveWorkTitle(message: string, description?: string | null) {
  const source = (description || message).replace(/\s+/g, " ").trim();
  if (!source) return null;

  const training = source.match(/(?:เข้าร่วม)?(?:การ)?อบรม(?:เรื่อง|หัวข้อ)?\s*([^.\n]+?)(?:\s+ตั้งแต่|\s+เวลา|\s+ที่|\s+เนื้อหา|$)/i);
  if (training?.[1]) return `เข้าร่วมอบรมเรื่อง ${training[1].trim()}`.slice(0, 80);

  const seminar = source.match(/(?:เข้าร่วม)?(?:การ)?สัมมนา(?:เรื่อง|หัวข้อ)?\s*([^.\n]+?)(?:\s+ตั้งแต่|\s+เวลา|\s+ที่|\s+เนื้อหา|$)/i);
  if (seminar?.[1]) return `เข้าร่วมสัมมนาเรื่อง ${seminar[1].trim()}`.slice(0, 80);

  const meeting = source.match(/(?:เข้าร่วม)?(?:การ)?ประชุม(?:เรื่อง|หัวข้อ)?\s*([^.\n]+?)(?:\s+ตั้งแต่|\s+เวลา|\s+ที่|\s+เนื้อหา|$)/i);
  if (meeting?.[1]) return `เข้าร่วมประชุมเรื่อง ${meeting[1].trim()}`.slice(0, 80);

  const edonation = source.match(/พัฒนาระบบรับบริจาคออนไลน์\s*\(?\s*eDonation\s*\)?/i)
    ?? source.match(/ระบบ\s*eDonation/i);
  if (edonation?.[0]) return edonation[0].replace(/\s+/g, " ").trim().slice(0, 80);

  const systemDev = source.match(/พัฒนาระบบ[^.\n]{0,40}/i);
  if (systemDev?.[0]) return systemDev[0].trim().slice(0, 80);

  const systemCare = source.match(/งานดูแลระบบ[^.\n]{0,40}|ดูแลระบบสารสนเทศ[^.\n]{0,40}/i);
  if (systemCare?.[0]) return systemCare[0].trim().slice(0, 80);

  const short = source.split(/(?:ตั้งแต่|เวลา|ที่|เนื้อหา|เพื่อ)/)[0]?.trim();
  if (short && short.length >= 6) return short.slice(0, 80);
  return source.slice(0, 80);
}

function truncateText(value: string, max: number) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** สรุปสิ่งที่ระบบเข้าใจแล้วก่อนถามฟิลด์ที่ขาด */
export function buildDraftProgressAck(input: {
  workTitle?: string | null;
  category?: string | null;
  workSubtype?: WorkSubtype | null;
  topicTitle?: string | null;
  description?: string | null;
  location?: string | null;
  relatedUnit?: string | null;
  competency?: string | null;
  result?: string | null;
  userMessage?: string | null;
  eventDate?: string | null;
}) {
  const lines: string[] = [];
  if (input.workTitle) lines.push(`• ชื่องาน: ${input.workTitle}`);
  if (input.category) {
    lines.push(`• หมวด: ${categoryLabel[input.category as keyof typeof categoryLabel] ?? input.category}`);
  }
  if (input.workSubtype) lines.push(`• ประเภทย่อย: ${workSubtypeLabel[input.workSubtype]}`);
  if (input.topicTitle) lines.push(`• หัวข้อ TOR: ${input.topicTitle}`);
  if (input.description) lines.push(`• รายละเอียด: ${truncateText(input.description, 220)}`);
  if (input.location) lines.push(`• สถานที่: ${input.location}`);
  if (input.relatedUnit) lines.push(`• หน่วยงานที่เกี่ยวข้อง: ${input.relatedUnit}`);
  if (input.competency) lines.push(`• สมรรถนะ: ${truncateText(input.competency, 120)}`);
  if (input.result && input.result !== input.description) {
    lines.push(`• ผลลัพธ์: ${truncateText(input.result, 120)}`);
  }
  if (!input.eventDate && input.userMessage) {
    const monthHint = extractThaiMonthYearHint(input.userMessage);
    if (monthHint) {
      lines.push(`• ช่วงที่กล่าวถึง: ${monthHint} (ยังต้องระบุวันและเวลาที่ทำจริง)`);
    }
  }

  if (!lines.length) return null;
  return ["รับทราบแล้ว ดึงข้อมูลมาเป็นร่าง JA ดังนี้:", ...lines].join("\n");
}

/** ตอบแบบเลขา: สรุปที่เข้าใจ + ถามเฉพาะช่องที่ยังขาด */
export function composeCollectingReply(input: {
  acknowledgement?: string | null;
  question?: string | null;
  aiReply?: string | null;
  fallback?: string;
}) {
  const question = input.question?.trim() || null;
  const ack = input.acknowledgement?.trim() || null;
  const ai = input.aiReply?.trim() || null;
  const fallback = input.fallback?.trim() || "กรุณาให้ข้อมูลเพิ่มเติม";

  if (ack && question) return `${ack}\n\n${question}`;
  if (ack) return ack;
  if (question && ai && ai !== question && !looksLikeOnlyMissingPrompt(ai)) {
    return `${ai}\n\n${question}`;
  }
  return question || ai || fallback;
}

function looksLikeOnlyMissingPrompt(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length > 160) return false;
  return /กรุณาระบุ|ขอ(?:ทราบ)?วัน|ช่วงเวลา|วันที่และช่วงเวลา/.test(normalized);
}

export function deriveDescription(message: string) {
  const text = message.replace(/\s+/g, " ").trim();
  if (text.length < 8) return null;
  if (/^(อบรม|ประชุม|สัมมนา|เข้าร่วม)/.test(text)) return text.slice(0, 500);
  if (/มีการอบรม|เข้าร่วมอบรม|ไปอบรม/.test(text)) {
    return `เข้าร่วม${text.replace(/^.*?(อบรม)/, "อบรม")}`.slice(0, 500);
  }
  return text.slice(0, 500);
}

export function deriveCompetency(message: string) {
  const match = message.match(/(?:เนื้อหา(?:คือ)?|เรียนรู้|ทักษะ|สมรรถนะ)\s*[:：]?\s*(.+)$/im);
  return match?.[1]?.trim().slice(0, 200) || null;
}

const fieldQuestionPriority = [
  "category",
  "torTopicId",
  "workTitle",
  "description",
  "eventDate",
  "startTime",
  "endTime",
  "startAt",
  "endAt",
  "location",
  "relatedUnit",
  "competency",
  "totalHours",
  "result",
] as const;

export function buildMissingFieldQuestion(
  missing: string[],
  partial?: {
    eventDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    category?: string | null;
    topicCountForCategory?: number;
    totalTopicCount?: number;
    /** มีชื่อ/รายละเอียดแล้ว — ถามวันเวลาแบบเลขารับทราบ ไม่ใช่คำถามเดียวโดด ๆ */
    hasDraftSubstance?: boolean;
  },
) {
  if (!missing.length) return null;

  const needStart = missing.includes("startAt");
  const needEnd = missing.includes("endAt");
  if (needStart || needEnd) {
    const hasDate = Boolean(partial?.eventDate);
    const hasStart = Boolean(partial?.startTime);
    const hasEnd = Boolean(partial?.endTime);
    const soft = Boolean(partial?.hasDraftSubstance);
    if (!hasDate && !(hasStart && hasEnd)) {
      return soft
        ? "ขอวันและช่วงเวลาที่ทำจริงอีกนิด เพื่อลงใน JA ได้ครบ (เช่น 15 มกราคม 2569 เวลา 08:30-16:30 น.) หรือพิมพ์ว่า “บันทึกตามนี้” / “ไม่ต้องระบุวันและช่วงเวลา” หากชิ้นงานนี้ระบุไม่ได้"
        : "กรุณาระบุวันที่และช่วงเวลาเริ่ม–สิ้นสุด (เช่น 8 สิงหาคม 2569 เวลา 08:30-16:30 น.) หรือพิมพ์ว่า “บันทึกตามนี้” หากต้องการบันทึกโดยไม่ระบุวันเวลา";
    }
    if (!hasDate) {
      return soft
        ? "ขอวันที่ของงานนี้อีกนิด (เช่น 15 มกราคม 2569 หรือพิมพ์ว่าวันนี้)"
        : "กรุณาระบุวันที่ของงานนี้ (เช่น 8 สิงหาคม 2569 หรือ พิมพ์ว่าวันนี้)";
    }
    if (!hasStart || !hasEnd) {
      return soft
        ? "ขอช่วงเวลาเริ่มต้นและสิ้นสุดอีกนิด (เช่น 08:30-16:30 น.)"
        : "กรุณาระบุช่วงเวลาเริ่มต้นและสิ้นสุด (เช่น 08:30-16:30 น.)";
    }
  }

  const ordered = fieldQuestionPriority.filter((field) => missing.includes(field));
  const focus = ordered[0] ?? missing[0];
  switch (focus) {
    case "location":
      return "กรุณาระบุสถานที่จัดกิจกรรม/ปฏิบัติงาน";
    case "relatedUnit":
      return "กรุณาระบุหน่วยงานหรือผู้รับบริการ";
    case "competency":
      return "กรุณาระบุความรู้ ทักษะ หรือสมรรถนะที่ได้รับจากกิจกรรมนี้";
    case "description":
      return "กรุณาเล่ารายละเอียดงานที่ทำเพิ่มเติม";
    case "result":
      return "กรุณาระบุผลลัพธ์ที่ได้จากการปฏิบัติงาน";
    case "category":
      return "งานนี้จัดอยู่ในหมวดใด: งานประจำ / งานที่ได้รับมอบหมาย / งานเชิงพัฒนา";
    case "torTopicId": {
      if ((partial?.totalTopicCount ?? 0) === 0) {
        return "ยังไม่มีหัวข้อ TOR ที่พร้อมใช้งาน กรุณาไปที่ตั้งค่า → TOR เพื่ออัปโหลดและวิเคราะห์เอกสารก่อน";
      }
      if (partial?.category && (partial.topicCountForCategory ?? 0) === 0) {
        return `หมวดที่เลือกยังไม่มีหัวข้อ TOR ในระบบ กรุณาเลือกหมวดอื่น หรือไปวิเคราะห์ TOR ใหม่ให้มีหัวข้อในหมวดนี้`;
      }
      return "กรุณาระบุชื่อหัวข้อ TOR ที่เกี่ยวข้องกับงานนี้ให้ชัดเจน";
    }
    case "totalHours":
      return "กรุณาระบุจำนวนชั่วโมงที่ใช้";
    case "workTitle":
      // ถ้ามีรายละเอียดแล้วไม่ควรถามชื่องาน — สร้างจากรายละเอียดแทนใน chat-service
      return "กรุณาระบุชื่องานสั้น ๆ หรือเล่ารายละเอียดงานอีกครั้ง";
    default:
      return `กรุณาให้ข้อมูลเพิ่ม: ${focus}`;
  }
}

/** สกัดร่าง JA แบบ heuristic เมื่อเกตเวย์ AI คืนคำตอบว่าง/ล้มเหลว */
export function buildHeuristicWorkExtraction(message: string) {
  const description = deriveDescription(message) ?? message.replace(/\s+/g, " ").trim().slice(0, 500);
  const workTitle = deriveWorkTitle(message, description) ?? "งานปฏิบัติการ";
  const category = inferCategoryFromWorkText(message);
  const workSubtype = inferSubtypeFromWorkText(message, category);
  const competency = deriveCompetency(message);
  const monthHint = extractThaiMonthYearHint(message);
  const missingFields = ["startAt", "endAt", "totalHours"];
  if (!category) missingFields.unshift("category");
  if (!competency && workSubtype === "C_3_1") missingFields.push("competency");

  const periodNote = monthHint ? ` (ช่วงที่กล่าวถึง: ${monthHint})` : "";
  const userFacingReply = [
    `รับทราบแล้ว ดึงข้อมูลเบื้องต้นจากข้อความของคุณ:`,
    `• ชื่องาน: ${workTitle}`,
    category ? `• หมวด: ${categoryLabel[category]}` : null,
    workSubtype ? `• ประเภทย่อย: ${workSubtypeLabel[workSubtype]}` : null,
    `• รายละเอียด: ${description.slice(0, 220)}`,
    monthHint ? `• ช่วงที่กล่าวถึง: ${monthHint} (ยังต้องระบุวันและเวลาที่ทำจริงสำหรับ JA)` : null,
    "",
    `ขอวันและช่วงเวลาที่ทำจริงอีกนิด เพื่อลงใน JA ได้ครบ (เช่น 15 มกราคม 2569 เวลา 08:30-16:30 น.)${periodNote}`,
    `หากชิ้นงานนี้ระบุวันเวลาไม่ได้ พิมพ์ว่า “ไม่ต้องระบุวันและช่วงเวลา” ได้เลย`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    workTitle,
    category,
    workSubtype,
    torTopicId: null,
    description,
    relatedUnit: null,
    location: null,
    eventDate: null,
    startTime: null,
    endTime: null,
    startAt: null,
    endAt: null,
    totalHours: null,
    result: description,
    competency,
    missingFields,
    confidence: 0.35,
    nextQuestion: "ขอวันและช่วงเวลาที่ทำจริงอีกนิด (เช่น 15 มกราคม 2569 เวลา 08:30-16:30 น.) หรือพิมพ์ว่า “ไม่ต้องระบุวันและช่วงเวลา”",
    userFacingReply,
  };
}
