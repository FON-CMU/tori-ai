import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/http/api-error";
import { prisma } from "@/lib/prisma";
import { workInputSchema } from "@/lib/validation/work";

export async function confirmJa(userId: string, raw: unknown) {
  const input = workInputSchema.parse(raw);
  const topic = await prisma.torTopic.findFirst({
    where: {
      id: input.torTopicId,
      userId,
      status: "CONFIRMED",
      matchable: true,
      kind: "TOPIC",
      category: input.category,
      torDocument: { status: "ACTIVE" },
    },
    include: { torDocument: true },
  });
  if (!topic) throw new ApiError(400, "INVALID_TOR_TOPIC", "หัวข้อ TOR ไม่ใช่หัวข้อที่ใช้งานอยู่ของคุณ");
  const duplicate = await prisma.jaRecord.findFirst({ where: { userId, torTopicId: topic.id, startAt: input.startAt, endAt: input.endAt, status: { not: "ARCHIVED" } } });
  if (duplicate) throw new ApiError(409, "DUPLICATE_JA", "พบรายการงานที่มีเวลาและหัวข้อเดียวกัน");
  return prisma.$transaction(async (tx) => {
    const count = await tx.jaRecord.count({ where: { userId, createdAt: { gte: new Date(Date.UTC(input.startAt.getUTCFullYear(), 0, 1)) } } });
    const runningNumber = `JA-${input.startAt.getUTCFullYear()}-${String(count + 1).padStart(6, "0")}`;
    const record = await tx.jaRecord.create({ data: { ...input, totalHours: new Prisma.Decimal(input.totalHours), runningNumber, userId, torDocumentId: topic.torDocumentId, status: "CONFIRMED", confirmedAt: new Date() } });
    const snapshot = JSON.parse(JSON.stringify(record)) as Prisma.InputJsonValue;
    await tx.jaRecordVersion.create({ data: { jaRecordId: record.id, version: 1, snapshotJson: snapshot, changedBy: userId, changeReason: "ยืนยันรายการ" } });
    await tx.auditLog.create({ data: { actorId: userId, action: "JA_CONFIRMED", objectType: "JaRecord", objectId: record.id, afterJson: snapshot } });
    return record;
  });
}

/** ลบรายการจากรายงาน (archive) — คงประวัติในฐานข้อมูล */
export async function deleteJa(userId: string, jaId: string) {
  const record = await prisma.jaRecord.findFirst({
    where: { id: jaId, userId, status: { not: "ARCHIVED" } },
  });
  if (!record) throw new ApiError(404, "JA_NOT_FOUND", "ไม่พบรายการงาน");

  const before = JSON.parse(JSON.stringify(record)) as Prisma.InputJsonValue;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.jaRecord.update({
      where: { id: record.id },
      data: { status: "ARCHIVED" },
    });
    const versionCount = await tx.jaRecordVersion.count({ where: { jaRecordId: record.id } });
    const after = JSON.parse(JSON.stringify(updated)) as Prisma.InputJsonValue;
    await tx.jaRecordVersion.create({
      data: {
        jaRecordId: record.id,
        version: versionCount + 1,
        snapshotJson: after,
        changedBy: userId,
        changeReason: "ลบรายการจากรายงาน",
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "JA_ARCHIVED",
        objectType: "JaRecord",
        objectId: record.id,
        beforeJson: before,
        afterJson: after,
      },
    });
    return { id: updated.id, status: updated.status };
  });
}
