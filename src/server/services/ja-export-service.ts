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
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  VerticalAlign,
} from "docx";
import PDFDocument from "pdfkit";

import { ApiError } from "@/lib/http/api-error";
import { prisma } from "@/lib/prisma";
import {
  formatJaCell,
  formatTorBlock,
  loadJaReportDocument,
  reportPersonName,
  type JaReportDocument,
  type JaReportEntry,
  type JaReportTopicRow,
} from "@/server/services/ja-report-service";

function fontPath(file: string) {
  return path.join(process.cwd(), "assets", "fonts", file);
}

const border = {
  top: { style: BorderStyle.SINGLE, size: 8, color: "1C1917" },
  bottom: { style: BorderStyle.SINGLE, size: 8, color: "1C1917" },
  left: { style: BorderStyle.SINGLE, size: 8, color: "1C1917" },
  right: { style: BorderStyle.SINGLE, size: 8, color: "1C1917" },
};

function cell(text: string, width: number, opts?: { bold?: boolean; center?: boolean }) {
  const font = opts?.bold ? "THSarabunNewBold" : "THSarabunNew";
  const lines = (text || " ").split("\n");
  return new TableCell({
    borders: border,
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
    children: lines.map(
      (line) =>
        new Paragraph({
          alignment: opts?.center ? AlignmentType.CENTER : AlignmentType.LEFT,
          spacing: { after: 40 },
          children: [new TextRun({ text: line || " ", bold: opts?.bold, font, size: 32 })],
        }),
    ),
  });
}

/** แบ่งครึ่งสมดุล: ซ้าย TOR+ชม. = ขวา JA+ชม. */
const COL = {
  tor: 3400,
  torHours: 700,
  ja: 3400,
  jaHours: 700,
} as const;
const TABLE_WIDTH = COL.tor + COL.torHours + COL.ja + COL.jaHours;

function headerRow() {
  return new TableRow({
    children: [
      cell("ภาระงาน/ลักษณะงานที่ปฏิบัติ", COL.tor, { bold: true, center: true }),
      cell("ชม./สัปดาห์", COL.torHours, { bold: true, center: true }),
      cell("ผลการปฏิบัติงานจริง\nภาระงานที่ได้ปฏิบัติ", COL.ja, { bold: true, center: true }),
      cell("ชม./สัปดาห์", COL.jaHours, { bold: true, center: true }),
    ],
  });
}

function topicRows(topic: JaReportTopicRow) {
  const torText = formatTorBlock(topic);
  const torHours = topic.hoursPerWeek ?? "";
  if (!topic.jas.length) {
    return [
      new TableRow({
        children: [
          cell(torText, COL.tor),
          cell(torHours, COL.torHours, { center: true }),
          cell("—", COL.ja, { center: true }),
          cell("0", COL.jaHours, { center: true }),
        ],
      }),
    ];
  }
  return topic.jas.map(
    (ja, index) =>
      new TableRow({
        children: [
          cell(index === 0 ? torText : "", COL.tor),
          cell(index === 0 ? torHours : "", COL.torHours, { center: true }),
          cell(formatJaCell(ja), COL.ja),
          cell(ja.hoursPerWeek, COL.jaHours, { center: true }),
        ],
      }),
  );
}

function orphanRows(jas: JaReportEntry[]) {
  return jas.map(
    (ja) =>
      new TableRow({
        children: [
          cell("(ยังไม่ผูกหัวข้อ TOR)", COL.tor),
          cell("", COL.torHours, { center: true }),
          cell(formatJaCell(ja), COL.ja),
          cell(ja.hoursPerWeek, COL.jaHours, { center: true }),
        ],
      }),
  );
}

function formTable(rows: TableRow[]) {
  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [COL.tor, COL.torHours, COL.ja, COL.jaHours],
    layout: TableLayoutType.FIXED,
    rows,
  });
}

