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

function formatDateTime(value: Date) {
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
  startAt: Date;
  endAt: Date;
  startAtLabel: string;
  endAtLabel: string;
  totalHours: string;
  /** ตามเงื่อนไขผลิตภัณฑ์: ฝั่ง JA ในฟอร์มเป็น 0 เสมอ */
  hoursPerWeek: "0";
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
  startAt: Date;
  endAt: Date;
  totalHours: { toString(): string };
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
    totalHours: row.totalHours.toString(),
    hoursPerWeek: "0",
  };
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
      jaRecords: {
        where: { userId, status: "CONFIRMED" },
        orderBy: { startAt: "asc" },
      },
    },
  });
  if (!document) throw new ApiError(404, "TOR_NOT_FOUND", "ไม่พบเอกสาร TOR");
  const torDoc = document;
  const topics = torDoc.topics;

  const jaByTopic = new Map<string, JaReportEntry[]>();
  const orphanJas: JaReportEntry[] = [];
  for (const ja of torDoc.jaRecords) {
    const entry = toJaEntry(ja);
    if (!ja.torTopicId) {
      orphanJas.push(entry);
      continue;
    }
    const list = jaByTopic.get(ja.torTopicId) ?? [];
    list.push(entry);
    jaByTopic.set(ja.torTopicId, list);
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
          jaRecords: { where: { status: "CONFIRMED" } },
        },
      },
    },
  });
  return docs;
}
