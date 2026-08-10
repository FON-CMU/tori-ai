import "server-only";

import { Prisma } from "@/generated/prisma/client";

import { workSubtypeLabel, type WorkSubtype } from "@/lib/ai/work-system-prompt";
import {
  bangkokDateISO,
  bangkokDateThaiLabel,
  calculateHours,
  composeBangkokDateTime,
  normalizeTimeHm,
  parseThaiDateToISO,
  parseTimeRange,
  splitBangkokDateTime,
} from "@/lib/date";
import { ApiError } from "@/lib/http/api-error";
import { extractWork } from "@/lib/openai/client";
import { prisma } from "@/lib/prisma";
import { normalizeWorkExtraction, workSubtypeSchema } from "@/lib/validation/ai";
import {
  buildDraftProgressAck,
  buildHeuristicWorkExtraction,
  buildMissingFieldQuestion,
  composeCollectingReply,
  deriveCompetency,
  deriveDescription,
  deriveWorkTitle,
  findMissingFields,
  inferCategoryFromWorkText,
  inferSubtypeFromWorkText,
  isCancelDuplicateIntent,
  isCategoryChangeIntent,
  isSaveAsIsIntent,
  isSaveDuplicateIntent,
  isSkipScheduleIntent,
  isTopicChangeIntent,
  onlyScheduleFieldsMissing,
  parseCategoryAnswer,
  parseTorYearFromMessage,
  parseTopicChoiceIndex,
  selectTopicCandidates,
} from "@/lib/validation/work";
import { resolveOpenAiSettings } from "@/server/services/ai-settings-service";
import { tryHandleChatCommand } from "@/server/services/chat-command-service";
import { confirmJa } from "@/server/services/ja-service";

const categoryLabel = {
  ROUTINE: "งานประจำ",
  ASSIGNED: "งานที่ได้รับมอบหมาย",
  DEVELOPMENT: "งานเชิงพัฒนา",
} as const;

type PendingTopicOption = {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
};

type DraftMeta = {
  workSubtype: WorkSubtype | null;
  competency: string | null;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  scheduleSkipped: boolean;
  torYear: number | null;
  pendingTopicOptions: PendingTopicOption[];
  allowDuplicateSave: boolean;
};

function readDraftMeta(value: Prisma.JsonValue | null | undefined): DraftMeta {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      workSubtype: null,
      competency: null,
      eventDate: null,
      startTime: null,
      endTime: null,
      scheduleSkipped: false,
      torYear: null,
      pendingTopicOptions: [],
      allowDuplicateSave: false,
    };
  }
  const record = value as Record<string, unknown>;
  const subtypeParse = workSubtypeSchema.safeParse(record.workSubtype);
  const asText = (key: string) =>
    typeof record[key] === "string" && record[key].trim() ? (record[key] as string).trim() : null;
  const torYear =
    typeof record.torYear === "number" && Number.isInteger(record.torYear)
      ? record.torYear
      : typeof record.torYear === "string" && /^\d{4}$/.test(record.torYear)
        ? Number(record.torYear)
        : null;
  const pendingTopicOptions = Array.isArray(record.pendingTopicOptions)
    ? record.pendingTopicOptions.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const row = item as Record<string, unknown>;
        if (typeof row.id !== "string" || typeof row.title !== "string") return [];
        const category = typeof row.category === "string" ? row.category : "";
        return [{
          id: row.id,
          title: row.title,
          category,
          categoryLabel:
            typeof row.categoryLabel === "string"
              ? row.categoryLabel
              : categoryLabel[category as keyof typeof categoryLabel] ?? category,
        }];
      })
    : [];
  return {
    workSubtype: subtypeParse.success ? subtypeParse.data : null,
    competency: asText("competency"),
    eventDate: asText("eventDate"),
    startTime: normalizeTimeHm(asText("startTime")),
    endTime: normalizeTimeHm(asText("endTime")),
    scheduleSkipped: record.scheduleSkipped === true,
    torYear,
    pendingTopicOptions,
    allowDuplicateSave: record.allowDuplicateSave === true,
  };
}

