import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/http/api-error";
import { prisma } from "@/lib/prisma";
import { workInputSchema } from "@/lib/validation/work";

export async function confirmJa(
  userId: string,
  raw: unknown,
  options?: { allowDuplicate?: boolean },
) {
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

  const scheduleSkipped = Boolean(input.scheduleSkipped) || (!input.startAt && !input.endAt);
  const startAt = input.startAt ?? null;
  const endAt = input.endAt ?? null;
  const totalHours = scheduleSkipped && (input.totalHours === null || input.totalHours === undefined)
    ? null
    : input.totalHours ?? null;

  const duplicate = scheduleSkipped
    ? await prisma.jaRecord.findFirst({
        where: {
          userId,
          torTopicId: topic.id,
          workTitle: input.workTitle,
          startAt: null,
          endAt: null,
          status: { not: "ARCHIVED" },
        },
      })
    : await prisma.jaRecord.findFirst({
        where: {
          userId,
          torTopicId: topic.id,
          startAt: startAt!,
          endAt: endAt!,
          status: { not: "ARCHIVED" },
        },
      });
  if (duplicate && !options?.allowDuplicate) {
    throw new ApiError(
      409,
      "DUPLICATE_JA",
      `พบรายการใกล้เคียงแล้ว (${duplicate.runningNumber}: ${duplicate.workTitle}) — กด “บันทึกเป็นรายการใหม่” หากต้องการบันทึกเพิ่ม โดยไม่ทับของเดิม หรือพิมพ์ “บันทึกใหม่”`,
    );
  }

  const yearAnchor = startAt ?? new Date();
  return prisma.$transaction(async (tx) => {
    const year = yearAnchor.getUTCFullYear();
    const prefix = `JA-${year}-`;
    // runningNumber เป็น @unique ทั้งระบบ — ต้องนับจากเลขล่าสุดของทั้งฐาน ไม่ใช่แค่ของ user
    const latest = await tx.jaRecord.findFirst({
      where: { runningNumber: { startsWith: prefix } },
      orderBy: { runningNumber: "desc" },
      select: { runningNumber: true },
    });
    let nextSeq = 1;
    if (latest?.runningNumber) {
      const parsed = Number(latest.runningNumber.slice(prefix.length));
      if (Number.isFinite(parsed) && parsed >= 0) nextSeq = parsed + 1;
    }
    const runningNumber = `${prefix}${String(nextSeq).padStart(6, "0")}`;
    const record = await tx.jaRecord.create({
      data: {
        workTitle: input.workTitle,
        category: input.category,
        torTopicId: input.torTopicId,
        description: input.description,
        relatedUnit: input.relatedUnit ?? null,
        location: input.location ?? null,
        startAt,
        endAt,
        totalHours: totalHours === null || totalHours === undefined ? null : new Prisma.Decimal(totalHours),
        result: input.result,
        runningNumber,
        userId,
        torDocumentId: topic.torDocumentId,
        status: "CONFIRMED",
        confirmedAt: new Date(),
      },
    });
    const snapshot = JSON.parse(JSON.stringify(record)) as Prisma.InputJsonValue;
    await tx.jaRecordVersion.create({
      data: {
        jaRecordId: record.id,
        version: 1,
        snapshotJson: snapshot,
        changedBy: userId,
        changeReason: scheduleSkipped ? "ยืนยันรายการ (ไม่ระบุวันเวลา)" : "ยืนยันรายการ",
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "JA_CONFIRMED",
        objectType: "JaRecord",
        objectId: record.id,
        afterJson: snapshot,
      },
    });
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
