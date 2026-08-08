import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import PDFDocument from "pdfkit";

import { ApiError } from "@/lib/http/api-error";
import { prisma } from "@/lib/prisma";

const categoryLabel = {
  ROUTINE: "งานประจำ",
  ASSIGNED: "งานที่ได้รับมอบหมาย",
  DEVELOPMENT: "งานเชิงพัฒนา",
} as const;

type JaExportRecord = {
  id: string;
  runningNumber: string;
  workTitle: string;
  category: keyof typeof categoryLabel;
  description: string;
  relatedUnit: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
  totalHours: { toString(): string };
  result: string;
  confirmedAt: Date | null;
  user: {
    title: string | null;
    firstName: string;
    lastName: string;
    employeeId: string;
    position: string | null;
    unit: { name: string };
  };
  torTopic: { title: string; code: string | null } | null;
  torDocument: { fileName: string; year: number } | null;
};

function fontPath(file: string) {
  return path.join(process.cwd(), "assets", "fonts", file);
}

function formatDate(value: Date) {
  return value.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "long" });
}

function formatTime(value: Date) {
  return value.toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function personName(user: JaExportRecord["user"]) {
  return [user.title, user.firstName, user.lastName].filter(Boolean).join("");
}

async function loadJaForExport(userId: string, jaId: string): Promise<JaExportRecord> {
  const record = await prisma.jaRecord.findFirst({
    where: { id: jaId, userId, status: "CONFIRMED" },
    include: {
      user: { include: { unit: true } },
      torTopic: { select: { title: true, code: true } },
      torDocument: { select: { fileName: true, year: true } },
    },
  });
  if (!record) throw new ApiError(404, "JA_NOT_FOUND", "ไม่พบรายการงาน");
  return record;
}

function formRows(record: JaExportRecord) {
  return [
    ["เลขที่รายการ", record.runningNumber],
    ["ปี TOR (พ.ศ.)", record.torDocument ? String(record.torDocument.year) : "-"],
    ["เอกสาร TOR อ้างอิง", record.torDocument?.fileName ?? "-"],
    ["ชื่อ-นามสกุล", personName(record.user)],
    ["รหัสพนักงาน", record.user.employeeId],
    ["ตำแหน่ง", record.user.position ?? "-"],
    ["หน่วยงาน", record.user.unit.name],
    ["หมวดงาน", categoryLabel[record.category]],
    ["หัวข้อตาม TOR", record.torTopic?.title ?? "-"],
    ["รหัสหัวข้อ TOR", record.torTopic?.code ?? "-"],
    ["ชื่องาน / เรื่อง", record.workTitle],
    ["รายละเอียดการปฏิบัติงาน", record.description],
    ["ผลลัพธ์", record.result],
    ["สถานที่", record.location ?? "-"],
    ["หน่วยงานที่เกี่ยวข้อง", record.relatedUnit ?? "-"],
    ["วันที่ปฏิบัติงาน", formatDate(record.startAt)],
    ["เวลา", `${formatTime(record.startAt)} - ${formatTime(record.endAt)} น.`],
    ["จำนวนชั่วโมง", `${record.totalHours.toString()} ชั่วโมง`],
    ["วันที่ยืนยัน", record.confirmedAt ? formatDate(record.confirmedAt) : "-"],
  ] as const;
}

export async function exportJaDocx(userId: string, jaId: string) {
  const record = await loadJaForExport(userId, jaId);
  const rows = formRows(record);
  const fontBuffer = readFileSync(fontPath("NotoSansThai-Regular.ttf"));
  const boldBuffer = readFileSync(fontPath("NotoSansThai-Bold.ttf"));
  const fontName = "NotoSansThai";
  const boldName = "NotoSansThaiBold";

  const border = {
    top: { style: BorderStyle.SINGLE, size: 8, color: "1C1917" },
    bottom: { style: BorderStyle.SINGLE, size: 8, color: "1C1917" },
    left: { style: BorderStyle.SINGLE, size: 8, color: "1C1917" },
    right: { style: BorderStyle.SINGLE, size: 8, color: "1C1917" },
  };

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          children: [
            new TableCell({
              borders: border,
              width: { size: 34, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: label, bold: true, font: boldName, size: 28 })],
                }),
              ],
            }),
            new TableCell({
              borders: border,
              width: { size: 66, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: value, font: fontName, size: 28 })],
                }),
              ],
            }),
          ],
        }),
    ),
  });

  const doc = new Document({
    fonts: [
      { name: fontName, data: fontBuffer },
      { name: boldName, data: boldBuffer },
    ],
    sections: [
      {
        properties: {
          page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [
              new TextRun({ text: "แบบบันทึกรายการปฏิบัติงาน (JA)", bold: true, font: boldName, size: 36 }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [
              new TextRun({ text: "อ้างอิงตาม TOR ของผู้ปฏิบัติงาน", font: fontName, size: 28 }),
            ],
          }),
          table,
          new Paragraph({ spacing: { before: 400 }, children: [] }),
          new Paragraph({
            children: [
              new TextRun({
                text: "ข้าพเจ้าขอรับรองว่าข้อมูลข้างต้นเป็นความจริง",
                font: fontName,
                size: 28,
              }),
            ],
          }),
          new Paragraph({ spacing: { before: 600 }, children: [] }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: "ลงชื่อ ............................................ ผู้ปฏิบัติงาน",
                font: fontName,
                size: 28,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `(${personName(record.user)})`, font: fontName, size: 28 }),
            ],
          }),
        ],
      },
    ],
  });

  return {
    buffer: Buffer.from(await Packer.toBuffer(doc)),
    fileName: `${record.runningNumber}.docx`,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}

