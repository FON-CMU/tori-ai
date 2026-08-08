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
      await tx.torTopic.deleteMany({
        where: { torDocumentId: document.id, status: { not: "CONFIRMED" } },
      });
      await tx.torTopic.createMany({
        data: extraction.topics.map((topic) => ({
          torDocumentId: document.id,
          userId,
          category: topic.category,
          code: topic.code,
          title: topic.title,
          description: topic.description,
          sourcePage: topic.sourcePage,
          status: activate ? "CONFIRMED" : "DRAFT",
        })),
      });
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
      include: { pages: true, topics: true },
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
