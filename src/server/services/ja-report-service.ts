import "server-only";

import { ApiError } from "@/lib/http/api-error";
import { prisma } from "@/lib/prisma";

export const categoryLabel = {
  ROUTINE: "งานประจำ",
  ASSIGNED: "งานที่ได้รับมอบหมาย",
  DEVELOPMENT: "งานเชิงพัฒนา",
} as const;

export const sectionTitleFallback = {
  ROUTINE: "1. งานประจำ",
  ASSIGNED: "2. งานที่ได้รับมอบหมาย",
  DEVELOPMENT: "3. ภาระงานเชิงพัฒนา",
} as const;

const competencyPrefix = "ความรู้/ทักษะ/สมรรถนะที่ได้รับ:";

export function extractCompetency(result: string) {
  const index = result.indexOf(competencyPrefix);
  if (index < 0) return null;
  return result.slice(index + competencyPrefix.length).trim() || null;
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "ไม่ระบุ";
  return value.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  });
}

export type JaReportEntry = {
  id: string;
  runningNumber: string;
  workTitle: string;
  description: string;
  location: string | null;
  relatedUnit: string | null;
  competency: string | null;
  startAt: Date | null;
  endAt: Date | null;
  startAtLabel: string;
  endAtLabel: string;
  totalHours: string;
  /** ชั่วโมงจริงของรายการ JA (ใช้แสดงในคอลัมน์ชม. ฝั่ง JA) */
  hoursPerWeek: string;
};

export type JaReportTopicRow = {
  id: string;
  category: keyof typeof categoryLabel;
  kind: "SECTION" | "TOPIC" | "SUBITEM";
  sectionLabel: string | null;
  code: string | null;
  title: string;
  description: string | null;
  hoursPerWeek: string | null;
  sortOrder: number;
  parentId: string | null;
  matchable: boolean;
  children: JaReportTopicRow[];
  jas: JaReportEntry[];
};

export type JaReportDocument = {
  id: string;
  fileName: string;
  year: number;
  status: string;
  user: {
    title: string | null;
    firstName: string;
    lastName: string;
    employeeId: string;
    position: string | null;
    unitName: string;
  };
  sections: Array<{
    key: string;
    category: keyof typeof categoryLabel;
    label: string;
    title: string;
    hoursPerWeek: string | null;
    topics: JaReportTopicRow[];
  }>;
  orphanJas: JaReportEntry[];
};

function personName(user: JaReportDocument["user"]) {
  return [user.title, user.firstName, user.lastName].filter(Boolean).join("");
}

export function reportPersonName(doc: JaReportDocument) {
  return personName(doc.user);
}

function toJaEntry(row: {
  id: string;
  runningNumber: string;
  workTitle: string;
  description: string;
  location: string | null;
  relatedUnit: string | null;
  result: string;
  startAt: Date | null;
  endAt: Date | null;
  totalHours: { toString(): string } | null;
}): JaReportEntry {
  return {
    id: row.id,
    runningNumber: row.runningNumber,
    workTitle: row.workTitle,
    description: row.description,
    location: row.location,
    relatedUnit: row.relatedUnit,
    competency: extractCompetency(row.result),
    startAt: row.startAt,
    endAt: row.endAt,
    startAtLabel: formatDateTime(row.startAt),
    endAtLabel: formatDateTime(row.endAt),
    totalHours: row.totalHours?.toString() ?? "ไม่ระบุ",
    hoursPerWeek: formatJaHours(row.totalHours),
  };
}

export function formatJaHours(totalHours: { toString(): string } | null | undefined) {
  if (!totalHours) return "0";
  const value = Number(totalHours.toString());
  return Number.isFinite(value) ? String(value) : "0";
}

export function sumTopicJaHours(jas: Array<{ totalHours: string; hoursPerWeek?: string }>) {
  let sum = 0;
  let counted = false;
  for (const ja of jas) {
    const fromHours = ja.hoursPerWeek !== undefined ? Number(ja.hoursPerWeek) : NaN;
    const fromTotal = Number(ja.totalHours);
    const value = Number.isFinite(fromHours) ? fromHours : fromTotal;
    if (!Number.isFinite(value)) continue;
    sum += value;
    counted = true;
  }
  return counted ? String(sum) : "0";
}