function firstNonNull(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeEventDate(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return parseThaiDateToISO(trimmed);
  const year = Number(match[1]);
  if (year >= 2400) {
    return `${year - 543}-${match[2]}-${match[3]}`;
  }
  return trimmed;
}

function mergeScheduleMeta(
  existing: DraftMeta,
  extraction: {
    eventDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    startAt?: string | null;
    endAt?: string | null;
  },
  userMessage: string,
) {
  let eventDate = firstNonNull(extraction.eventDate, existing.eventDate);
  let startTime = normalizeTimeHm(firstNonNull(extraction.startTime, existing.startTime));
  let endTime = normalizeTimeHm(firstNonNull(extraction.endTime, existing.endTime));

  if (extraction.startAt) {
    const parts = splitBangkokDateTime(new Date(extraction.startAt));
    eventDate = eventDate ?? parts.eventDate;
    startTime = startTime ?? parts.timeHm;
  }
  if (extraction.endAt) {
    const parts = splitBangkokDateTime(new Date(extraction.endAt));
    eventDate = eventDate ?? parts.eventDate;
    endTime = endTime ?? parts.timeHm;
  }

  const parsedDate = parseThaiDateToISO(userMessage);
  if (parsedDate) eventDate = parsedDate;

  const range = parseTimeRange(userMessage);
  if (range.startTime) startTime = range.startTime;
  if (range.endTime) endTime = range.endTime;

  return { eventDate, startTime, endTime };
}

function resolveSchedule(
  meta: Pick<DraftMeta, "eventDate" | "startTime" | "endTime">,
  startAt: Date | null,
  endAt: Date | null,
) {
  let nextStart = startAt;
  let nextEnd = endAt;

  if (meta.eventDate && meta.startTime) {
    nextStart = composeBangkokDateTime(meta.eventDate, meta.startTime) ?? nextStart;
  }
  if (meta.eventDate && meta.endTime) {
    nextEnd = composeBangkokDateTime(meta.eventDate, meta.endTime) ?? nextEnd;
  }

  if (nextStart && nextEnd && nextEnd < nextStart) {
    // overnight: keep as-is; hours calc may fail later
  }

  return { startAt: nextStart, endAt: nextEnd };
}

function isConfirmIntent(message: string) {
  const normalized = message.trim().toLowerCase().replace(/\s+/g, "");
  return (
    /^(ยืนยัน|ตกลง|บันทึก|ok|okay|confirm|yes|ใช่|บันทึกเลย|ยืนยันบันทึก|ยืนยันได้)[!。.]*$/.test(normalized)
    || normalized.includes("ยืนยันบันทึก")
    || normalized === "ยืนยันครับ"
    || normalized === "ยืนยันค่ะ"
  );
}

function formatThaiDateTime(value: Date | null, scheduleSkipped = false) {
  if (scheduleSkipped && !value) return "ไม่ระบุ";
  if (!value) return "-";
  return value.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function draftSnapshot(
  draft: {
    workTitle: string | null;
    category: string | null;
    torTopicId: string | null;
    description: string | null;
    relatedUnit: string | null;
    location: string | null;
    startAt: Date | null;
    endAt: Date | null;
    totalHours: Prisma.Decimal | null;
    result: string | null;
    confirmedFieldsJson?: Prisma.JsonValue | null;
  },
  meta?: DraftMeta,
) {
  const resolved = meta ?? readDraftMeta(draft.confirmedFieldsJson);
  return {
    workTitle: draft.workTitle,
    category: draft.category,
    workSubtype: resolved.workSubtype,
    torTopicId: draft.torTopicId,
    description: draft.description,
    relatedUnit: draft.relatedUnit,
    location: draft.location,
    eventDate: resolved.eventDate,
    startTime: resolved.startTime,
    endTime: resolved.endTime,
    startAt: draft.startAt?.toISOString() ?? null,
    endAt: draft.endAt?.toISOString() ?? null,
    totalHours: draft.totalHours === null ? null : Number(draft.totalHours),
    result: draft.result,
    competency: resolved.competency,
  };
}

function draftFieldValues(
  draft: {
    workTitle: string | null;
    category: string | null;
    torTopicId: string | null;
    description: string | null;
    relatedUnit: string | null;
    location: string | null;
    startAt: Date | null;
    endAt: Date | null;
    totalHours: Prisma.Decimal | null;
    result: string | null;
  },
  meta: DraftMeta,
) {
  return {
    workTitle: draft.workTitle,
    category: draft.category,
    torTopicId: draft.torTopicId,
    description: draft.description,
    relatedUnit: draft.relatedUnit,
    location: draft.location,
    startAt: draft.startAt,
    endAt: draft.endAt,
    totalHours: draft.totalHours === null ? null : Number(draft.totalHours),
    result: draft.result,
    competency: meta.competency,
  };
}

function buildReviewMessage(input: {
  workTitle: string | null;
  category: string | null;
  workSubtype?: WorkSubtype | null;
  topicTitle?: string | null;
  description: string | null;
  location: string | null;
  relatedUnit: string | null;
  competency?: string | null;
  startAt: Date | null;
  endAt: Date | null;
  totalHours: number | null;
  result: string | null;
  scheduleSkipped?: boolean;
}) {
  const isC31 = input.workSubtype === "C_3_1";
  const skipped = Boolean(input.scheduleSkipped);
  const lines = [
    "สรุปร่างผลการปฏิบัติงานจริง (JA) ให้ตรวจสอบก่อนยืนยัน:",
    `• ชื่องาน: ${input.workTitle ?? "-"}`,
    `• หมวด: ${input.category ? categoryLabel[input.category as keyof typeof categoryLabel] : "-"}`,
    `• ประเภทย่อย: ${input.workSubtype ? workSubtypeLabel[input.workSubtype] : "-"}`,
    `• หัวข้อ TOR: ${input.topicTitle ?? "-"}`,
    `• รายละเอียด: ${input.description ?? "-"}`,
    `• สถานที่: ${input.location ?? "-"}`,
  ];
  if (input.relatedUnit) {
    lines.push(`• หน่วยงานที่เกี่ยวข้อง: ${input.relatedUnit}`);
  }
  if (isC31 || input.competency) {
    lines.push(`• ความรู้/ทักษะ/สมรรถนะ: ${input.competency ?? "-"}`);
  }
  lines.push(
    `• เริ่ม: ${formatThaiDateTime(input.startAt, skipped)}`,
    `• สิ้นสุด: ${formatThaiDateTime(input.endAt, skipped)}`,
    `• ชั่วโมง: ${skipped && input.totalHours === null ? "ไม่ระบุ" : (input.totalHours ?? "-")}`,
  );
  if (!isC31) {
    lines.push(`• ผลลัพธ์: ${input.result ?? "-"}`);
  }
  if (skipped) {
    lines.push("• หมายเหตุ: บันทึกโดยไม่ระบุวันและช่วงเวลา ตามที่ผู้ใช้ยืนยัน");
  }
  lines.push(
    "",
    "หากถูกต้อง ให้กดปุ่ม “ยืนยันบันทึก JA” ด้านล่าง หรือพิมพ์ “ยืนยัน”",
    "รายการนี้จะไปอยู่ในช่องผลการปฏิบัติงานจริงของรายงานทั้งฉบับ",
  );
  return lines.join("\n");
}

async function listActiveTorYears(userId: string) {
  const rows = await prisma.torDocument.groupBy({
    by: ["year"],
    where: {
      userId,
      status: "ACTIVE",
      topics: { some: { status: "CONFIRMED", matchable: true, kind: "TOPIC" } },
    },
    orderBy: { year: "desc" },
  });
  return rows.map((row) => row.year);
}

export async function getActiveTorYears(userId: string) {
  return listActiveTorYears(userId);
}

export async function setChatTorYear(userId: string, conversationId: string | null, year: number) {
  const resolved = await resolveTorYear(userId, year);
  if (!resolved.year || !resolved.years.includes(year)) {
    throw new ApiError(400, "INVALID_TOR_YEAR", "ไม่พบ TOR ปีที่เลือก หรือยังไม่ได้วิเคราะห์หัวข้อ");
  }

  let id = conversationId;
  if (id) {
    const existing = await prisma.conversation.findFirst({
      where: { id, userId, status: { not: "ARCHIVED" } },
    });
    if (!existing) throw new ApiError(404, "CONVERSATION_NOT_FOUND", "ไม่พบการสนทนา");
  } else {
    const created = await prisma.conversation.create({
      data: {
        userId,
        title: `TOR พ.ศ. ${year}`,
        status: "ACTIVE",
        workDraft: {
          create: {
            userId,
            status: "COLLECTING",
            confirmedFieldsJson: { torYear: year },
          },
        },
      },
    });
    id = created.id;
  }

  const draft = await prisma.workDraft.upsert({
    where: { conversationId: id },
    update: {},
    create: {
      conversationId: id,
      userId,
      status: "COLLECTING",
      confirmedFieldsJson: { torYear: year },
    },
  });
  const meta = readDraftMeta(draft.confirmedFieldsJson);
  await prisma.workDraft.update({
    where: { id: draft.id },
    data: {
      torTopicId: null,
      confirmedFieldsJson: {
        ...meta,
        torYear: year,
        pendingTopicOptions: [],
        allowDuplicateSave: false,
      },
    },
  });
  await prisma.message.create({
    data: {
      conversationId: id,
      role: "ASSISTANT",
      content: `ใช้ TOR ปี พ.ศ. ${year} สำหรับการบันทึก JA ในแชทนี้แล้ว`,
    },
  });
  await prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
  const topics = await loadActiveTopics(userId, year);
  return {
    ...(await getConversation(userId, id)),
    torYears: resolved.years,
    topics: topics.map((topic) => ({
      id: topic.id,
      category: topic.category,
      categoryLabel: categoryLabel[topic.category],
      title: topic.title,
      year: topic.torDocument.year,
    })),
  };
}

async function resolveTorYear(userId: string, preferred: number | null | undefined) {
  const years = await listActiveTorYears(userId);
  if (!years.length) return { year: null as number | null, years };
  if (preferred && years.includes(preferred)) return { year: preferred, years };
  return { year: years[0] ?? null, years };
}

async function loadActiveTopics(userId: string, year?: number | null) {
  return prisma.torTopic.findMany({
    where: {
      userId,
      status: "CONFIRMED",
      matchable: true,
      kind: "TOPIC",
      torDocument: {
        status: "ACTIVE",
        ...(year ? { year } : {}),
      },
    },
    orderBy: [{ sortOrder: "asc" }, { category: "asc" }, { title: "asc" }],
    select: {
      id: true,
      category: true,
      title: true,
      description: true,
      code: true,
      sectionLabel: true,
      hoursPerWeek: true,
      torDocument: { select: { id: true, year: true, fileName: true } },
    },
  });
}

function applyTopicSelection(
  topics: Awaited<ReturnType<typeof loadActiveTopics>>,
  category: string | null,
  workTitle: string | null,
  description: string | null,
  currentTopicId: string | null,
) {
  const inCategory = category
    ? topics.filter((topic) => topic.category === category)
    : topics;
  const pool = inCategory.length ? inCategory : topics;
  if (!pool.length) {
    return { torTopicId: null as string | null, pendingTopicOptions: [] as PendingTopicOption[] };
  }
  if (currentTopicId && pool.some((topic) => topic.id === currentTopicId)) {
    return { torTopicId: currentTopicId, pendingTopicOptions: [] as PendingTopicOption[] };
  }
  const candidates = selectTopicCandidates(pool, workTitle, description);
  if (candidates.length <= 1) {
    return {
      torTopicId: candidates[0]?.id ?? pool[0]?.id ?? null,
      pendingTopicOptions: [] as PendingTopicOption[],
    };
  }
  return {
    torTopicId: null as string | null,
    pendingTopicOptions: candidates.map((topic) => ({
      id: topic.id,
      title: topic.title,
      category: topic.category,
      categoryLabel: categoryLabel[topic.category],
    })),
  };
}

function serializeDraft(draft: {
  id: string;
  status: string;
  workTitle: string | null;
  category: string | null;
  torTopicId: string | null;
  description: string | null;
  relatedUnit: string | null;
  location: string | null;
  startAt: Date | null;
  endAt: Date | null;
  totalHours: Prisma.Decimal | null;
  result: string | null;
  missingFieldsJson: Prisma.JsonValue;
  confirmedFieldsJson: Prisma.JsonValue;
  aiConfidence: number | null;
  torTopic?: { title: string; category: string } | null;
}) {
  const missing = Array.isArray(draft.missingFieldsJson)
    ? draft.missingFieldsJson.filter((item): item is string => typeof item === "string")
    : [];
  const meta = readDraftMeta(draft.confirmedFieldsJson);
  return {
    id: draft.id,
    status: draft.status,
    workTitle: draft.workTitle,
    category: draft.category,
    categoryLabel: draft.category ? categoryLabel[draft.category as keyof typeof categoryLabel] : null,
    workSubtype: meta.workSubtype,
    workSubtypeLabel: meta.workSubtype ? workSubtypeLabel[meta.workSubtype] : null,
    torTopicId: draft.torTopicId,
    topicTitle: draft.torTopic?.title ?? null,
    description: draft.description,
    relatedUnit: draft.relatedUnit,
    location: draft.location,
    competency: meta.competency,
    startAt: draft.startAt?.toISOString() ?? null,
    endAt: draft.endAt?.toISOString() ?? null,
    startAtLabel: formatThaiDateTime(draft.startAt, meta.scheduleSkipped),
    endAtLabel: formatThaiDateTime(draft.endAt, meta.scheduleSkipped),
    totalHours: draft.totalHours === null ? null : Number(draft.totalHours),
    result: draft.result,
    missingFields: missing,
    aiConfidence: draft.aiConfidence,
    scheduleSkipped: meta.scheduleSkipped,
    torYear: meta.torYear,
    pendingTopicOptions: meta.pendingTopicOptions,
    allowDuplicateSave: meta.allowDuplicateSave,
    canSaveAsIs:
      draft.status !== "READY_FOR_REVIEW"
      && Boolean(draft.workTitle || draft.description)
      && onlyScheduleFieldsMissing(missing),
    readyToConfirm:
      draft.status === "READY_FOR_REVIEW"
      && missing.length === 0
      && meta.pendingTopicOptions.length === 0,
  };
}

export async function getConversation(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId, status: { not: "ARCHIVED" } },
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 200 },
      workDraft: { include: { torTopic: { select: { title: true, category: true } } } },
    },
  });
  if (!conversation) throw new ApiError(404, "CONVERSATION_NOT_FOUND", "ไม่พบการสนทนา");
  return {
    id: conversation.id,
    title: conversation.title,
    aiModel: conversation.aiModel,
    messages: conversation.messages.map((message) => {
      const meta =
        message.metadataJson && typeof message.metadataJson === "object" && !Array.isArray(message.metadataJson)
          ? (message.metadataJson as Record<string, unknown>)
          : {};
      const latencyMs = typeof meta.latencyMs === "number" && Number.isFinite(meta.latencyMs)
        ? Math.max(0, Math.round(meta.latencyMs))
        : null;
      return {
        id: message.id,
        role: message.role === "ASSISTANT" ? ("assistant" as const) : ("user" as const),
        content: message.content,
        latencyMs,
      };
    }),
    draft: conversation.workDraft ? serializeDraft(conversation.workDraft) : null,
  };
}