export async function exportJaPdf(userId: string, jaId: string) {
  const record = await loadJaForExport(userId, jaId);
  const rows = formRows(record);

  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    info: { Title: `JA ${record.runningNumber}`, Author: "TORI" },
  });
  doc.registerFont("Thai", fontPath("NotoSansThai-Regular.ttf"));
  doc.registerFont("Thai-Bold", fontPath("NotoSansThai-Bold.ttf"));

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.font("Thai-Bold").fontSize(16).text("แบบบันทึกรายการปฏิบัติงาน (JA)", { align: "center" });
  doc.moveDown(0.3);
  doc.font("Thai").fontSize(11).text("อ้างอิงตาม TOR ของผู้ปฏิบัติงาน", { align: "center" });
  doc.moveDown(1);

  const labelWidth = 160;
  const valueWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right - labelWidth;
  const startX = doc.page.margins.left;

  for (const [label, value] of rows) {
    const labelHeight = doc.heightOfString(label, { width: labelWidth - 12 });
    const valueHeight = doc.heightOfString(value, { width: valueWidth - 12 });
    const rowHeight = Math.max(labelHeight, valueHeight, 18) + 14;

    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }

    const top = doc.y;
    doc.rect(startX, top, labelWidth + valueWidth, rowHeight).stroke("#1c1917");
    doc.moveTo(startX + labelWidth, top).lineTo(startX + labelWidth, top + rowHeight).stroke("#1c1917");

    doc.font("Thai-Bold").fontSize(10).text(label, startX + 6, top + 6, {
      width: labelWidth - 12,
      lineGap: 2,
    });
    doc.font("Thai").fontSize(10).text(value, startX + labelWidth + 6, top + 6, {
      width: valueWidth - 12,
      lineGap: 2,
    });
    doc.y = top + rowHeight;
  }

  doc.moveDown(2);
  doc.font("Thai").fontSize(11).text("ข้าพเจ้าขอรับรองว่าข้อมูลข้างต้นเป็นความจริง");
  doc.moveDown(2.5);
  doc.text("ลงชื่อ ............................................ ผู้ปฏิบัติงาน", { align: "right" });
  doc.text(`(${personName(record.user)})`, { align: "right" });
  doc.end();

  return {
    buffer: await done,
    fileName: `${record.runningNumber}.pdf`,
    contentType: "application/pdf",
  };
}
