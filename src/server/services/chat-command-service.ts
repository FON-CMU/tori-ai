import "server-only";

import { isDataQueryIntent } from "@/lib/chat/data-query-intent";
import { prisma } from "@/lib/prisma";
import {
  categoryLabel,
  listJaReportDocuments,
  loadJaReportDocument,
} from "@/server/services/ja-report-service";

export type ChatCommandAction =
  | { type: "navigate"; href: string }
  | { type: "delete_conversation" }
  | { type: "new_chat" }
  | { type: "download_report"; torDocumentId: string; format: "pdf" | "docx" };

export type ChatCommandResult = {
  handled: true;
  reply: string;
  actions?: ChatCommandAction[];
};

export { isDataQueryIntent };

function normalize(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[?？!！。.\s]+$/g, "")
    .replace(/\s+/g, " ");
}

function helpText() {
  return [
    "ฉันเป็นเลขา TORI สั่งงานหรือถามข้อมูลจากที่บันทึกได้ เช่น",
    "",
    "• ช่วยเหลือ / คำสั่ง — แสดงรายการนี้",
    "• ใช้ TOR ปี 2569 — เลือกปีเอกสาร TOR สำหรับบันทึก JA",
    "• เปลี่ยนหมวดไปงานประจำ / งานที่ได้รับมอบหมาย / งานเชิงพัฒนา",
    "• เปลี่ยนหัวข้อ / เลือกหัวข้อ — ให้เลือกหัวข้อ TOR ใหม่จากรายการ",
    "• ตอนนี้มี JA กี่เรื่อง / มีหัวข้อรายงานกี่เรื่อง — ดึงตัวเลขจากที่บันทึก",
    "• ดู TOR / หัวข้อ TOR — สรุปหัวข้อ TOR ที่ใช้งาน",
    "• ดูรายงาน / สรุป JA — สรุปผลการปฏิบัติงานจริงทั้งฉบับ",
    "• ส่งออก PDF / ส่งออก Word — ส่งออกรายงานทั้งฉบับ",
    "• ไปหน้า TOR / ไปหน้ารายงาน / ไปตั้งค่า — เปิดหน้าในระบบ",
    "• สถานะระบบ — ดูจำนวน TOR, JA, แชท",
    "• ลบแชทนี้ — ลบการสนทนาปัจจุบัน",
    "• แชทใหม่ — เริ่มการสนทนาใหม่",
    "",
    "หรือเล่างานตามปกติ เพื่อบันทึก JA ในช่องผลการปฏิบัติงานจริง",
  ].join("\n");
}

async function summarizeTor(userId: string) {
  const topics = await prisma.torTopic.findMany({
    where: {
      userId,
      status: "CONFIRMED",
      matchable: true,
      kind: "TOPIC",
      torDocument: { status: "ACTIVE" },
    },
    orderBy: [{ sortOrder: "asc" }, { category: "asc" }],
    select: {
      title: true,
      code: true,
      category: true,
      hoursPerWeek: true,
      sectionLabel: true,
      torDocument: { select: { fileName: true, year: true } },
    },
    take: 40,
  });
  if (!topics.length) {
    return "ยังไม่มีหัวข้อ TOR ที่พร้อมใช้งาน กรุณาไปอัปโหลดที่ตั้งค่า → TOR หรือพิมพ์ “ไปหน้า TOR”";
  }

  const byDoc = new Map<string, typeof topics>();
  for (const topic of topics) {
    const key = `${topic.torDocument.year}:${topic.torDocument.fileName}`;
    const list = byDoc.get(key) ?? [];
    list.push(topic);
    byDoc.set(key, list);
  }

  const lines = ["หัวข้อ TOR ที่ใช้จับคู่ JA ตอนนี้:"];
  for (const [doc, rows] of byDoc) {
    lines.push("", `เอกสาร ${doc}`);
    for (const row of rows.slice(0, 15)) {
      const code = row.code ? `${row.code} ` : "";
      const hours = row.hoursPerWeek ? ` (${row.hoursPerWeek.toString()} ชม./สัปดาห์)` : "";
      lines.push(`• [${categoryLabel[row.category]}] ${code}${row.title}${hours}`);
    }
    if (rows.length > 15) lines.push(`• …อีก ${rows.length - 15} หัวข้อ`);
  }
  lines.push("", "พิมพ์ “ไปหน้า TOR” หากต้องการจัดการเอกสาร");
  return lines.join("\n");
}