/** ลบแชท (archive) */
export async function deleteConversation(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId, status: { not: "ARCHIVED" } },
  });
  if (!conversation) throw new ApiError(404, "CONVERSATION_NOT_FOUND", "ไม่พบการสนทนา");
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { status: "ARCHIVED" },
  });
  return { id: conversation.id, status: "ARCHIVED" as const };
}

export async function sendChatMessage(
  userId: string,
  input: { conversationId?: string | null; message: string },
) {
  const content = input.message.trim();
  if (!content) throw new ApiError(400, "MESSAGE_REQUIRED", "กรุณาพิมพ์ข้อความ");

  const earlyCommand = await tryHandleChatCommand(userId, content, input.conversationId ?? null);

  // คำสั่งระบบทำงานได้แม้ยังไม่มี TOR
  if (earlyCommand) {
    let conversationId = input.conversationId ?? null;
    if (!conversationId && !earlyCommand.actions?.some((action) => action.type === "new_chat" || action.type === "delete_conversation")) {
      const created = await prisma.conversation.create({
        data: {
          userId,
          title: content.slice(0, 60),
          status: "ACTIVE",
          workDraft: { create: { userId, status: "COLLECTING" } },
        },
      });
      conversationId = created.id;
    }

    if (conversationId && earlyCommand.actions?.some((action) => action.type === "delete_conversation")) {
      await prisma.message.create({ data: { conversationId, role: "USER", content } });
      await prisma.message.create({
        data: { conversationId, role: "ASSISTANT", content: earlyCommand.reply },
      });
      await deleteConversation(userId, conversationId);
      return {
        id: conversationId,
        title: null,
        aiModel: null,
        messages: [
          { id: crypto.randomUUID(), role: "user" as const, content, latencyMs: null },
          { id: crypto.randomUUID(), role: "assistant" as const, content: earlyCommand.reply, latencyMs: null },
        ],
        draft: null,
        conversationDeleted: true,
        actions: earlyCommand.actions,
      };
    }

    if (earlyCommand.actions?.some((action) => action.type === "new_chat")) {
      return {
        id: conversationId ?? crypto.randomUUID(),
        title: null,
        aiModel: null,
        messages: [
          { id: crypto.randomUUID(), role: "user" as const, content, latencyMs: null },
          { id: crypto.randomUUID(), role: "assistant" as const, content: earlyCommand.reply, latencyMs: null },
        ],
        draft: null,
        actions: earlyCommand.actions,
      };
    }

    if (!conversationId) {
      const created = await prisma.conversation.create({
        data: {
          userId,
          title: content.slice(0, 60),
          status: "ACTIVE",
          workDraft: { create: { userId, status: "COLLECTING" } },
        },
      });
      conversationId = created.id;
    }

    await prisma.message.create({ data: { conversationId, role: "USER", content } });
    await prisma.message.create({
      data: { conversationId, role: "ASSISTANT", content: earlyCommand.reply },
    });
    await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    return {
      ...(await getConversation(userId, conversationId)),
      actions: earlyCommand.actions ?? [],
    };
  }

  const yearResolution = await resolveTorYear(userId, null);
  if (!yearResolution.years.length) {
    throw new ApiError(
      409,
      "TOR_REQUIRED",
      "ยังไม่มี TOR ที่พร้อมใช้งาน กรุณาอัปโหลด TOR ในหน้าตั้งค่าก่อน หรือพิมพ์ “ไปหน้า TOR” / “ช่วยเหลือ”",
    );
  }

  let selectedModel: string;
  try {
    const resolved = await resolveOpenAiSettings();
    selectedModel = resolved.model;
  } catch (reason) {
    throw new ApiError(
      400,
      "AI_NOT_CONFIGURED",
      reason instanceof Error ? reason.message : "ยังไม่ได้ตั้งค่า AI",
    );
  }

  let conversationId = input.conversationId ?? null;
  if (conversationId) {
    const existing = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, status: { not: "ARCHIVED" } },
    });
    if (!existing) throw new ApiError(404, "CONVERSATION_NOT_FOUND", "ไม่พบการสนทนา");
    if (existing.aiModel !== selectedModel) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { aiModel: selectedModel },
      });
    }
  } else {
    const created = await prisma.conversation.create({
      data: {
        userId,
        title: content.slice(0, 60),
        status: "ACTIVE",
        aiModel: selectedModel,
        workDraft: {
          create: {
            userId,
            status: "COLLECTING",
            confirmedFieldsJson: { torYear: yearResolution.year },
          },
        },
      },
    });
    conversationId = created.id;
  }

  const draft = await prisma.workDraft.upsert({
    where: { conversationId },
    update: {},
    create: {
      conversationId,
      userId,
      status: "COLLECTING",
      confirmedFieldsJson: { torYear: yearResolution.year },
    },
    include: { torTopic: { select: { title: true, category: true } } },
  });
  let existingMeta = readDraftMeta(draft.confirmedFieldsJson);
  const requestedYear = parseTorYearFromMessage(content);
  const resolvedYear = await resolveTorYear(userId, requestedYear ?? existingMeta.torYear ?? yearResolution.year);
  existingMeta = {
    ...existingMeta,
    torYear: resolvedYear.year,
    pendingTopicOptions: requestedYear && requestedYear !== existingMeta.torYear
      ? []
      : existingMeta.pendingTopicOptions,
  };
  const topics = await loadActiveTopics(userId, resolvedYear.year);
  if (!topics.length) {
    throw new ApiError(
      409,
      "TOR_REQUIRED",
      resolvedYear.year
        ? `ยังไม่มีหัวข้อ TOR ปี พ.ศ. ${resolvedYear.year} ที่พร้อมใช้งาน`
        : "ยังไม่มี TOR ที่พร้อมใช้งาน กรุณาอัปโหลด TOR ในหน้าตั้งค่าก่อน",
    );
  }

  // เลือกหัวข้อจากตัวเลือกที่ถามไว้
  if (existingMeta.pendingTopicOptions.length) {
    const choiceIndex = parseTopicChoiceIndex(content, existingMeta.pendingTopicOptions.length);
    const byTitle = existingMeta.pendingTopicOptions.find((option) =>
      content.includes(option.title.slice(0, Math.min(16, option.title.length))),
    );
    const chosen = choiceIndex !== null
      ? existingMeta.pendingTopicOptions[choiceIndex]
      : byTitle;
    if (chosen) {
      await prisma.message.create({ data: { conversationId, role: "USER", content } });
      const nextMeta: DraftMeta = {
        ...existingMeta,
        pendingTopicOptions: [],
        allowDuplicateSave: false,
      };
      const missing = findMissingFields(
        draftFieldValues({ ...draft, torTopicId: chosen.id, category: chosen.category as typeof draft.category }, nextMeta),
        nextMeta.workSubtype,
        { scheduleOptional: nextMeta.scheduleSkipped },
      );
      const ready = missing.length === 0;
      await prisma.workDraft.update({
        where: { id: draft.id },
        data: {
          torTopicId: chosen.id,
          category: chosen.category as "ROUTINE" | "ASSIGNED" | "DEVELOPMENT",
          status: ready ? "READY_FOR_REVIEW" : "COLLECTING",
          missingFieldsJson: missing,
          confirmedFieldsJson: nextMeta,
        },
      });
      await prisma.message.create({
        data: {
          conversationId,
          role: "ASSISTANT",
          content: ready
            ? buildReviewMessage({
                workTitle: draft.workTitle,
                category: chosen.category,
                workSubtype: nextMeta.workSubtype,
                topicTitle: chosen.title,
                description: draft.description,
                location: draft.location,
                relatedUnit: draft.relatedUnit,
                competency: nextMeta.competency,
                startAt: draft.startAt,
                endAt: draft.endAt,
                totalHours: draft.totalHours === null ? null : Number(draft.totalHours),
                result: draft.result,
                scheduleSkipped: nextMeta.scheduleSkipped,
              })
            : `รับทราบ ใช้หัวข้อ TOR “${chosen.title}” แล้ว\n\n${
                buildMissingFieldQuestion(missing, {
                  ...nextMeta,
                  category: chosen.category,
                  topicCountForCategory: topics.filter((topic) => topic.category === chosen.category).length,
                  totalTopicCount: topics.length,
                  hasDraftSubstance: true,
                }) ?? "กรุณาให้ข้อมูลที่ยังขาดต่อได้เลย"
              }`,
        },
      });
      await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      return {
        ...(await getConversation(userId, conversationId)),
        torYears: resolvedYear.years,
        topics: topics.map((topic) => ({
          id: topic.id,
          category: topic.category,
          categoryLabel: categoryLabel[topic.category],
          title: topic.title,
          year: topic.torDocument.year,
        })),
      };
    }
  }

  // บันทึกใหม่เมื่อพบรายการซ้ำ / ยกเลิก
  if (isSaveDuplicateIntent(content) && draft.status === "READY_FOR_REVIEW") {
    await prisma.message.create({ data: { conversationId, role: "USER", content } });
    await prisma.workDraft.update({
      where: { id: draft.id },
      data: { confirmedFieldsJson: { ...existingMeta, allowDuplicateSave: true } },
    });
    try {
      const confirmed = await confirmChatDraft(userId, conversationId, { allowDuplicate: true });
      return {
        ...confirmed.conversation,
        ja: confirmed.ja,
        torYears: resolvedYear.years,
        topics: topics.map((topic) => ({
          id: topic.id,
          category: topic.category,
          categoryLabel: categoryLabel[topic.category],
          title: topic.title,
          year: topic.torDocument.year,
        })),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw error;
    }
  }
  if (isCancelDuplicateIntent(content)) {
    await prisma.message.create({ data: { conversationId, role: "USER", content } });
    await prisma.message.create({
      data: {
        conversationId,
        role: "ASSISTANT",
        content: "ยกเลิกการบันทึกแล้ว ร่างเดิมยังอยู่ หากต้องการแก้รายละเอียด พิมพ์ต่อได้เลย",
      },
    });
    await prisma.workDraft.update({
      where: { id: draft.id },
      data: { confirmedFieldsJson: { ...existingMeta, allowDuplicateSave: false } },
    });
    return {
      ...(await getConversation(userId, conversationId)),
      torYears: resolvedYear.years,
    };
  }

  // เปลี่ยนปี TOR จากข้อความ
  if (requestedYear && resolvedYear.year === requestedYear) {
    const yearChanged = requestedYear !== readDraftMeta(draft.confirmedFieldsJson).torYear;
    if (yearChanged && /ปี|TOR|พ\.?\s*ศ/i.test(content) && content.length < 40) {
      await prisma.message.create({ data: { conversationId, role: "USER", content } });
      await prisma.workDraft.update({
        where: { id: draft.id },
        data: {
          torTopicId: null,
          confirmedFieldsJson: {
            ...existingMeta,
            torYear: requestedYear,
            pendingTopicOptions: [],
            workSubtype: existingMeta.workSubtype,
          },
        },
      });
      await prisma.message.create({
        data: {
          conversationId,
          role: "ASSISTANT",
          content: `เปลี่ยนไปใช้ TOR ปี พ.ศ. ${requestedYear} แล้ว มีหัวข้อ ${topics.length} รายการ พร้อมให้บันทึก JA ได้เลย`,
        },
      });
      await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      return {
        ...(await getConversation(userId, conversationId)),
        torYears: resolvedYear.years,
        topics: topics.map((topic) => ({
          id: topic.id,
          category: topic.category,
          categoryLabel: categoryLabel[topic.category],
          title: topic.title,
          year: topic.torDocument.year,
        })),
      };
    }
  }

  const draftMissing = findMissingFields(
    draftFieldValues(draft, existingMeta),
    existingMeta.workSubtype,
    { scheduleOptional: existingMeta.scheduleSkipped },
  );
  if (
    draft.status === "READY_FOR_REVIEW"
    && draftMissing.length === 0
    && existingMeta.pendingTopicOptions.length === 0
    && (isConfirmIntent(content) || isSaveAsIsIntent(content))
  ) {
    await prisma.message.create({ data: { conversationId, role: "USER", content } });
    try {
      const confirmed = await confirmChatDraft(userId, conversationId, {
        allowDuplicate: existingMeta.allowDuplicateSave,
      });
      return {
        ...confirmed.conversation,
        ja: confirmed.ja,
        torYears: resolvedYear.years,
        topics: topics.map((topic) => ({
          id: topic.id,
          category: topic.category,
          categoryLabel: categoryLabel[topic.category],
          title: topic.title,
          year: topic.torDocument.year,
        })),
      };
    } catch (error) {
      if (error instanceof ApiError && error.code === "DUPLICATE_JA") {
        await prisma.message.create({
          data: {
            conversationId,
            role: "ASSISTANT",
            content: `${error.message}\n\nพิมพ์ “บันทึกใหม่” เพื่อบันทึกเป็นรายการใหม่ (ไม่ทับของเดิม) หรือ “ยกเลิก”`,
          },
        });
        return {
          ...(await getConversation(userId, conversationId)),
          torYears: resolvedYear.years,
          duplicatePrompt: true,
        };
      }
      throw error;
    }
  }

  await prisma.message.create({
    data: { conversationId, role: "USER", content },
  });

  // คำสั่งเปลี่ยนหมวด / เปลี่ยนหัวข้อ — ทำในเครื่อง ไม่ให้ AI ทับด้วยชุดเดิม
  const answeredCategoryEarly = parseCategoryAnswer(content);
  const shortCategorySwitch =
    Boolean(answeredCategoryEarly)
    && Boolean(draft.category)
    && answeredCategoryEarly !== draft.category
    && content.replace(/\s+/g, " ").trim().length <= 40
    && !isConfirmIntent(content)
    && !isSaveAsIsIntent(content)
    && !isSkipScheduleIntent(content);
  if (isCategoryChangeIntent(content) || isTopicChangeIntent(content) || shortCategorySwitch) {
    const answeredCategory = answeredCategoryEarly;
    const wantsTopicPick = isTopicChangeIntent(content);
    const nextCategory = isCategoryChangeIntent(content) || shortCategorySwitch
      ? (answeredCategory ?? null)
      : draft.category;

    if ((isCategoryChangeIntent(content) || shortCategorySwitch) && !answeredCategory) {
      await prisma.message.create({
        data: {
          conversationId,
          role: "ASSISTANT",
          content: [
            "รับทราบว่าต้องการเปลี่ยนหมวด กรุณาระบุหมวดปลายทางให้ชัดเจน:",
            "1) งานประจำ",
            "2) งานที่ได้รับมอบหมาย",
            "3) งานเชิงพัฒนา",
            "",
            "ตัวอย่าง: “เปลี่ยนหมวดไปงานประจำ”",
          ].join("\n"),
        },
      });
      await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      return {
        ...(await getConversation(userId, conversationId)),
        torYears: resolvedYear.years,
      };
    }

    if (!draft.workTitle && !draft.description && !nextCategory) {
      await prisma.message.create({
        data: {
          conversationId,
          role: "ASSISTANT",
          content: "ยังไม่มีร่างงานในแชทนี้ — เล่างานก่อน แล้วค่อยสั่งเปลี่ยนหมวดหรือหัวข้อได้",
        },
      });
      return {
        ...(await getConversation(userId, conversationId)),
        torYears: resolvedYear.years,
      };
    }

    const nextMeta: DraftMeta = {
      ...existingMeta,
      torYear: existingMeta.torYear ?? resolvedYear.year,
      workSubtype: isCategoryChangeIntent(content) || shortCategorySwitch
        ? inferSubtypeFromWorkText(
            [draft.description, draft.workTitle, content].filter(Boolean).join(" "),
            nextCategory,
          )
        : existingMeta.workSubtype,
      pendingTopicOptions: [],
      allowDuplicateSave: false,
    };

    let nextTopicId: string | null = wantsTopicPick || isCategoryChangeIntent(content) || shortCategorySwitch
      ? null
      : draft.torTopicId;
    if (
      nextCategory
      && (
        wantsTopicPick
        || !nextTopicId
        || !topics.some((topic) => topic.id === nextTopicId && topic.category === nextCategory)
      )
    ) {
      const picked = applyTopicSelection(
        topics,
        nextCategory,
        draft.workTitle,
        draft.description,
        null,
      );
      nextTopicId = picked.torTopicId;
      nextMeta.pendingTopicOptions = picked.pendingTopicOptions;
    }

    const nextDraft = {
      workTitle: draft.workTitle,
      category: nextCategory,
      torTopicId: nextTopicId,
      description: draft.description,
      relatedUnit: draft.relatedUnit,
      location: draft.location,
      startAt: draft.startAt,
      endAt: draft.endAt,
      totalHours: draft.totalHours,
      result: draft.result ?? draft.description,
    };
    const missing = findMissingFields(
      {
        ...nextDraft,
        totalHours: nextDraft.totalHours === null ? null : Number(nextDraft.totalHours),
        competency: nextMeta.competency,
      },
      nextMeta.workSubtype,
      { scheduleOptional: nextMeta.scheduleSkipped },
    );
    const awaitingTopicChoice = nextMeta.pendingTopicOptions.length > 0;
    if (awaitingTopicChoice && !missing.includes("torTopicId")) missing.push("torTopicId");
    const ready = missing.length === 0 && !awaitingTopicChoice;

    await prisma.workDraft.update({
      where: { id: draft.id },
      data: {
        ...nextDraft,
        missingFieldsJson: missing,
        confirmedFieldsJson: nextMeta,
        status: ready ? "READY_FOR_REVIEW" : "COLLECTING",
      },
    });

    const topicTitle = nextTopicId
      ? topics.find((topic) => topic.id === nextTopicId)?.title ?? null
      : null;
    let reply: string;
    if (awaitingTopicChoice) {
      reply = [
        (isCategoryChangeIntent(content) || shortCategorySwitch) && nextCategory
          ? `เปลี่ยนหมวดเป็น${categoryLabel[nextCategory]} แล้ว พบหัวข้อ TOR ที่ใกล้เคียงหลายรายการในปี พ.ศ. ${nextMeta.torYear ?? "-"}:`
          : `เลือกหัวข้อ TOR ใหม่สำหรับร่างนี้ (ปี พ.ศ. ${nextMeta.torYear ?? "-"}):`,
        ...nextMeta.pendingTopicOptions.map(
          (option, index) => `${index + 1}) [${option.categoryLabel}] ${option.title}`,
        ),
        "",
        "พิมพ์หมายเลขหัวข้อที่ต้องการ (เช่น 1)",
      ].join("\n");
    } else if (ready) {
      reply = buildReviewMessage({
        workTitle: nextDraft.workTitle,
        category: nextDraft.category,
        workSubtype: nextMeta.workSubtype,
        topicTitle,
        description: nextDraft.description,
        location: nextDraft.location,
        relatedUnit: nextDraft.relatedUnit,
        competency: nextMeta.competency,
        startAt: nextDraft.startAt,
        endAt: nextDraft.endAt,
        totalHours: nextDraft.totalHours === null ? null : Number(nextDraft.totalHours),
        result: nextDraft.result,
        scheduleSkipped: nextMeta.scheduleSkipped,
      });
    } else {
      reply = composeCollectingReply({
        acknowledgement: `อัปเดตแล้ว${nextCategory ? ` · หมวด ${categoryLabel[nextCategory]}` : ""}${topicTitle ? ` · หัวข้อ ${topicTitle}` : ""}`,
        question: buildMissingFieldQuestion(missing, {
          ...nextMeta,
          category: nextCategory,
          topicCountForCategory: nextCategory
            ? topics.filter((topic) => topic.category === nextCategory).length
            : 0,
          totalTopicCount: topics.length,
          hasDraftSubstance: true,
        }),
        fallback: "กรุณาให้ข้อมูลที่ยังขาดต่อได้เลย",
      });
    }

    await prisma.message.create({
      data: { conversationId, role: "ASSISTANT", content: reply },
    });
    await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    return {
      ...(await getConversation(userId, conversationId)),
      torYears: resolvedYear.years,
      topics: topics.map((topic) => ({
        id: topic.id,
        category: topic.category,
        categoryLabel: categoryLabel[topic.category],
        title: topic.title,
        year: topic.torDocument.year,
      })),
    };
  }

  const wantsSaveAsIs = isSaveAsIsIntent(content);
  const wantsSkipSchedule = isSkipScheduleIntent(content) || wantsSaveAsIs;
  const hasDraftSubstance = Boolean(draft.workTitle || draft.description || draft.category);
  const missingBeforeSkip = findMissingFields(
    draftFieldValues(draft, existingMeta),
    existingMeta.workSubtype,
  );
  const canCompleteBySkippingSchedule =
    hasDraftSubstance
    && (existingMeta.scheduleSkipped || onlyScheduleFieldsMissing(missingBeforeSkip) || wantsSkipSchedule);

  // ข้ามวัน–เวลา / บันทึกตามนี้: ไม่เรียก AI ถ้ามีร่างแล้ว
  if (wantsSkipSchedule && canCompleteBySkippingSchedule) {
    const skipMeta: DraftMeta = {
      ...existingMeta,
      eventDate: null,
      startTime: null,
      endTime: null,
      scheduleSkipped: true,
    };
    const skipDraft = {
      workTitle: draft.workTitle,
      category: draft.category,
      torTopicId: draft.torTopicId,
      description: draft.description,
      relatedUnit: draft.relatedUnit,
      location: draft.location,
      startAt: null as Date | null,
      endAt: null as Date | null,
      totalHours: null as Prisma.Decimal | null,
      result: draft.result ?? draft.description,
    };
    if (skipDraft.category && (!skipDraft.torTopicId || !topics.some((topic) => topic.id === skipDraft.torTopicId && topic.category === skipDraft.category))) {
      const picked = applyTopicSelection(
        topics,
        skipDraft.category,
        skipDraft.workTitle,
        skipDraft.description,
        null,
      );
      skipDraft.torTopicId = picked.torTopicId;
      skipMeta.pendingTopicOptions = picked.pendingTopicOptions;
    }
    if (!skipMeta.workSubtype && skipDraft.category) {
      skipMeta.workSubtype = inferSubtypeFromWorkText(
        [skipDraft.description, skipDraft.workTitle].filter(Boolean).join(" "),
        skipDraft.category,
      );
    }
    const missing = findMissingFields(
      {
        ...skipDraft,
        totalHours: null,
        competency: skipMeta.competency,
      },
      skipMeta.workSubtype,
      { scheduleOptional: true },
    );
    const ready = missing.length === 0 && skipMeta.pendingTopicOptions.length === 0;
    await prisma.workDraft.update({
      where: { id: draft.id },
      data: {
        ...skipDraft,
        missingFieldsJson: missing,
        confirmedFieldsJson: skipMeta,
        status: ready ? "READY_FOR_REVIEW" : "COLLECTING",
      },
    });

    // "บันทึกตามนี้" = ยืนยันบันทึกทันทีเมื่อครบแล้ว
    if (ready && wantsSaveAsIs) {
      const confirmed = await confirmChatDraft(userId, conversationId);
      return {
        ...confirmed.conversation,
        ja: confirmed.ja,
        topics: topics.map((topic) => ({
          id: topic.id,
          category: topic.category,
          categoryLabel: categoryLabel[topic.category],
          title: topic.title,
        })),
      };
    }

    const updatedDraft = await prisma.workDraft.findFirstOrThrow({
      where: { id: draft.id },
      include: { torTopic: { select: { title: true, category: true } } },
    });
    const topicTitle = updatedDraft.torTopic?.title
      ?? (skipDraft.torTopicId ? topics.find((topic) => topic.id === skipDraft.torTopicId)?.title ?? null : null);
    const reply = ready
      ? buildReviewMessage({
          workTitle: updatedDraft.workTitle,
          category: updatedDraft.category,
          workSubtype: skipMeta.workSubtype,
          topicTitle,
          description: updatedDraft.description,
          location: updatedDraft.location,
          relatedUnit: updatedDraft.relatedUnit,
          competency: skipMeta.competency,
          startAt: null,
          endAt: null,
          totalHours: null,
          result: updatedDraft.result,
          scheduleSkipped: true,
        })
      : composeCollectingReply({
          acknowledgement: buildDraftProgressAck({
            workTitle: updatedDraft.workTitle,
            category: updatedDraft.category,
            workSubtype: skipMeta.workSubtype,
            topicTitle,
            description: updatedDraft.description,
            location: updatedDraft.location,
            relatedUnit: updatedDraft.relatedUnit,
            competency: skipMeta.competency,
            result: updatedDraft.result,
          }),
          question: buildMissingFieldQuestion(missing, {
            category: skipDraft.category,
            topicCountForCategory: skipDraft.category
              ? topics.filter((topic) => topic.category === skipDraft.category).length
              : 0,
            totalTopicCount: topics.length,
            hasDraftSubstance: true,
          }),
          fallback: `ยังขาดข้อมูล: ${missing.join(", ")} กรุณาบอกเพิ่มเติม`,
        });

    await prisma.message.create({
      data: {
        conversationId,
        role: "ASSISTANT",
        content: reply,
        metadataJson: {
          latencyMs: 0,
          missingFields: missing,
          scheduleSkipped: true,
          readyToConfirm: ready,
          draftPreview: draftSnapshot(updatedDraft, skipMeta),
        },
      },
    });
    await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    const conversation = await getConversation(userId, conversationId);
    return {
      ...conversation,
      topics: topics.map((topic) => ({
        id: topic.id,
        category: topic.category,
        categoryLabel: categoryLabel[topic.category],
        title: topic.title,
      })),
    };
  }

  const recentMessages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { role: true, content: true },
  });
  const now = new Date();
  const referenceDate = {
    todayISO: bangkokDateISO(now),
    todayThai: bangkokDateThaiLabel(now),
    timezone: "Asia/Bangkok",
  };

  const startedAt = Date.now();
  let extraction;
  let usedHeuristicFallback = false;
  try {
    extraction = await extractWork(
      userId,
      {
      message: content,
      referenceDate,
      recentMessages: recentMessages
        .reverse()
        .map((message) => ({
          role: message.role === "ASSISTANT" ? "assistant" : "user",
          content: message.content,
        })),
      topics: topics.map((topic) => ({
        id: topic.id,
        category: topic.category,
        categoryLabel: categoryLabel[topic.category],
        sectionLabel: topic.sectionLabel,
        title: topic.title,
        description: topic.description,
        code: topic.code,
        hoursPerWeek: topic.hoursPerWeek === null ? null : Number(topic.hoursPerWeek),
        year: topic.torDocument.year,
      })),
      currentDraft: draftSnapshot(draft, existingMeta),
      alreadyFilled: Object.entries(draftSnapshot(draft, existingMeta))
        .filter(([, value]) => value !== null && value !== undefined && value !== "")
        .map(([key]) => key),
      learningRules: {
        A: "งานประจำ ต้องเช็คว่าหัวข้อ TOR ตรงไหม",
        B: {
          "2.1": "เข้าร่วมกิจกรรม ต้องถามสถานที่",
          "2.2": "เป็นกรรมการ ต้องถามจนกว่าจะรู้สถานที่",
          "2.3": "บริการวิชาการ ให้บริการบุคคล/หน่วยงานในและนอกองค์กร",
        },
        C: {
          "3.1": "ประชุม/อบรม/สัมมนา/ดูงาน ต้องมีวันที่ เวลา สถานที่ ชั่วโมง และความรู้/ทักษะ/สมรรถนะ",
          "3.2": "พัฒนาและปรับปรุงกระบวนการทำงาน",
        },
        antiLoop: "ห้ามถามฟิลด์ใน alreadyFilled และต้องสะสม eventDate/startTime/endTime ข้ามรอบ",
        scheduleOptional:
          "ถ้าผู้ใช้บอกว่าไม่ต้องระบุวันและช่วงเวลา ให้ถือว่า schedule ข้ามได้ อย่าถามวนเรื่องวันเวลา",
      },
      },
      { model: selectedModel },
    );
  } catch (reason) {
    const detail = reason instanceof Error ? reason.message : "unknown error";
    console.error("[chat] extractWork failed:", detail);

    // ข้อความยาวพอ: ไม่บล็อกผู้ใช้ — สกัดท้องถิ่นแล้วถามฟิลด์ที่ขาดต่อ
    if (content.replace(/\s+/g, " ").trim().length >= 40) {
      extraction = normalizeWorkExtraction(buildHeuristicWorkExtraction(content));
      usedHeuristicFallback = true;
      console.warn("[chat] using heuristic work extraction fallback");
    } else {
      const fallback = /timed?\s*out|timeout/i.test(detail)
        ? `เกตเวย์ AI ตอบช้าเกินเวลา (โมเดล ${detail.match(/model=([^;]+)/)?.[1]?.trim() ?? "ที่ตั้งค่าไว้"}) กรุณาลองใหม่ หรือเปลี่ยนโมเดลที่ตั้งค่า AI เป็นตัวที่ตอบเร็วกว่า`
        : /did not return content/i.test(detail)
          ? `เกตเวย์ AI คืนคำตอบว่างจากโมเดล ${detail.match(/model=([^;]+)/)?.[1]?.trim() ?? "ที่ตั้งค่าไว้"} กรุณาลองใหม่ หรือเปลี่ยนโมเดลที่ตั้งค่า AI`
        : /HTTP 400|ไม่อยู่ในรายการ|invalid model|API key|ตั้งค่า/i.test(detail)
          ? `วิเคราะห์ไม่สำเร็จ: ตรวจการตั้งค่า AI / ชื่อโมเดล — ${detail.slice(0, 220)}`
          : "ระบบยังวิเคราะห์ข้อความไม่สำเร็จ กรุณาตรวจการตั้งค่า AI หรือลองเล่ารายละเอียดงานอีกครั้ง";
      await prisma.message.create({
        data: {
          conversationId,
          role: "ASSISTANT",
          content: fallback,
          metadataJson: { latencyMs: Date.now() - startedAt, failed: true, error: detail.slice(0, 800) },
        },
      });
      await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      throw new ApiError(502, "CHAT_AI_FAILED", fallback);
    }
  }
  const latencyMs = Date.now() - startedAt;

  const schedule = mergeScheduleMeta(existingMeta, extraction, content);
  const answeredCategory = parseCategoryAnswer(content);
  const categoryChange = isCategoryChangeIntent(content);
  const inferredCategory = inferCategoryFromWorkText(
    [content, extraction.description, draft.description].filter(Boolean).join(" "),
  );
  const skipSchedule = isSkipScheduleIntent(content) || existingMeta.scheduleSkipped;
  const providedConcreteSchedule = Boolean(
    normalizeEventDate(schedule.eventDate)
    && schedule.startTime
    && schedule.endTime,
  ) || Boolean(extraction.startAt && extraction.endAt);

  let nextCategory =
    (categoryChange ? answeredCategory : null)
    ?? answeredCategory
    ?? (categoryChange ? null : extraction.category)
    ?? draft.category
    ?? inferredCategory;

  // คำสั่งเปลี่ยนหมวด: บังคับใช้หมวดที่ผู้ใช้บอก ไม่ให้ AI ยึดค่าเดิม
  if (categoryChange && answeredCategory) {
    nextCategory = answeredCategory;
  }

  const categoryChanged =
    Boolean(nextCategory)
    && Boolean(draft.category)
    && nextCategory !== draft.category;

  const nextMeta: DraftMeta = {
    workSubtype:
      categoryChanged || categoryChange
        ? (extraction.workSubtype ?? null)
        : (extraction.workSubtype ?? existingMeta.workSubtype),
    competency: firstNonNull(extraction.competency, existingMeta.competency),
    eventDate: normalizeEventDate(schedule.eventDate),
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    scheduleSkipped: providedConcreteSchedule ? false : skipSchedule,
    torYear: existingMeta.torYear ?? resolvedYear.year,
    pendingTopicOptions: [],
    allowDuplicateSave: false,
  };

  const nextDraft = {
    workTitle: extraction.workTitle ?? draft.workTitle,
    category: nextCategory,
    torTopicId:
      categoryChanged || categoryChange
        ? null
        : (extraction.torTopicId && topics.some((topic) => topic.id === extraction.torTopicId)
            ? extraction.torTopicId
            : draft.torTopicId),
    description: extraction.description ?? draft.description,
    relatedUnit: extraction.relatedUnit ?? draft.relatedUnit,
    location: extraction.location ?? draft.location,
    startAt: extraction.startAt ? new Date(extraction.startAt) : draft.startAt,
    endAt: extraction.endAt ? new Date(extraction.endAt) : draft.endAt,
    totalHours:
      extraction.totalHours === null || extraction.totalHours === undefined
        ? draft.totalHours
        : new Prisma.Decimal(extraction.totalHours),
    result: extraction.result ?? draft.result,
  };

  if (!nextDraft.location && /ที่([^\n]+)/.test(content)) {
    const locationMatch = content.match(/ที่\s*([^\n]+?)(?:\s+เนื้อหา|\s+ตั้งแต่|$)/);
    if (locationMatch?.[1]) nextDraft.location = locationMatch[1].trim();
  }

  if (!nextDraft.description) {
    nextDraft.description = deriveDescription(content);
  }
  if (!nextDraft.workTitle) {
    nextDraft.workTitle = deriveWorkTitle(content, nextDraft.description);
  }
  if (!nextDraft.result && nextDraft.description) {
    nextDraft.result = nextDraft.description;
  }
  if (!nextMeta.competency) {
    nextMeta.competency = deriveCompetency(content);
  }

  if (nextMeta.scheduleSkipped) {
    nextDraft.startAt = null;
    nextDraft.endAt = null;
    nextDraft.totalHours = null;
    nextMeta.eventDate = null;
    nextMeta.startTime = null;
    nextMeta.endTime = null;
  } else {
    const resolved = resolveSchedule(nextMeta, nextDraft.startAt, nextDraft.endAt);
    nextDraft.startAt = resolved.startAt;
    nextDraft.endAt = resolved.endAt;
  }

  if (!nextMeta.workSubtype || categoryChanged || categoryChange) {
    nextMeta.workSubtype = inferSubtypeFromWorkText(
      [content, nextDraft.description, nextDraft.workTitle].filter(Boolean).join(" "),
      nextDraft.category,
    );
  }

  const topicStillValid =
    nextDraft.torTopicId
    && topics.some(
      (topic) =>
        topic.id === nextDraft.torTopicId
        && (!nextDraft.category || topic.category === nextDraft.category),
    );
  if (!topicStillValid) {
    const picked = applyTopicSelection(
      topics,
      nextDraft.category,
      nextDraft.workTitle,
      nextDraft.description,
      null,
    );
    nextDraft.torTopicId = picked.torTopicId;
    nextMeta.pendingTopicOptions = picked.pendingTopicOptions;
  }

  if (!nextMeta.scheduleSkipped && nextDraft.startAt && nextDraft.endAt && nextDraft.totalHours === null) {
    try {
      nextDraft.totalHours = new Prisma.Decimal(calculateHours(nextDraft.startAt, nextDraft.endAt));
    } catch {
      // leave null if times are invalid
    }
  }

  const missing = findMissingFields(
    {
      ...nextDraft,
      totalHours: nextDraft.totalHours === null ? null : Number(nextDraft.totalHours),
      competency: nextMeta.competency,
    },
    nextMeta.workSubtype,
    { scheduleOptional: nextMeta.scheduleSkipped },
  );
  const awaitingTopicChoice = nextMeta.pendingTopicOptions.length > 0;
  if (awaitingTopicChoice && !missing.includes("torTopicId")) {
    missing.push("torTopicId");
  }
  const ready = missing.length === 0 && !awaitingTopicChoice;
  const topicTitle = nextDraft.torTopicId
    ? topics.find((topic) => topic.id === nextDraft.torTopicId)?.title ?? null
    : null;
  const topicCountForCategory = nextDraft.category
    ? topics.filter((topic) => topic.category === nextDraft.category).length
    : 0;

  const updatedDraft = await prisma.workDraft.update({
    where: { id: draft.id },
    data: {
      ...nextDraft,
      missingFieldsJson: missing,
      confirmedFieldsJson: nextMeta,
      aiConfidence: extraction.confidence,
      status: ready ? "READY_FOR_REVIEW" : "COLLECTING",
    },
    include: { torTopic: { select: { title: true, category: true } } },
  });

  const topicChoicePrompt = awaitingTopicChoice
    ? [
        categoryChanged || categoryChange
          ? `เปลี่ยนหมวดเป็น${nextDraft.category ? categoryLabel[nextDraft.category] : "ที่เลือก"} แล้ว พบหัวข้อ TOR ที่ใกล้เคียงหลายรายการในปี พ.ศ. ${nextMeta.torYear ?? "-"}:`
          : `พบหัวข้อ TOR ที่ใกล้เคียงหลายรายการในปี พ.ศ. ${nextMeta.torYear ?? "-"}:`,
        ...nextMeta.pendingTopicOptions.map(
          (option, index) => `${index + 1}) [${option.categoryLabel}] ${option.title}`,
        ),
        "",
        "พิมพ์หมายเลขหัวข้อที่ต้องการใช้ (เช่น 1) — จะไม่ทับรายการเดิมจนกว่าคุณจะยืนยันบันทึก",
      ].join("\n")
    : null;

  const reply = topicChoicePrompt
    ? composeCollectingReply({
        acknowledgement: buildDraftProgressAck({
          workTitle: updatedDraft.workTitle,
          category: updatedDraft.category,
          workSubtype: nextMeta.workSubtype,
          description: updatedDraft.description,
          location: updatedDraft.location,
          relatedUnit: updatedDraft.relatedUnit,
          competency: nextMeta.competency,
          result: updatedDraft.result,
          userMessage: content,
          eventDate: nextMeta.eventDate,
        }),
        question: topicChoicePrompt,
        aiReply: null,
        fallback: topicChoicePrompt,
      })
    : ready
    ? buildReviewMessage({
        workTitle: updatedDraft.workTitle,
        category: updatedDraft.category,
        workSubtype: nextMeta.workSubtype,
        topicTitle: updatedDraft.torTopic?.title ?? topicTitle,
        description: updatedDraft.description,
        location: updatedDraft.location,
        relatedUnit: updatedDraft.relatedUnit,
        competency: nextMeta.competency,
        startAt: updatedDraft.startAt,
        endAt: updatedDraft.endAt,
        totalHours: updatedDraft.totalHours === null ? null : Number(updatedDraft.totalHours),
        result: updatedDraft.result,
        scheduleSkipped: nextMeta.scheduleSkipped,
      })
    : composeCollectingReply({
        acknowledgement: buildDraftProgressAck({
          workTitle: updatedDraft.workTitle,
          category: updatedDraft.category,
          workSubtype: nextMeta.workSubtype,
          topicTitle: updatedDraft.torTopic?.title ?? topicTitle,
          description: updatedDraft.description,
          location: updatedDraft.location,
          relatedUnit: updatedDraft.relatedUnit,
          competency: nextMeta.competency,
          result: updatedDraft.result,
          userMessage: content,
          eventDate: nextMeta.eventDate,
        }),
        question:
          buildMissingFieldQuestion(missing, {
            ...nextMeta,
            category: nextDraft.category,
            topicCountForCategory,
            totalTopicCount: topics.length,
            hasDraftSubstance: Boolean(updatedDraft.workTitle || updatedDraft.description),
          })
          || extraction.nextQuestion?.trim()
          || null,
        aiReply: extraction.userFacingReply,
        fallback: `ยังขาดข้อมูล: ${missing.join(", ")} กรุณาบอกเพิ่มเติม`,
      });

  await prisma.message.create({
    data: {
      conversationId,
      role: "ASSISTANT",
      content: reply,
      metadataJson: {
        latencyMs,
        missingFields: missing,
        category: updatedDraft.category,
        workSubtype: nextMeta.workSubtype,
        readyToConfirm: ready,
        draftPreview: draftSnapshot(updatedDraft, nextMeta),
        heuristicFallback: usedHeuristicFallback || undefined,
      },
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      updatedAt: new Date(),
      title: updatedDraft.workTitle?.slice(0, 60) ?? undefined,
    },
  });

  const conversation = await getConversation(userId, conversationId);
  return {
    ...conversation,
    torYears: resolvedYear.years,
    topics: topics.map((topic) => ({
      id: topic.id,
      category: topic.category,
      categoryLabel: categoryLabel[topic.category],
      title: topic.title,
      year: topic.torDocument.year,
    })),
  };
}

