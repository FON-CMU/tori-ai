import { z } from "zod";

import type { WorkSubtype } from "@/lib/ai/work-system-prompt";
import { categorySchema } from "./ai";

export const workInputSchema = z
  .object({
    workTitle: z.string().trim().min(1),
    category: categorySchema,
    torTopicId: z.uuid(),
    description: z.string().trim().min(1),
    relatedUnit: z.string().trim().optional(),
    location: z.string().trim().optional(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    totalHours: z.coerce.number().nonnegative(),
    result: z.string().trim().min(1),
  })
  .superRefine((value, context) => {
    if (value.endAt < value.startAt) {
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
) {
  return requiredFieldsForSubtype(subtype).filter((field) => isBlank(draft[field]));
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
  if (/อบรม|สัมมนา|ประชุม|ศึกษาดูงาน|workshop|training|พัฒนาตนเอง|เชิงพัฒนา/i.test(text)) {
    return "DEVELOPMENT" as const;
  }
  if (/กรรมการ|คณะกรรมการ|กิจกรรม|บริการวิชาการ|มอบหมาย/i.test(text)) {
    return "ASSIGNED" as const;
  }
  if (/งานประจำ|ประจำวัน|หน้าที่หลัก/i.test(text)) {
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
    if (/ปรับปรุงกระบวนการ|พัฒนากระบวนการ|workflow/i.test(text)) return "C_3_2";
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

  const short = source.split(/(?:ตั้งแต่|เวลา|ที่|เนื้อหา|เพื่อ)/)[0]?.trim();
  if (short && short.length >= 6) return short.slice(0, 80);
  return source.slice(0, 80);
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
  },
) {
  if (!missing.length) return null;

  const needStart = missing.includes("startAt");
  const needEnd = missing.includes("endAt");
  if (needStart || needEnd) {
    const hasDate = Boolean(partial?.eventDate);
    const hasStart = Boolean(partial?.startTime);
    const hasEnd = Boolean(partial?.endTime);
    if (!hasDate && !(hasStart && hasEnd)) {
      return "กรุณาระบุวันที่และช่วงเวลาเริ่ม–สิ้นสุด (เช่น 8 สิงหาคม 2569 เวลา 08:30-16:30 น.)";
    }
    if (!hasDate) {
      return "กรุณาระบุวันที่ของงานนี้ (เช่น 8 สิงหาคม 2569 หรือ พิมพ์ว่าวันนี้)";
    }
    if (!hasStart || !hasEnd) {
      return "กรุณาระบุช่วงเวลาเริ่มต้นและสิ้นสุด (เช่น 08:30-16:30 น.)";
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
