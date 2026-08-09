import "server-only";

import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { currentBuddhistYear } from "@/lib/date";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/http/api-error";
import { prisma } from "@/lib/prisma";
import { objectStorage } from "@/lib/storage/provider";

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const torYearSchema = z.coerce
  .number()
  .int("ปีต้องเป็นจำนวนเต็ม")
  .min(2500, "ปี พ.ศ. ไม่ถูกต้อง")
  .max(2700, "ปี พ.ศ. ไม่ถูกต้อง");

function detectMime(bytes: Uint8Array) {
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") return PDF_MIME;
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && [0x03, 0x05, 0x07].includes(bytes[2] ?? -1);
  if (isZip && Buffer.from(bytes).includes(Buffer.from("word/"))) return DOCX_MIME;
  return null;
}

function safeDisplayName(name: string) {
  return path.basename(name).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180) || "tor-document";
}

export async function uploadTor(userId: string, file: File, yearInput?: unknown) {
  const year = yearInput === undefined || yearInput === null || yearInput === ""
    ? currentBuddhistYear()
    : torYearSchema.parse(yearInput);

  const maxBytes = env.MAX_TOR_FILE_SIZE_MB * 1024 * 1024;
  if (file.size === 0) throw new ApiError(400, "EMPTY_FILE", "ไฟล์ไม่มีข้อมูล");
  if (file.size > maxBytes) {
    throw new ApiError(413, "FILE_TOO_LARGE", `ไฟล์ต้องมีขนาดไม่เกิน ${env.MAX_TOR_FILE_SIZE_MB} MB`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = detectMime(bytes);
  if (!mimeType) throw new ApiError(415, "UNSUPPORTED_FILE", "รองรับเฉพาะไฟล์ PDF หรือ DOCX ที่ถูกต้อง");

  const fileHash = createHash("sha256").update(bytes).digest("hex");
  const duplicate = await prisma.torDocument.findFirst({
    where: { userId, fileHash, status: { not: "ARCHIVED" } },
  });
  if (duplicate) throw new ApiError(409, "DUPLICATE_FILE", "ไฟล์ TOR นี้ถูกอัปโหลดแล้ว");

  const latest = await prisma.torDocument.aggregate({ where: { userId }, _max: { version: true } });
  const storageKey = `${userId}/${randomUUID()}`;
  await objectStorage.put(storageKey, bytes);
  try {
    return await prisma.torDocument.create({
      data: {
        userId,
        fileName: safeDisplayName(file.name),
        mimeType,
        storageKey,
        fileHash,
        version: (latest._max.version ?? 0) + 1,
        year,
        status: "UPLOADED",
      },
    });
  } catch (error) {
    await objectStorage.delete(storageKey);
    throw error;
  }
}

export async function updateTorYear(userId: string, torDocumentId: string, yearInput: unknown) {
  const year = torYearSchema.parse(yearInput);
  const document = await prisma.torDocument.findFirst({ where: { id: torDocumentId, userId } });
  if (!document) throw new ApiError(404, "TOR_NOT_FOUND", "ไม่พบเอกสาร TOR");
  if (document.status === "ARCHIVED") {
    throw new ApiError(409, "INVALID_TOR_STATUS", "ไม่สามารถแก้ไข TOR ที่เก็บถาวรแล้ว");
  }
  return prisma.torDocument.update({
    where: { id: document.id },
    data: { year },
  });
}

/**
 * ลบเอกสารออกจากรายการ (archive) — ไม่ลบแถวจริง
 *
 * การลบแถวจะพาหัวข้อ TOR หายตามไปด้วย (onDelete: Cascade) แล้ว JA ที่ผูกอยู่จะถูก
 * SetNull ทั้ง torDocumentId และ torTopicId คือผลงานที่ยืนยันแล้วหลุดออกจากฟอร์ม
 * อย่างกู้ไม่ได้ การ archive เก็บทั้งแถวและสายสัมพันธ์ไว้ ส่วนไฟล์ต้นฉบับลบทิ้งจริง
 * เพราะเป็นเอกสารบุคคล และ processTor ปฏิเสธเอกสารสถานะ ARCHIVED อยู่แล้ว
 */
export async function deleteTor(userId: string, torDocumentId: string) {
  const document = await prisma.torDocument.findFirst({
    where: { id: torDocumentId, userId, status: { not: "ARCHIVED" } },
  });
  if (!document) throw new ApiError(404, "TOR_NOT_FOUND", "ไม่พบเอกสาร TOR");

  const before = JSON.parse(JSON.stringify(document)) as Prisma.InputJsonValue;
  await prisma.$transaction(async (tx) => {
    const updated = await tx.torDocument.update({
      where: { id: document.id },
      data: { status: "ARCHIVED" },
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "TOR_ARCHIVED",
        objectType: "TorDocument",
        objectId: document.id,
        beforeJson: before,
        afterJson: JSON.parse(JSON.stringify(updated)) as Prisma.InputJsonValue,
      },
    });
  });

  await objectStorage.delete(document.storageKey);
  return { id: document.id };
}