export async function confirmChatDraft(
  userId: string,
  conversationId: string,
  options?: { allowDuplicate?: boolean },
) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: { workDraft: { include: { torTopic: { select: { title: true, category: true } } } } },
  });
  if (!conversation?.workDraft) throw new ApiError(404, "DRAFT_NOT_FOUND", "ไม่พบร่างงาน");
  const draft = conversation.workDraft;
  const meta = readDraftMeta(draft.confirmedFieldsJson);
  if (meta.pendingTopicOptions.length) {
    throw new ApiError(409, "TOPIC_CHOICE_REQUIRED", "กรุณาเลือกหัวข้อ TOR จากตัวเลือกก่อนยืนยัน");
  }
  if (draft.status !== "READY_FOR_REVIEW") {
    throw new ApiError(409, "DRAFT_INCOMPLETE", "ข้อมูลยังไม่ครบ กรุณาตอบคำถามเพิ่มก่อนยืนยัน");
  }

  const missing = findMissingFields(
    draftFieldValues(draft, meta),
    meta.workSubtype,
    { scheduleOptional: meta.scheduleSkipped },
  );
  if (
    missing.length
    || !draft.workTitle
    || !draft.category
    || !draft.torTopicId
    || !draft.description
    || !draft.result
    || (!meta.scheduleSkipped && (!draft.startAt || !draft.endAt || draft.totalHours === null))
  ) {
    throw new ApiError(409, "DRAFT_INCOMPLETE", "ข้อมูลยังไม่ครบตามกฎหมวดงาน กรุณาตอบเพิ่มก่อนยืนยัน");
  }

  const resultWithCompetency = meta.competency
    ? `${draft.result}\nความรู้/ทักษะ/สมรรถนะที่ได้รับ: ${meta.competency}`
    : draft.result;

  const record = await confirmJa(
    userId,
    {
      workTitle: draft.workTitle,
      category: draft.category,
      torTopicId: draft.torTopicId,
      description: draft.description,
      relatedUnit: draft.relatedUnit ?? undefined,
      location: draft.location ?? undefined,
      startAt: draft.startAt,
      endAt: draft.endAt,
      totalHours: draft.totalHours === null ? null : Number(draft.totalHours),
      result: resultWithCompetency,
      scheduleSkipped: meta.scheduleSkipped,
    },
    { allowDuplicate: options?.allowDuplicate || meta.allowDuplicateSave },
  );

  await prisma.jaRecord.update({
    where: { id: record.id },
    data: { sourceConversationId: conversationId },
  });

  await prisma.workDraft.update({
    where: { id: draft.id },
    data: {
      status: "COLLECTING",
      workTitle: null,
      category: null,
      torTopicId: null,
      description: null,
      relatedUnit: null,
      location: null,
      startAt: null,
      endAt: null,
      totalHours: null,
      result: null,
      missingFieldsJson: [],
      confirmedFieldsJson: meta.torYear ? { torYear: meta.torYear } : {},
      aiConfidence: null,
    },
  });

  const categoryText = categoryLabel[draft.category];
  const savedSummary = [
    `บันทึก JA สำเร็จแล้ว (${record.runningNumber})`,
    `• ชื่องาน: ${record.workTitle}`,
    `• หมวด: ${categoryText}`,
    `• ประเภทย่อย: ${meta.workSubtype ? workSubtypeLabel[meta.workSubtype] : "-"}`,
    `• หัวข้อ TOR: ${draft.torTopic?.title ?? "-"}`,
    `• รายละเอียด: ${record.description}`,
    `• สถานที่: ${record.location ?? "-"}`,
    `• ความรู้/ทักษะ/สมรรถนะ: ${meta.competency ?? "-"}`,
    `• เริ่ม: ${formatThaiDateTime(record.startAt, meta.scheduleSkipped)}`,
    `• สิ้นสุด: ${formatThaiDateTime(record.endAt, meta.scheduleSkipped)}`,
    `• ชั่วโมง: ${meta.scheduleSkipped && record.totalHours === null ? "ไม่ระบุ" : (record.totalHours?.toString() ?? "-")}`,
    meta.scheduleSkipped ? "• หมายเหตุ: บันทึกโดยไม่ระบุวันและช่วงเวลา" : null,
    "",
    "ดูรายการและส่งออก Word/PDF ได้ที่หน้าตั้งค่า → รายการงาน หากต้องการบันทึกงานอื่น เล่าต่อได้เลย",
  ]
    .filter((line) => line !== null)
    .join("\n");

  await prisma.message.create({
    data: {
      conversationId,
      role: "ASSISTANT",
      content: savedSummary,
      metadataJson: {
        jaRecordId: record.id,
        runningNumber: record.runningNumber,
        saved: true,
        workSubtype: meta.workSubtype,
      },
    },
  });

  return {
    ja: {
      id: record.id,
      runningNumber: record.runningNumber,
      workTitle: record.workTitle,
      category: record.category,
      categoryLabel: categoryText,
    },
    conversation: await getConversation(userId, conversationId),
  };
}
