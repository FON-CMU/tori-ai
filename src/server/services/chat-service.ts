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
import { workSubtypeSchema } from "@/lib/validation/ai";
import {
  buildMissingFieldQuestion,
  deriveCompetency,
  deriveDescription,
  deriveWorkTitle,
  findMissingFields,
  inferCategoryFromWorkText,
  inferSubtypeFromWorkText,
  parseCategoryAnswer,
} from "@/lib/validation/work";
import { resolveOpenAiSettings } from "@/server/services/ai-settings-service";
import { tryHandleChatCommand } from "@/server/services/chat-command-service";
import { confirmJa } from "@/server/services/ja-service";

const categoryLabel = {
  ROUTINE: "งานประจำ",
  ASSIGNED: "งานที่ได้รับมอบหมาย",
  DEVELOPMENT: "งานเชิงพัฒนา",
} as const;

type DraftMeta = {
  workSubtype: WorkSubtype | null;
  competency: string | null;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
};

function readDraftMeta(value: Prisma.JsonValue | null | undefined): DraftMeta {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { workSubtype: null, competency: null, eventDate: null, startTime: null, endTime: null };
  }
  const record = value as Record<string, unknown>;
  const subtypeParse = workSubtypeSchema.safeParse(record.workSubtype);
  const asText = (key: string) =>
    typeof record[key] === "string" && record[key].trim() ? (record[key] as string).trim() : null;
  return {
    workSubtype: subtypeParse.success ? subtypeParse.data : null,
    competency: asText("competency"),
    eventDate: asText("eventDate"),
    startTime: normalizeTimeHm(asText("startTime")),
    endTime: normalizeTimeHm(asText("endTime")),
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

function formatThaiDateTime(value: Date | null) {
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
}) {
  const isC31 = input.workSubtype === "C_3_1";
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
    `• เริ่ม: ${formatThaiDateTime(input.startAt)}`,
    `• สิ้นสุด: ${formatThaiDateTime(input.endAt)}`,
    `• ชั่วโมง: ${input.totalHours ?? "-"}`,
  );
  if (!isC31) {
    lines.push(`• ผลลัพธ์: ${input.result ?? "-"}`);
  }
  lines.push(
    "",
    "หากถูกต้อง ให้กดปุ่ม “ยืนยันบันทึก JA” ด้านล่าง หรือพิมพ์ “ยืนยัน”",
    "รายการนี้จะไปอยู่ในช่องผลการปฏิบัติงานจริงของรายงานทั้งฉบับ",
  );
  return lines.join("\n");
}

