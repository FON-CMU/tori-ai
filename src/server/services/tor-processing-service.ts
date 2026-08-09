import "server-only";

import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

import { ApiError } from "@/lib/http/api-error";
import { extractTor } from "@/lib/openai/client";
import { prisma } from "@/lib/prisma";
import { objectStorage } from "@/lib/storage/provider";
import { topicIdentity } from "@/lib/tor/topic-identity";

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
    include: { pages: { orderBy: { pageNumber: "asc" } } },
  });
  if (!document) throw new ApiError(404, "TOR_NOT_FOUND", "ไม่พบเอกสาร TOR");
  if (!document.pages.length) {
    throw new ApiError(409, "TEXT_REQUIRED", "กรุณาประมวลผลข้อความจากเอกสารก่อน");
  }

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
      // JA ผูกหัวข้อผ่าน torTopicId ที่ schema ตั้ง onDelete: SetNull ไว้ การลบหัวข้อ
      // ทิ้งทั้งชุดเพื่อสร้างใหม่จึงตัดสายนี้ขาดทุกเส้นแบบเงียบ ๆ — ผลงานที่ยืนยันแล้ว
      // จะหลุดออกจากฟอร์มโดยไม่มีใครรู้ เก็บคู่ (id, คีย์หัวข้อ) ไว้ก่อนแล้วผูกกลับ
      const linkSelect = {
        id: true,
        torTopic: { select: { kind: true, code: true, title: true } },
      } as const;
      const jaLinks = await tx.jaRecord.findMany({
        where: { userId, torTopic: { torDocumentId: document.id } },
        select: linkSelect,
      });
      const draftLinks = await tx.workDraft.findMany({
        where: { userId, torTopic: { torDocumentId: document.id } },
        select: linkSelect,
      });

      // ฉบับเดิมของปีเดียวกันถูกแทนที่ด้วยฉบับนี้ ย้าย JA ของฉบับนั้นตามมาด้วย
      // ไม่งั้นพออีกฉบับถูก archive รายงานของมันจะหายไปพร้อมผลงานที่บันทึกไว้
      const superseded = activate
        ? await tx.torDocument.findMany({
            where: { userId, year: document.year, status: "ACTIVE", id: { not: document.id } },
            select: { id: true },
          })
        : [];
      const supersededJaLinks = superseded.length
        ? await tx.jaRecord.findMany({
            where: { userId, torDocumentId: { in: superseded.map((row) => row.id) } },
            select: linkSelect,
          })
        : [];

      // ตัด parent ก่อน แล้วลบทั้งชุดเพื่อแทนที่ด้วยโครงใหม่ตามไฟล์
      await tx.torTopic.updateMany({
        where: { torDocumentId: document.id },
        data: { parentId: null },
      });
      await tx.torTopic.deleteMany({ where: { torDocumentId: document.id } });

      const keyToId = new Map<string, string>();
      const idByTopicKey = new Map<string, string>();
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
          select: { id: true },
        });
        keyToId.set(topic.selfKey, created.id);
        idByTopicKey.set(topicIdentity(topic), created.id);
      }

      // ผูกกลับ: หัวข้อที่ AI อ่านได้เหมือนเดิม (kind + code + title) ถือว่าเป็นหัวข้อ
      // เดียวกัน ส่วนหัวข้อที่หายไปจากไฟล์ JA จะกลายเป็นรายการที่ยังไม่ผูกหัวข้อ
      // ซึ่งยังเห็นในฟอร์ม ต่างจากเดิมที่หายไปทั้งเงียบ ๆ
      const jaByTarget = new Map<string | null, string[]>();
      for (const link of [...jaLinks, ...supersededJaLinks]) {
        const target = link.torTopic ? idByTopicKey.get(topicIdentity(link.torTopic)) ?? null : null;
        jaByTarget.set(target, [...(jaByTarget.get(target) ?? []), link.id]);
      }
      for (const [target, ids] of jaByTarget) {
        await tx.jaRecord.updateMany({
          where: { id: { in: ids } },
          data: { torTopicId: target, torDocumentId: document.id },
        });
      }

      const draftByTarget = new Map<string | null, string[]>();
      for (const link of draftLinks) {
        const target = link.torTopic ? idByTopicKey.get(topicIdentity(link.torTopic)) ?? null : null;
        draftByTarget.set(target, [...(draftByTarget.get(target) ?? []), link.id]);
      }
      for (const [target, ids] of draftByTarget) {
        await tx.workDraft.updateMany({ where: { id: { in: ids } }, data: { torTopicId: target } });
      }

      if (superseded.length) {
        await tx.torDocument.updateMany({
          where: { id: { in: superseded.map((row) => row.id) } },
          data: { status: "ARCHIVED" },
        });
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
      // Topics are inserted one at a time because children need their parent's
      // generated id, so this transaction is held open for one round-trip per
      // topic. Prisma's 5s default is not enough for a large TOR.
    }, { timeout: 30_000, maxWait: 10_000 });

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