async function summarizeReport(userId: string) {
  const docs = await listJaReportDocuments(userId);
  if (!docs.length) {
    return "ยังไม่มีเอกสาร TOR สำหรับรายงาน พิมพ์ “ไปหน้า TOR” เพื่ออัปโหลด";
  }

  const lines = ["สรุปรายงานผลการปฏิบัติงานจริงทั้งฉบับ:"];
  for (const doc of docs.slice(0, 5)) {
    const report = await loadJaReportDocument(userId, doc.id);
    const jaCount =
      report.sections.reduce(
        (sum, section) => sum + section.topics.reduce((inner, topic) => inner + topic.jas.length, 0),
        0,
      ) + report.orphanJas.length;
    lines.push(
      "",
      `• ${report.fileName} (พ.ศ. ${report.year}) — ${report.sections.length} หมวด, ${jaCount} รายการ JA`,
    );
    for (const section of report.sections) {
      const filled = section.topics.filter((topic) => topic.jas.length > 0).length;
      lines.push(`  - ${section.label}: มี JA แล้ว ${filled}/${section.topics.length} หัวข้อ`);
    }
  }
  lines.push(
    "",
    "พิมพ์ “ไปหน้ารายงาน” เพื่อดูฟอร์มเต็ม หรือ “ส่งออก PDF” / “ส่งออก Word” เพื่อดาวน์โหลดทั้งฉบับ",
  );
  return lines.join("\n");
}

async function answerSavedCounts(userId: string) {
  const [jaCount, recentJas, topicCount, docs] = await Promise.all([
    prisma.jaRecord.count({ where: { userId, status: "CONFIRMED" } }),
    prisma.jaRecord.findMany({
      where: { userId, status: "CONFIRMED" },
      orderBy: { startAt: "desc" },
      take: 5,
      select: {
        workTitle: true,
        runningNumber: true,
        startAt: true,
        torTopic: { select: { title: true } },
      },
    }),
    prisma.torTopic.count({
      where: {
        userId,
        status: "CONFIRMED",
        matchable: true,
        kind: "TOPIC",
        torDocument: { status: "ACTIVE" },
      },
    }),
    listJaReportDocuments(userId),
  ]);

  let topicsWithJa = 0;
  let topicsTotal = 0;
  for (const doc of docs.slice(0, 5)) {
    const report = await loadJaReportDocument(userId, doc.id);
    for (const section of report.sections) {
      topicsTotal += section.topics.length;
      topicsWithJa += section.topics.filter((topic) => topic.jas.length > 0).length;
    }
  }

  const lines = [
    "ดึงจากข้อมูลที่บันทึกในระบบแล้ว:",
    `• รายการ JA ที่ยืนยันแล้ว: ${jaCount} เรื่อง`,
    `• หัวข้อ TOR ที่ใช้จับคู่ได้: ${topicCount} หัวข้อ`,
    `• หัวข้อในรายงานที่มี JA แล้ว: ${topicsWithJa}/${topicsTotal || topicCount} หัวข้อ`,
  ];

  if (recentJas.length) {
    lines.push("", "รายการล่าสุด:");
    for (const ja of recentJas) {
      const date = ja.startAt
        ? ja.startAt.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })
        : "ไม่ระบุวัน";
      const topic = ja.torTopic?.title ? ` · TOR: ${ja.torTopic.title}` : "";
      lines.push(`• ${ja.runningNumber} ${ja.workTitle} (${date})${topic}`);
    }
  } else {
    lines.push("", "ยังไม่มีรายการ JA ที่ยืนยัน — เล่างานในแชทแล้วกดยืนยันเพื่อบันทึก");
  }

  lines.push("", "พิมพ์ “ไปหน้ารายงาน” เพื่อดูฟอร์มทั้งฉบับ หรือ “ดูรายงาน” เพื่อสรุปรายละเอียด");
  return lines.join("\n");
}

async function systemStatus(userId: string) {
  const [torActive, torTopics, jaCount, chatCount] = await Promise.all([
    prisma.torDocument.count({ where: { userId, status: "ACTIVE" } }),
    prisma.torTopic.count({
      where: { userId, status: "CONFIRMED", matchable: true, kind: "TOPIC", torDocument: { status: "ACTIVE" } },
    }),
    prisma.jaRecord.count({ where: { userId, status: "CONFIRMED" } }),
    prisma.conversation.count({ where: { userId, status: { not: "ARCHIVED" } } }),
  ]);
  return [
    "สถานะระบบของคุณตอนนี้:",
    `• เอกสาร TOR ที่ใช้งาน: ${torActive}`,
    `• หัวข้อ TOR สำหรับจับคู่ JA: ${torTopics}`,
    `• รายการ JA ที่ยืนยันแล้ว: ${jaCount}`,
    `• แชทที่ยังไม่ลบ: ${chatCount}`,
  ].join("\n");
}

async function resolveExportTarget(userId: string) {
  const docs = await listJaReportDocuments(userId);
  const active = docs.find((doc) => doc.status === "ACTIVE") ?? docs[0];
  return active ?? null;
}