async function loadActiveTopics(userId: string) {
  return prisma.torTopic.findMany({
    where: {
      userId,
      status: "CONFIRMED",
      matchable: true,
      kind: "TOPIC",
      torDocument: { status: "ACTIVE" },
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
    startAtLabel: formatThaiDateTime(draft.startAt),
    endAtLabel: formatThaiDateTime(draft.endAt),
    totalHours: draft.totalHours === null ? null : Number(draft.totalHours),
    result: draft.result,
    missingFields: missing,
    aiConfidence: draft.aiConfidence,
    readyToConfirm: draft.status === "READY_FOR_REVIEW" && missing.length === 0,
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

  const topics = await loadActiveTopics(userId);
  if (!topics.length) {
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
        workDraft: { create: { userId, status: "COLLECTING" } },
      },
    });
    conversationId = created.id;
  }

  const draft = await prisma.workDraft.upsert({
    where: { conversationId },
    update: {},
    create: { conversationId, userId, status: "COLLECTING" },
    include: { torTopic: { select: { title: true, category: true } } },
  });
  const existingMeta = readDraftMeta(draft.confirmedFieldsJson);

  const draftMissing = findMissingFields(draftFieldValues(draft, existingMeta), existingMeta.workSubtype);
  if (draft.status === "READY_FOR_REVIEW" && draftMissing.length === 0 && isConfirmIntent(content)) {
    await prisma.message.create({ data: { conversationId, role: "USER", content } });
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

  await prisma.message.create({
    data: { conversationId, role: "USER", content },
  });

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
      },
      },
      { model: selectedModel },
    );
  } catch (reason) {
    const detail = reason instanceof Error ? reason.message : "unknown error";
    console.error("[chat] extractWork failed:", detail);
    const fallback = /timed?\s*out|timeout/i.test(detail)
      ? `เกตเวย์ AI ตอบช้าเกินเวลา (โมเดล ${detail.match(/model=([^;]+)/)?.[1]?.trim() ?? "ที่ตั้งค่าไว้"}) กรุณาลองใหม่ หรือเปลี่ยนโมเดลที่ตั้งค่า AI เป็นตัวที่ตอบเร็วกว่า`
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
  const latencyMs = Date.now() - startedAt;

  const schedule = mergeScheduleMeta(existingMeta, extraction, content);
  const answeredCategory = parseCategoryAnswer(content);
  const inferredCategory = inferCategoryFromWorkText(
    [content, extraction.description, draft.description].filter(Boolean).join(" "),
  );

  const nextMeta: DraftMeta = {
    workSubtype: extraction.workSubtype ?? existingMeta.workSubtype,
    competency: firstNonNull(extraction.competency, existingMeta.competency),
    eventDate: normalizeEventDate(schedule.eventDate),
    startTime: schedule.startTime,
    endTime: schedule.endTime,
  };

  const nextDraft = {
    workTitle: extraction.workTitle ?? draft.workTitle,
    category:
      answeredCategory
      ?? extraction.category
      ?? draft.category
      ?? inferredCategory,
    torTopicId: extraction.torTopicId ?? draft.torTopicId,
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

  const resolved = resolveSchedule(nextMeta, nextDraft.startAt, nextDraft.endAt);
  nextDraft.startAt = resolved.startAt;
  nextDraft.endAt = resolved.endAt;

  if (!nextMeta.workSubtype) {
    nextMeta.workSubtype = inferSubtypeFromWorkText(
      [content, nextDraft.description, nextDraft.workTitle].filter(Boolean).join(" "),
      nextDraft.category,
    );
  }

  if (nextDraft.category && (!nextDraft.torTopicId || !topics.some((topic) => topic.id === nextDraft.torTopicId))) {
    const inCategory = topics.filter((topic) => topic.category === nextDraft.category);
    const matched =
      inCategory.find((topic) =>
        nextDraft.workTitle && topic.title.includes(nextDraft.workTitle.slice(0, 20))
      )
      ?? inCategory.find((topic) =>
        nextDraft.description && topic.title.length > 0 && nextDraft.description.includes(topic.title)
      )
      ?? inCategory[0]
      ?? null;
    nextDraft.torTopicId = matched?.id ?? null;
  }

  if (nextDraft.startAt && nextDraft.endAt && nextDraft.totalHours === null) {
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
  );
  const ready = missing.length === 0;
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

  const reply = ready
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
      })
    : buildMissingFieldQuestion(missing, {
        ...nextMeta,
        category: nextDraft.category,
        topicCountForCategory,
        totalTopicCount: topics.length,
      })
      || extraction.nextQuestion?.trim()
      || extraction.userFacingReply.trim()
      || `ยังขาดข้อมูล: ${missing.join(", ")} กรุณาบอกเพิ่มเติม`;

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
    topics: topics.map((topic) => ({
      id: topic.id,
      category: topic.category,
      categoryLabel: categoryLabel[topic.category],
      title: topic.title,
    })),
  };
}

export async function confirmChatDraft(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: { workDraft: { include: { torTopic: { select: { title: true, category: true } } } } },
  });
  if (!conversation?.workDraft) throw new ApiError(404, "DRAFT_NOT_FOUND", "ไม่พบร่างงาน");
  const draft = conversation.workDraft;
  const meta = readDraftMeta(draft.confirmedFieldsJson);
  if (draft.status !== "READY_FOR_REVIEW") {
    throw new ApiError(409, "DRAFT_INCOMPLETE", "ข้อมูลยังไม่ครบ กรุณาตอบคำถามเพิ่มก่อนยืนยัน");
  }

  const missing = findMissingFields(draftFieldValues(draft, meta), meta.workSubtype);
  if (
    missing.length
    || !draft.workTitle
    || !draft.category
    || !draft.torTopicId
    || !draft.description
    || !draft.startAt
    || !draft.endAt
    || draft.totalHours === null
    || !draft.result
  ) {
    throw new ApiError(409, "DRAFT_INCOMPLETE", "ข้อมูลยังไม่ครบตามกฎหมวดงาน กรุณาตอบเพิ่มก่อนยืนยัน");
  }

  const resultWithCompetency = meta.competency
    ? `${draft.result}\nความรู้/ทักษะ/สมรรถนะที่ได้รับ: ${meta.competency}`
    : draft.result;

  const record = await confirmJa(userId, {
    workTitle: draft.workTitle,
    category: draft.category,
    torTopicId: draft.torTopicId,
    description: draft.description,
    relatedUnit: draft.relatedUnit ?? undefined,
    location: draft.location ?? undefined,
    startAt: draft.startAt,
    endAt: draft.endAt,
    totalHours: Number(draft.totalHours),
    result: resultWithCompetency,
  });

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
      confirmedFieldsJson: {},
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
    `• เริ่ม: ${formatThaiDateTime(record.startAt)}`,
    `• สิ้นสุด: ${formatThaiDateTime(record.endAt)}`,
    `• ชั่วโมง: ${record.totalHours.toString()}`,
    "",
    "ดูรายการและส่งออก Word/PDF ได้ที่หน้าตั้งค่า → รายการงาน หากต้องการบันทึกงานอื่น เล่าต่อได้เลย",
  ].join("\n");

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