function buildDocxSections(report: JaReportDocument) {
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: "แบบบันทึกผลการปฏิบัติงานจริง (JA) ทั้งฉบับตาม TOR",
          bold: true,
          font: "THSarabunNewBold",
          size: 40,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `${report.fileName} · พ.ศ. ${report.year}`,
          font: "THSarabunNew",
          size: 28,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: `ชื่อ-นามสกุล: ${reportPersonName(report)}`,
          font: "THSarabunNew",
          size: 32,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: `รหัสพนักงาน: ${report.user.employeeId} · ตำแหน่ง: ${report.user.position ?? "-"}`,
          font: "THSarabunNew",
          size: 32,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `หน่วยงาน: ${report.user.unitName}`,
          font: "THSarabunNew",
          size: 32,
        }),
      ],
    }),
  ];

  for (const section of report.sections) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [
          new TextRun({
            text: `${section.label}${section.title && section.title !== section.label ? ` — ${section.title}` : ""}`,
            bold: true,
            font: "THSarabunNewBold",
            size: 34,
          }),
        ],
      }),
    );
    children.push(formTable([headerRow(), ...section.topics.flatMap(topicRows)]));
  }

  if (report.orphanJas.length) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [
          new TextRun({
            text: "รายการที่ยังไม่ผูกหัวข้อ TOR",
            bold: true,
            font: "THSarabunNewBold",
            size: 34,
          }),
        ],
      }),
    );
    children.push(formTable([headerRow(), ...orphanRows(report.orphanJas)]));
  }

  children.push(
    new Paragraph({ spacing: { before: 360 }, children: [] }),
    new Paragraph({
      children: [
        new TextRun({
          text: "ข้าพเจ้าขอรับรองว่าข้อมูลข้างต้นเป็นความจริง",
          font: "THSarabunNew",
          size: 32,
        }),
      ],
    }),
    new Paragraph({ spacing: { before: 480 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text: "ลงชื่อ ............................................ ผู้ปฏิบัติงาน",
          font: "THSarabunNew",
          size: 32,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({ text: `(${reportPersonName(report)})`, font: "THSarabunNew", size: 32 }),
      ],
    }),
  );

  return children;
}

export async function resolveTorDocumentIdForJa(userId: string, jaId: string) {
  const record = await prisma.jaRecord.findFirst({
    where: { id: jaId, userId, status: "CONFIRMED" },
    select: { torDocumentId: true },
  });
  if (!record?.torDocumentId) {
    throw new ApiError(404, "JA_NOT_FOUND", "ไม่พบรายการงานหรือยังไม่มีเอกสาร TOR ที่ผูกไว้");
  }
  return record.torDocumentId;
}