function formatTorCell(topic: JaReportTopicRow) {
  const lines = [
    topic.code ? `${topic.code} ${topic.title}` : topic.title,
  ];
  if (topic.description) lines.push(topic.description);
  for (const child of topic.children) {
    lines.push(child.code ? `${child.code} ${child.title}` : child.title);
    if (child.description) lines.push(child.description);
  }
  return lines.join("\n");
}

export function formatJaCell(ja: JaReportEntry) {
  const lines = [
    `ชื่องาน: ${ja.workTitle}`,
    `รายละเอียด: ${ja.description}`,
  ];
  if (ja.location) lines.push(`สถานที่: ${ja.location}`);
  if (ja.relatedUnit) lines.push(`หน่วยงาน: ${ja.relatedUnit}`);
  if (ja.competency) lines.push(`ความรู้/ทักษะ/สมรรถนะ: ${ja.competency}`);
  lines.push(`เริ่ม: ${ja.startAtLabel}`);
  lines.push(`สิ้นสุด: ${ja.endAtLabel}`);
  lines.push(`ชั่วโมง: ${ja.totalHours}`);
  return lines.join("\n");
}

export function formatTorBlock(topic: JaReportTopicRow) {
  return formatTorCell(topic);
}

/** โหลด TOR ทั้งฉบับ + JA ที่ยืนยันแล้วสำหรับฟอร์มรายงาน */
export async function loadJaReportDocument(
  userId: string,
  torDocumentId: string,
): Promise<JaReportDocument> {
  const document = await prisma.torDocument.findFirst({
    where: { id: torDocumentId, userId },
    include: {
      user: { include: { unit: true } },
      topics: { orderBy: [{ sortOrder: "asc" }, { title: "asc" }] },
    },
  });
  if (!document) throw new ApiError(404, "TOR_NOT_FOUND", "ไม่พบเอกสาร TOR");
  const torDoc = document;
  const topics = torDoc.topics;
  const topicIds = new Set(topics.map((topic) => topic.id));

  // รวม JA ของเอกสารนี้ + ของ TOR ปีเดียวกัน (กรณีอัปโหลดใหม่แล้วเอกสารเก่ายังถูก archive)
  const jaRecords = await prisma.jaRecord.findMany({
    where: {
      userId,
      status: { in: ["CONFIRMED", "SUBMITTED"] },
      OR: [
        { torDocumentId: torDoc.id },
        { torDocument: { userId, year: torDoc.year } },
        { torTopicId: { in: [...topicIds] } },
      ],
    },
    orderBy: [{ startAt: "asc" }, { createdAt: "asc" }],
  });

  const foreignTopicIds = [
    ...new Set(
      jaRecords
        .map((ja) => ja.torTopicId)
        .filter((id): id is string => typeof id === "string" && !topicIds.has(id)),
    ),
  ];
  const oldTopics = foreignTopicIds.length
    ? await prisma.torTopic.findMany({
        where: { id: { in: foreignTopicIds } },
        select: { id: true, title: true, category: true, code: true },
      })
    : [];
  const oldTopicById = new Map(oldTopics.map((topic) => [topic.id, topic]));

  const jaByTopic = new Map<string, JaReportEntry[]>();
  const orphanJas: JaReportEntry[] = [];
  const seenJa = new Set<string>();
  for (const ja of jaRecords) {
    if (seenJa.has(ja.id)) continue;
    seenJa.add(ja.id);
    const entry = toJaEntry(ja);
    if (ja.torTopicId && topicIds.has(ja.torTopicId)) {
      const list = jaByTopic.get(ja.torTopicId) ?? [];
      list.push(entry);
      jaByTopic.set(ja.torTopicId, list);
      continue;
    }
    // พยายามจับคู่หัวข้อใหม่ด้วยชื่อเดิมถ้า topic id เปลี่ยนหลังวิเคราะห์ TOR ใหม่
    const oldTopic = ja.torTopicId ? oldTopicById.get(ja.torTopicId) : undefined;
    if (oldTopic) {
      const rematch = topics.find(
        (topic) =>
          topic.kind === "TOPIC"
          && topic.matchable
          && topic.category === oldTopic.category
          && (
            (oldTopic.code && topic.code === oldTopic.code)
            || topic.title.trim().toLowerCase() === oldTopic.title.trim().toLowerCase()
          ),
      );
      if (rematch) {
        const list = jaByTopic.get(rematch.id) ?? [];
        list.push(entry);
        jaByTopic.set(rematch.id, list);
        continue;
      }
    }
    orphanJas.push(entry);
  }

  const byParent = new Map<string | null, typeof topics>();
  for (const topic of topics) {
    const key = topic.parentId;
    const list = byParent.get(key) ?? [];
    list.push(topic);
    byParent.set(key, list);
  }

  function buildRow(topic: (typeof topics)[number]): JaReportTopicRow {
    const children = (byParent.get(topic.id) ?? []).map(buildRow);
    return {
      id: topic.id,
      category: topic.category,
      kind: topic.kind,
      sectionLabel: topic.sectionLabel,
      code: topic.code,
      title: topic.title,
      description: topic.description,
      hoursPerWeek: topic.hoursPerWeek?.toString() ?? null,
      sortOrder: topic.sortOrder,
      parentId: topic.parentId,
      matchable: topic.matchable,
      children: children.filter((child) => child.kind === "SUBITEM"),
      jas: jaByTopic.get(topic.id) ?? [],
    };
  }

  const roots = byParent.get(null) ?? [];
  const sections: JaReportDocument["sections"] = [];

  const sectionNodes = roots.filter((row) => row.kind === "SECTION");
  if (sectionNodes.length) {
    for (const section of sectionNodes) {
      const sectionTopics = (byParent.get(section.id) ?? [])
        .filter((row) => row.kind === "TOPIC" || row.matchable)
        .map(buildRow);
      sections.push({
        key: section.id,
        category: section.category,
        label: section.sectionLabel || sectionTitleFallback[section.category],
        title: section.title,
        hoursPerWeek: section.hoursPerWeek?.toString() ?? null,
        topics: sectionTopics,
      });
    }
  } else {
    for (const category of Object.keys(categoryLabel) as Array<keyof typeof categoryLabel>) {
      const sectionTopics = roots
        .filter((row) => row.category === category && (row.kind === "TOPIC" || row.matchable))
        .map(buildRow);
      if (!sectionTopics.length) continue;
      sections.push({
        key: category,
        category,
        label: sectionTitleFallback[category],
        title: categoryLabel[category],
        hoursPerWeek: null,
        topics: sectionTopics,
      });
    }
  }

  const placed = new Set(sections.flatMap((section) => section.topics.map((topic) => topic.id)));
  for (const topic of topics) {
    if (topic.kind !== "TOPIC" && !topic.matchable) continue;
    if (placed.has(topic.id)) continue;
    const row = buildRow(topic);
    let section = sections.find((item) => item.category === topic.category);
    if (!section) {
      section = {
        key: topic.category,
        category: topic.category,
        label: sectionTitleFallback[topic.category],
        title: categoryLabel[topic.category],
        hoursPerWeek: null,
        topics: [],
      };
      sections.push(section);
    }
    section.topics.push(row);
  }

  return {
    id: torDoc.id,
    fileName: torDoc.fileName,
    year: torDoc.year,
    status: torDoc.status,
    user: {
      title: torDoc.user.title,
      firstName: torDoc.user.firstName,
      lastName: torDoc.user.lastName,
      employeeId: torDoc.user.employeeId,
      position: torDoc.user.position,
      unitName: torDoc.user.unit.name,
    },
    sections,
    orphanJas,
  };
}

export async function listJaReportDocuments(userId: string) {
  const docs = await prisma.torDocument.findMany({
    where: {
      userId,
      status: { in: ["ACTIVE", "REVIEW_REQUIRED"] },
    },
    orderBy: [{ year: "desc" }, { version: "desc" }],
    select: {
      id: true,
      fileName: true,
      year: true,
      status: true,
      version: true,
      _count: {
        select: {
          topics: true,
        },
      },
    },
  });

  const years = [...new Set(docs.map((doc) => doc.year))];
  const yearJaRows = years.length
    ? await prisma.jaRecord.findMany({
        where: {
          userId,
          status: { in: ["CONFIRMED", "SUBMITTED"] },
          torDocument: { userId, year: { in: years } },
        },
        select: { id: true, torDocument: { select: { year: true } } },
      })
    : [];
  const jaCountByYear = new Map<number, number>();
  for (const row of yearJaRows) {
    const year = row.torDocument?.year;
    if (year == null) continue;
    jaCountByYear.set(year, (jaCountByYear.get(year) ?? 0) + 1);
  }

  return docs.map((doc) => ({
    ...doc,
    _count: {
      topics: doc._count.topics,
      jaRecords: jaCountByYear.get(doc.year) ?? 0,
    },
  }));
}
