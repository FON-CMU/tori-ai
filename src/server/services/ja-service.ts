import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/http/api-error";
import { prisma } from "@/lib/prisma";
import { workInputSchema } from "@/lib/validation/work";

export async function confirmJa(userId: string, raw: unknown) {
  const input = workInputSchema.parse(raw);
  const topic = await prisma.torTopic.findFirst({ where: { id: input.torTopicId, userId, status: "CONFIRMED", category: input.category, torDocument: { status: "ACTIVE" } }, include: { torDocument: true } });
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