export async function exportTorJaDocx(userId: string, torDocumentId: string) {
  const report = await loadJaReportDocument(userId, torDocumentId);
  const fontBuffer = readFileSync(fontPath("THSarabunNew.ttf"));
  const boldBuffer = readFileSync(fontPath("THSarabunNew-Bold.ttf"));

  const doc = new Document({
    fonts: [
      { name: "THSarabunNew", data: fontBuffer },
      { name: "THSarabunNewBold", data: boldBuffer },
    ],
    sections: [
      {
        properties: {
          page: {
            margin: { top: 560, bottom: 560, left: 560, right: 560 },
          },
        },
        children: buildDocxSections(report),
      },
    ],
  });

  return {
    buffer: Buffer.from(await Packer.toBuffer(doc)),
    fileName: `JA-TOR-${report.year}-v${report.id.slice(0, 8)}.docx`,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}

export async function exportTorJaPdf(userId: string, torDocumentId: string) {
  const report = await loadJaReportDocument(userId, torDocumentId);
  const doc = new PDFDocument({
    size: "A4",
    margin: 36,
    info: { Title: `JA TOR ${report.year}`, Author: "TORI" },
  });
  doc.registerFont("Thai", fontPath("THSarabunNew.ttf"));
  doc.registerFont("Thai-Bold", fontPath("THSarabunNew-Bold.ttf"));

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const cols = [
    { key: "tor", width: pageWidth * 0.4 },
    { key: "torH", width: pageWidth * 0.1 },
    { key: "ja", width: pageWidth * 0.4 },
    { key: "jaH", width: pageWidth * 0.1 },
  ] as const;

  function ensureSpace(height: number) {
    if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
  }

  function resetTextCursor(y = doc.y) {
    doc.x = doc.page.margins.left;
    doc.y = y;
  }

  function measureCellHeight(value: string, colIndex: number, boldHeader: boolean) {
    doc.font(boldHeader ? "Thai-Bold" : "Thai").fontSize(boldHeader ? 12 : 11);
    return doc.heightOfString(value || " ", {
      width: cols[colIndex].width - 10,
      lineGap: 1.5,
    });
  }

  function paintRow(
    values: [string, string, string, string],
    rowHeight: number,
    boldHeader: boolean,
  ) {
    ensureSpace(rowHeight);
    const top = doc.y;
    let x = doc.page.margins.left;
    doc.save();
    doc.rect(x, top, pageWidth, rowHeight).stroke("#1c1917");
    for (let i = 0; i < cols.length; i += 1) {
      const col = cols[i];
      if (i > 0) doc.moveTo(x, top).lineTo(x, top + rowHeight).stroke("#1c1917");
      doc
        .font(boldHeader ? "Thai-Bold" : "Thai")
        .fontSize(boldHeader ? 12 : 11)
        .fillColor("#1c1917")
        .text(values[i] || " ", x + 5, top + 5, {
          width: col.width - 10,
          height: rowHeight - 10,
          lineGap: 1.5,
          align: i === 1 || i === 3 ? "center" : "left",
        });
      x += col.width;
    }
    doc.restore();
    resetTextCursor(top + rowHeight);
  }

  /** ตัดข้อความตามความสูงที่เหลือของหน้า — กันแถวยาวถูกตัดหาย */
  function splitTextToHeight(text: string, colIndex: number, maxHeight: number, boldHeader: boolean) {
    const lines = (text || " ").split("\n");
    let kept = "";
    let rest = "";
    for (let i = 0; i < lines.length; i += 1) {
      const candidate = kept ? `${kept}\n${lines[i]}` : lines[i];
      if (measureCellHeight(candidate, colIndex, boldHeader) + 12 <= maxHeight) {
        kept = candidate;
      } else {
        rest = lines.slice(i).join("\n");
        break;
      }
    }
    if (!kept && lines.length) {
      // บรรทัดเดียวสูงเกิน — บังคับใส่บรรทัดแรกแล้วส่งต่อที่เหลือ
      kept = lines[0];
      rest = lines.slice(1).join("\n");
    }
    return { kept: kept || " ", rest };
  }

  function drawRow(values: [string, string, string, string], boldHeader = false) {
    const usablePageHeight =
      doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
    let remaining: [string, string, string, string] = [...values];
    let firstChunk = true;
    let guard = 0;

    while (guard < 40) {
      guard += 1;
      const available = Math.max(
        40,
        doc.page.height - doc.page.margins.bottom - doc.y,
      );
      const heights = remaining.map((value, index) =>
        measureCellHeight(value, index, boldHeader),
      );
      const naturalHeight = Math.max(...heights, 18) + 12;

      if (naturalHeight <= available) {
        paintRow(remaining, naturalHeight, boldHeader);
        return;
      }

      if (available < 60) {
        doc.addPage();
        continue;
      }

      const tallest = heights.indexOf(Math.max(...heights));
      const { kept, rest } = splitTextToHeight(
        remaining[tallest],
        tallest,
        available - 12,
        boldHeader,
      );
      const chunk: [string, string, string, string] = [...remaining];
      chunk[tallest] = kept;
      if (!firstChunk) {
        if (tallest !== 1) chunk[1] = "";
        if (tallest !== 3) chunk[3] = "";
      }
      const chunkHeight = Math.max(
        ...chunk.map((value, index) => measureCellHeight(value, index, boldHeader)),
        18,
      ) + 12;
      paintRow(chunk, Math.min(chunkHeight, available, usablePageHeight), boldHeader);

      if (!rest.trim()) return;
      remaining = ["", "", "", ""];
      remaining[tallest] = rest;
      firstChunk = false;
      if (doc.y + 40 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
      }
    }
  }

  doc.font("Thai-Bold").fontSize(18).text("แบบบันทึกผลการปฏิบัติงานจริง (JA) ทั้งฉบับตาม TOR", {
    align: "center",
  });
  doc.moveDown(0.3);
  doc.font("Thai").fontSize(14).text(`${report.fileName} · พ.ศ. ${report.year}`, { align: "center" });
  doc.moveDown(0.6);
  doc.fontSize(14).text(`ชื่อ-นามสกุล: ${reportPersonName(report)}`);
  doc.text(`รหัสพนักงาน: ${report.user.employeeId} · ตำแหน่ง: ${report.user.position ?? "-"}`);
  doc.text(`หน่วยงาน: ${report.user.unitName}`);
  doc.moveDown(0.6);

  for (const section of report.sections) {
    ensureSpace(40);
    doc
      .font("Thai-Bold")
      .fontSize(15)
      .text(
        `${section.label}${section.title && section.title !== section.label ? ` — ${section.title}` : ""}`,
      );
    doc.moveDown(0.3);
    drawRow(
      ["ภาระงาน/ลักษณะงานที่ปฏิบัติ", "ชม./สัปดาห์", "ผลการปฏิบัติงานจริง", "ชม./สัปดาห์"],
      true,
    );
    for (const topic of section.topics) {
      const torText = formatTorBlock(topic);
      const torHours = topic.hoursPerWeek ?? "";
      if (!topic.jas.length) {
        drawRow([torText, torHours, "—", "0"]);
        continue;
      }
      topic.jas.forEach((ja, index) => {
        drawRow([
          index === 0 ? torText : "",
          index === 0 ? torHours : "",
          formatJaCell(ja),
          ja.hoursPerWeek,
        ]);
      });
    }
    doc.moveDown(0.5);
    resetTextCursor();
  }

  if (report.orphanJas.length) {
    resetTextCursor();
    doc.font("Thai-Bold").fontSize(15).text("รายการที่ยังไม่ผูกหัวข้อ TOR", {
      width: pageWidth,
    });
    doc.moveDown(0.3);
    drawRow(
      ["ภาระงาน/ลักษณะงานที่ปฏิบัติ", "ชม./สัปดาห์", "ผลการปฏิบัติงานจริง", "ชม./สัปดาห์"],
      true,
    );
    for (const ja of report.orphanJas) {
      drawRow(["(ยังไม่ผูกหัวข้อ TOR)", "", formatJaCell(ja), ja.hoursPerWeek]);
    }
  }

  resetTextCursor();
  doc.moveDown(1.5);
  doc.font("Thai").fontSize(14).text("ข้าพเจ้าขอรับรองว่าข้อมูลข้างต้นเป็นความจริง", {
    width: pageWidth,
  });
  doc.moveDown(2);
  doc.fontSize(14).text("ลงชื่อ ............................................ ผู้ปฏิบัติงาน", {
    align: "right",
    width: pageWidth,
  });
  doc.text(`(${reportPersonName(report)})`, { align: "right", width: pageWidth });
  doc.end();

  return {
    buffer: await done,
    fileName: `JA-TOR-${report.year}-v${report.id.slice(0, 8)}.pdf`,
    contentType: "application/pdf",
  };
}

/** เดิมส่งออกทีละ JA — เปลี่ยนให้ส่งออกทั้งฉบับของเอกสาร TOR ที่ผูกไว้ */
export async function exportJaDocx(userId: string, jaId: string) {
  return exportTorJaDocx(userId, await resolveTorDocumentIdForJa(userId, jaId));
}

export async function exportJaPdf(userId: string, jaId: string) {
  return exportTorJaPdf(userId, await resolveTorDocumentIdForJa(userId, jaId));
}