/** ตรวจจับคำสั่งข้อความสำหรับดูข้อมูล/สั่งงานในระบบ */
export async function tryHandleChatCommand(
  userId: string,
  message: string,
  conversationId: string | null,
): Promise<ChatCommandResult | null> {
  const text = normalize(message);
  if (!text) return null;

  if (/^(help|ช่วยเหลือ|คำสั่ง|มีคำสั่งอะไร|เลขาช่วยอะไรได้บ้าง)$/i.test(text)) {
    return { handled: true, reply: helpText() };
  }

  if (/^(สถานะ|สถานะระบบ|ดูสถานะ|system status)$/i.test(text)) {
    return { handled: true, reply: await systemStatus(userId) };
  }

  // คำถามจำนวน/สรุปจากข้อมูลที่บันทึก — ต้องมาก่อน AI บันทึก JA
  if (isDataQueryIntent(message)) {
    return { handled: true, reply: await answerSavedCounts(userId) };
  }

  if (
    /^(ดู\s*tor|แสดง\s*tor|หัวข้อ\s*tor|list\s*tor|tor\s*ของฉัน)$/i.test(text)
    || /^(ดู|แสดง)\s*หัวข้อ(\s*tor)?$/i.test(text)
  ) {
    return { handled: true, reply: await summarizeTor(userId) };
  }

  if (
    /^(ดูรายงาน|รายงาน|สรุปรายงาน|สรุป\s*ja|ดู\s*ja|รายงาน\s*ja)$/i.test(text)
    || /^แสดงรายงาน/.test(text)
  ) {
    return { handled: true, reply: await summarizeReport(userId) };
  }

  if (/^(ไปหน้า\s*tor|ไปที่\s*tor|เปิด\s*tor|ตั้งค่า\s*tor)$/i.test(text)) {
    return {
      handled: true,
      reply: "เปิดหน้าตั้งค่า TOR ให้แล้ว หากยังไม่ขึ้น ให้ไปที่เมนูตั้งค่า → TOR",
      actions: [{ type: "navigate", href: "/settings/tor" }],
    };
  }

  if (/^(ไปหน้ารายงาน|ไปที่รายงาน|เปิดรายงาน|ไปหน้า\s*ja|ตั้งค่า\s*ja)$/i.test(text)) {
    return {
      handled: true,
      reply: "เปิดหน้ารายงานผลการปฏิบัติงานจริงให้แล้ว",
      actions: [{ type: "navigate", href: "/settings/ja" }],
    };
  }

  if (/^(ไปตั้งค่า|เปิดตั้งค่า|settings)$/i.test(text)) {
    return {
      handled: true,
      reply: "เปิดหน้าตั้งค่าให้แล้ว",
      actions: [{ type: "navigate", href: "/settings" }],
    };
  }

  if (/^(แชทใหม่|เริ่มใหม่|new chat)$/i.test(text)) {
    return {
      handled: true,
      reply: "เริ่มแชทใหม่ให้แล้ว พิมพ์งานที่ต้องการบันทึกได้เลย",
      actions: [{ type: "new_chat" }],
    };
  }

  if (/^(ลบแชท(นี้)?|ลบการสนทนา(นี้)?|delete chat)$/i.test(text)) {
    if (!conversationId) {
      return { handled: true, reply: "ยังไม่มีแชทให้ลบ — นี่คือแชทว่างอยู่แล้ว" };
    }
    return {
      handled: true,
      reply: "ลบแชทนี้ให้แล้ว หากต้องการเริ่มใหม่ พิมพ์งานได้เลย หรือพิมพ์ “แชทใหม่”",
      actions: [{ type: "delete_conversation" }],
    };
  }

  const exportPdf = /^(ส่งออก\s*pdf|export\s*pdf|ดาวน์โหลด\s*pdf)$/i.test(text);
  const exportDocx = /^(ส่งออก\s*word|ส่งออก\s*docx|export\s*word|export\s*docx|ดาวน์โหลด\s*word)$/i.test(text);
  const exportAny = /^(ส่งออก(รายงาน)?|export( report)?)$/i.test(text);
  if (exportPdf || exportDocx || exportAny) {
    const target = await resolveExportTarget(userId);
    if (!target) {
      return { handled: true, reply: "ยังไม่มีเอกสาร TOR ให้ส่งออก พิมพ์ “ไปหน้า TOR” เพื่ออัปโหลดก่อน" };
    }
    const format = exportDocx ? "docx" : "pdf";
    return {
      handled: true,
      reply: `กำลังส่งออกรายงานทั้งฉบับเป็น ${format.toUpperCase()} ของไฟล์ ${target.fileName} (พ.ศ. ${target.year})`,
      actions: [{ type: "download_report", torDocumentId: target.id, format }],
    };
  }

  return null;
}
