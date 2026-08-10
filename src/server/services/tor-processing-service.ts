import "server-only";

import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

import { ApiError } from "@/lib/http/api-error";
import { extractTor } from "@/lib/openai/client";
import { prisma } from "@/lib/prisma";
import { objectStorage } from "@/lib/storage/provider";

async function extractPages(mimeType: string, bytes: Uint8Array) {
  if (mimeType === "application/pdf") {
    const parser = new PDFParse({ data: bytes });
    try {
      const result = await parser.getText();
      return result.pages.map((page) => ({ pageNumber: page.num, text: page.text.trim() }));
    } finally {
      await parser.destroy();
    }
  }
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return [{ pageNumber: 1, text: result.value.trim() }];
}

function topicMatchKey(input: {
  category: string;
  kind: string;
  code: string | null;
  title: string;
}) {
  return [
    input.category,
    input.kind,
    (input.code ?? "").trim().toLowerCase(),
    input.title.trim().toLowerCase().replace(/\s+/g, " "),
  ].join("|");
}

export async function processTor(userId: string, torDocumentId: string) {
  const document = await prisma.torDocument.findFirst({ where: { id: torDocumentId, userId } });
  if (!document) throw new ApiError(404, "TOR_NOT_FOUND", "ไม่พบเอกสาร TOR");
  if (["ACTIVE", "ARCHIVED"].includes(document.status)) {
    throw new ApiError(409, "INVALID_TOR_STATUS", "ไม่สามารถประมวลผล TOR ในสถานะนี้ได้");
  }

  await prisma.torDocument.update({
    where: { id: document.id },
    data: { status: "PROCESSING", processingError: null },
  });

  try {
    const pages = await extractPages(document.mimeType, await objectStorage.get(document.storageKey));
    if (!pages.some((page) => page.text.length >= 10)) throw new Error("NO_TEXT");

    await prisma.$transaction(async (tx) => {
      await tx.torPage.deleteMany({ where: { torDocumentId: document.id } });
      await tx.torPage.createMany({
        data: pages.map((page) => ({
          torDocumentId: document.id,
          pageNumber: page.pageNumber,
          extractedText: page.text,
          extractionMethod: "DIRECT",
          confidence: 1,
        })),
      });
      await tx.torDocument.update({
        where: { id: document.id },
        data: { status: "REVIEW_REQUIRED", processingError: null },
      });
    });

    return prisma.torDocument.findUniqueOrThrow({
      where: { id: document.id },
      include: { pages: true, topics: true },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message === "NO_TEXT"
        ? "ไม่พบข้อความในเอกสาร ต้องใช้ OCR สำหรับเอกสารสแกน"
        : "ไม่สามารถอ่านข้อความจาก TOR ได้ กรุณาตรวจไฟล์และลองใหม่";
    await prisma.torDocument.update({
      where: { id: document.id },
      data: { status: "FAILED", processingError: message },
    });
    throw new ApiError(422, "TOR_PROCESSING_FAILED", message);
  }
}

export async function analyzeTor(userId: string, torDocumentId: string, options?: { activate?: boolean }) {
  const activate = options?.activate ?? true;
  const document = await prisma.torDocument.findFirst({
    where: { id: torDocumentId, userId },
    include: {
      pages: { orderBy: { pageNumber: "asc" } },
      topics: {
        where: { kind: "TOPIC" },
        select: { id: true, category: true, kind: true, code: true, title: true },
      },
    },
  });
  if (!document) throw new ApiError(404, "TOR_NOT_FOUND", "ไม่พบเอกสาร TOR");
  if (!document.pages.length) {
    throw new ApiError(409, "TEXT_REQUIRED", "กรุณาประมวลผลข้อความจากเอกสารก่อน");
  }

  // จับคู่ JA เดิมก่อนลบหัวข้อ เพื่อผูกกลับหลังวิเคราะห์ใหม่
  const oldTopicIds = document.topics.map((topic) => topic.id);
  const jaLinks = oldTopicIds.length
    ? await prisma.jaRecord.findMany({
        where: { userId, torTopicId: { in: oldTopicIds }, status: { not: "ARCHIVED" } },
        select: { id: true, torTopicId: true },
      })
    : [];
  const oldKeyByTopicId = new Map(
    document.topics.map((topic) => [topic.id, topicMatchKey(topic)]),
  );

  await prisma.torDocument.update({
    where: { id: document.id },
    data: { status: "PROCESSING", processingError: null },
  });

  try {
    const extraction = await extractTor(
      userId,
      document.pages.map((page) => `[หน้า ${page.pageNumber}]\n${page.extractedText}`).join("\n\n"),
    );
    console.info("[tor] extractTor topics:", extraction.topics.length, "warnings:", extraction.warnings.length);
    if (!extraction.topics.length) throw new Error("NO_TOPICS");

    await prisma.$transaction(async (tx) => {
      await tx.torTopic.updateMany({
        where: { torDocumentId: document.id },
        data: { parentId: null },
      });
      await tx.torTopic.deleteMany({ where: { torDocumentId: document.id } });

      const keyToId = new Map<string, string>();
      const matchKeyToId = new Map<string, string>();
      const sorted = [...extraction.topics].sort((a, b) => a.sortOrder - b.sortOrder);

      for (const topic of sorted) {
        const parentId = topic.parentKey ? keyToId.get(topic.parentKey) ?? null : null;
        const created = await tx.torTopic.create({
          data: {
            torDocumentId: document.id,
            userId,
            category: topic.category,
            kind: topic.kind,
            sectionLabel: topic.sectionLabel,
            code: topic.code,
            title: topic.title,
            description: topic.description,
            hoursPerWeek:
              topic.hoursPerWeek === null || topic.hoursPerWeek === undefined
                ? null
                : topic.hoursPerWeek,
            sortOrder: topic.sortOrder,
            matchable: topic.matchable,
            parentId,
            sourcePage: topic.sourcePage,
            status: activate ? "CONFIRMED" : "DRAFT",
          },
          select: { id: true, category: true, kind: true, code: true, title: true },
        });
        keyToId.set(topic.selfKey, created.id);
        matchKeyToId.set(topicMatchKey(created), created.id);
      }

      // ผูก JA กลับตาม category+kind+code+title
      for (const link of jaLinks) {
        if (!link.torTopicId) continue;
        const oldKey = oldKeyByTopicId.get(link.torTopicId);
        const newId = oldKey ? matchKeyToId.get(oldKey) : null;
        if (newId) {
          await tx.jaRecord.update({
            where: { id: link.id },
            data: { torTopicId: newId, torDocumentId: document.id },
          });
        }
      }

      // ย้าย JA จาก TOR ปีเดียวกันที่ถูก archive มาผูกกับฉบับใหม่เมื่อ activate
      if (activate) {
        const archivedSameYear = await tx.torDocument.findMany({
          where: {
            userId,
            year: document.year,
            status: "ARCHIVED",
            id: { not: document.id },
          },
          select: { id: true },
        });
        if (archivedSameYear.length) {
          const orphaned = await tx.jaRecord.findMany({
            where: {
              userId,
              torDocumentId: { in: archivedSameYear.map((row) => row.id) },
              status: { not: "ARCHIVED" },
            },
            include: {
              torTopic: { select: { category: true, kind: true, code: true, title: true } },
            },
          });
          for (const ja of orphaned) {
            const key = ja.torTopic
              ? topicMatchKey(ja.torTopic)
              : null;
            const newTopicId = key ? matchKeyToId.get(key) : null;
            await tx.jaRecord.update({
              where: { id: ja.id },
              data: {
                torDocumentId: document.id,
                torTopicId: newTopicId ?? ja.torTopicId,
              },
            });
          }
        }
      }

      await tx.torDocument.update({
        where: { id: document.id },
        data: {
          status: activate ? "ACTIVE" : "REVIEW_REQUIRED",
          processingError: extraction.warnings.length
            ? extraction.warnings.join(" • ").slice(0, 1000)
            : null,
        },
      });
    });

    return prisma.torDocument.findUniqueOrThrow({
      where: { id: document.id },
      include: {
        pages: true,
        topics: { orderBy: [{ sortOrder: "asc" }, { title: "asc" }] },
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    console.error("[tor] analyzeTor failed:", detail);
    const message =
      detail === "NO_TOPICS"
        ? "AI ไม่พบหัวข้อ TOR ในเอกสาร"
        : /timed?\s*out|timeout/i.test(detail)
          ? `เกตเวย์ AI ตอบช้าเกินเวลาขณะวิเคราะห์ TOR กรุณาลองใหม่ หรือใช้โมเดลที่ตอบเร็วกว่าในตั้งค่า AI`
        : /model=|HTTP|API key|ตั้งค่า|โมเดล/i.test(detail)
          ? `วิเคราะห์หัวข้อไม่สำเร็จ: ${detail.slice(0, 280)}`
          : "วิเคราะห์หัวข้อไม่สำเร็จ กรุณาตรวจการตั้งค่า AI และลองใหม่";
    try {
      await prisma.torDocument.update({
        where: { id: document.id },
        data: { status: "REVIEW_REQUIRED", processingError: message },
      });
    } catch (updateError) {
      console.error("[tor] failed to persist analysis error:", updateError);
    }
    throw new ApiError(422, "TOR_ANALYSIS_FAILED", message);
  }
}

/** ประมวลผล + วิเคราะห์แยก request ใน API — helper สำหรับ local/legacy */
export async function ingestTor(userId: string, torDocumentId: string) {
  const processed = await processTor(userId, torDocumentId);
  try {
    return await analyzeTor(userId, processed.id, { activate: true });
  } catch (error) {
    if (error instanceof ApiError && error.code === "TOR_ANALYSIS_FAILED") {
      return prisma.torDocument.findUniqueOrThrow({
        where: { id: processed.id },
        include: { pages: true, topics: true },
      });
    }
    throw error;
  }
}
