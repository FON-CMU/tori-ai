/**
 * สร้างคู่มือใช้งานภาษาไทย (manual.pdf) ~10 หน้า
 * รัน: npx tsx scripts/generate-manual-pdf.ts
 */
import { createWriteStream } from "node:fs";
import path from "node:path";

import PDFDocument from "pdfkit";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "manual.pdf");
const fontRegular = path.join(ROOT, "assets/fonts/THSarabunNew.ttf");
const fontBold = path.join(ROOT, "assets/fonts/THSarabunNew-Bold.ttf");

type Doc = PDFKit.PDFDocument;

function screenFrame(doc: Doc, title: string, y: number, height = 220) {
  const x = 48;
  const width = doc.page.width - 96;
  doc.save();
  doc.roundedRect(x, y, width, height, 10).fillAndStroke("#fafaf9", "#d6d3d1");
  doc.roundedRect(x, y, width, 28, 10).fill("#0f766e");
  doc.rect(x, y + 18, width, 10).fill("#0f766e");
  doc.fillColor("#ffffff").font("Thai-Bold").fontSize(13).text(title, x + 12, y + 7, {
    width: width - 24,
  });
  doc.restore();
  return { x: x + 12, y: y + 40, width: width - 24, bottom: y + height - 12 };
}

function bullet(doc: Doc, lines: string[], startY: number) {
  let y = startY;
  doc.font("Thai").fontSize(14).fillColor("#292524");
  for (const line of lines) {
    doc.text(`• ${line}`, 52, y, { width: doc.page.width - 104, lineGap: 1 });
    y = doc.y + 4;
  }
  return y;
}

function heading(doc: Doc, text: string, y?: number) {
  doc.font("Thai-Bold").fontSize(20).fillColor("#0f766e");
  if (y !== undefined) doc.text(text, 52, y, { width: doc.page.width - 104 });
  else doc.text(text, { width: doc.page.width - 104 });
  doc.moveDown(0.3);
}

function body(doc: Doc, text: string) {
  doc.font("Thai").fontSize(14).fillColor("#44403c").text(text, {
    width: doc.page.width - 104,
    lineGap: 2,
    align: "left",
  });
  doc.moveDown(0.4);
}

function newPage(doc: Doc, pageNo: number, title: string) {
  doc.addPage();
  doc.font("Thai").fontSize(11).fillColor("#a8a29e").text(`TORI · คู่มือใช้งาน · หน้า ${pageNo}`, 48, 28, {
    width: doc.page.width - 96,
    align: "right",
  });
  heading(doc, title, 48);
}

async function main() {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 48, left: 52, right: 52 },
    info: {
      Title: "คู่มือการใช้งาน TORI",
      Author: "TORI",
      Subject: "คู่มือผู้ใช้ภาษาไทย",
    },
  });
  doc.registerFont("Thai", fontRegular);
  doc.registerFont("Thai-Bold", fontBold);
  const stream = createWriteStream(OUT);
  doc.pipe(stream);

  // --- หน้า 1: ปก ---
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#f5f5f4");
  doc.fillColor("#0f766e").font("Thai-Bold").fontSize(18).text("TORI", 52, 180, {
    width: doc.page.width - 104,
    align: "center",
  });
  doc.fillColor("#1c1917").font("Thai-Bold").fontSize(32).text("คู่มือการใช้งาน", 52, 210, {
    width: doc.page.width - 104,
    align: "center",
  });
  doc.font("Thai").fontSize(16).fillColor("#57534e").text(
    "ผู้ช่วยบันทึกผลการปฏิบัติงานจริง (JA)\nตามข้อกำหนดการปฏิบัติงาน (TOR)",
    52,
    270,
    { width: doc.page.width - 104, align: "center", lineGap: 4 },
  );
  doc.fontSize(13).text("เวอร์ชันสำหรับ Deploy บน Vercel + Neon + Vercel Blob", 52, 360, {
    width: doc.page.width - 104,
    align: "center",
  });
  doc.fontSize(12).fillColor("#a8a29e").text("ภาษาไทย · สำหรับบุคลากรและผู้ดูแลระบบ", 52, 720, {
    width: doc.page.width - 104,
    align: "center",
  });

  // --- หน้า 2: ภาพรวม ---
  newPage(doc, 2, "1. TORI คืออะไร");
  body(
    doc,
    "TORI เป็นเว็บแอปแบบแชทสำหรับบุคลากร ใช้บันทึกงานที่ทำจริง (JA) ให้สอดคล้องกับหัวข้อใน TOR ของตนเอง ระบบอ่านไฟล์ TOR (PDF/DOCX) แตกโครงหมวด → หัวข้อ → รายการย่อย แล้วให้คุยกับ AI เพื่อเก็บรายละเอียดงานจนพร้อมยืนยันและส่งออกแบบฟอร์ม Word/PDF",
  );
  heading(doc, "ขั้นตอนหลัก");
  bullet(doc, [
    "เข้าสู่ระบบ (Microsoft Entra / CMU / บัญชีสาธิตชั่วคราว)",
    "อัปโหลด TOR ที่ตั้งค่า → TOR แล้วให้ระบบประมวลผลและวิเคราะห์",
    "บันทึกงานผ่านแชท ตรวจร่าง แล้วยืนยันเป็น JA",
    "ดูรายงานที่ตั้งค่า → รายการงาน และส่งออก Word/PDF ทั้งฉบับ",
  ], doc.y);
  doc.moveDown(0.8);
  heading(doc, "สิ่งที่ควรรู้");
  bullet(doc, [
    "TOR และ JA ของแต่ละบัญชีแยกกัน (1 คน = 1 โปรไฟล์)",
    "อัปโหลด TOR ปีเดียวกันซ้ำจะแทนที่ฉบับเดิม และย้ายผลงานที่ผูกไว้มาฉบับใหม่",
    "ปุ่มเก็บถาวร TOR ไม่ลบผลงานที่ยืนยันแล้ว",
    "วิเคราะห์ TOR ซ้ำจะผูก JA เดิมกลับอัตโนมัติตามรหัส/ชื่อหัวข้อ",
  ], doc.y);

  // --- หน้า 3: เข้าสู่ระบบ ---
  newPage(doc, 3, "2. การเข้าสู่ระบบ");
  body(
    doc,
    "หน้าเข้าสู่ระบบแสดงปุ่มตามที่ตั้งค่าไว้ในระบบ หากเปิด Microsoft Entra หรือ CMU Account จะเห็นปุ่มที่เกี่ยวข้อง ในช่วงก่อน IdP พร้อม อาจเปิดล็อกอินสาธิตแบบมีรหัสผ่านได้",
  );
  const s3 = screenFrame(doc, "TORI · เข้าสู่ระบบ", doc.y + 8, 210);
  doc.font("Thai-Bold").fontSize(16).fillColor("#1c1917").text("ผู้ช่วยงานที่เข้าใจ TOR ของคุณ", s3.x, s3.y);
  doc.font("Thai").fontSize(12).fillColor("#57534e").text(
    "เข้าสู่ระบบเพื่อบันทึกและสรุปการปฏิบัติงานอย่างเป็นระบบ",
    s3.x,
    s3.y + 28,
    { width: s3.width },
  );
  doc.roundedRect(s3.x, s3.y + 70, s3.width, 36, 8).fill("#2F2F2F");
  doc.fillColor("#fff").font("Thai-Bold").fontSize(13).text("เข้าสู่ระบบด้วย Microsoft", s3.x, s3.y + 80, {
    width: s3.width,
    align: "center",
  });
  doc.roundedRect(s3.x, s3.y + 118, s3.width, 56, 8).fillAndStroke("#fffbeb", "#fcd34d");
  doc.fillColor("#92400e").font("Thai").fontSize(12).text(
    "เข้าสู่ระบบสาธิต (ชั่วคราว) · อีเมล + รหัสผ่าน",
    s3.x + 10,
    s3.y + 138,
    { width: s3.width - 20 },
  );
  doc.y = s3.bottom + 16;
  body(
    doc,
    "เมื่อ Entra ใช้งานได้จริง ควรปิด DEMO_LOGIN_ENABLED และลบรหัสผ่านสาธิตออกจาก environment",
  );

  // --- หน้า 4: อัปโหลด TOR ---
  newPage(doc, 4, "3. อัปโหลดและวิเคราะห์ TOR");
  body(
    doc,
    "ไปที่ ตั้งค่า → TOR เลือกไฟล์ PDF หรือ DOCX และระบุปีงบประมาณ ระบบแยกคำขอเป็น อัปโหลด → ประมวลผลข้อความ → วิเคราะห์ด้วย AI เพื่อไม่ให้ชนเพดานเวลาบน Vercel",
  );
  const s4 = screenFrame(doc, "ตั้งค่า · TOR ของฉัน", doc.y + 8, 230);
  doc.font("Thai-Bold").fontSize(14).fillColor("#1c1917").text("อัปโหลดเอกสาร TOR", s4.x, s4.y);
  doc.roundedRect(s4.x, s4.y + 28, s4.width, 54, 8).fillAndStroke("#ffffff", "#d6d3d1");
  doc.font("Thai").fontSize(12).fillColor("#78716c").text("ลากไฟล์มาวาง หรือเลือกไฟล์ · PDF/DOCX", s4.x + 12, s4.y + 46, {
    width: s4.width - 24,
  });
  doc.roundedRect(s4.x, s4.y + 96, 120, 32, 8).fill("#0f766e");
  doc.fillColor("#fff").font("Thai-Bold").fontSize(12).text("อัปโหลด", s4.x, s4.y + 104, {
    width: 120,
    align: "center",
  });
  doc.font("Thai").fontSize(12).fillColor("#44403c").text(
    "สถานะตัวอย่าง: ACTIVE · พ.ศ. 2569 · วิเคราะห์แล้ว\nปุ่ม: เก็บถาวร (ไม่ลบผลงาน)",
    s4.x,
    s4.y + 144,
    { width: s4.width, lineGap: 2 },
  );
  doc.y = s4.bottom + 16;
  bullet(doc, [
    "ไฟล์ซ้ำ (hash เดิม) จะถูกปฏิเสธ",
    "บน Vercel แนะนำขนาดไฟล์ไม่เกิน 4 MB (MAX_TOR_FILE_SIZE_MB=4)",
    "หลังวิเคราะห์สำเร็จ จะเห็นโครงหมวด/หัวข้อ/ชม.ต่อสัปดาห์ในหน้า TOR",
  ], doc.y);

  // --- หน้า 5: แชท ---
  newPage(doc, 5, "4. บันทึกงานผ่านแชท");
  body(
    doc,
    "หน้าแชทคือจุดหลักในการเล่างาน ระบบจะสรุปสิ่งที่เข้าใจแล้วถามเฉพาะช่องที่ยังขาด โดยเฉพาะวันและช่วงเวลา สามารถพิมพ์ “บันทึกตามนี้” หรือบอกว่าไม่ต้องระบุวันเวลาได้เมื่อข้อมูลอื่นครบ",
  );
  const s5 = screenFrame(doc, "แชท · เลื่องานเพื่อบันทึก JA", doc.y + 8, 250);
  doc.roundedRect(s5.x, s5.y, s5.width * 0.72, 48, 8).fill("#ecfdf5");
  doc.font("Thai").fontSize(11).fillColor("#115e59").text(
    "สรุป: เข้าร่วมอบรม · หมวดงานเชิงพัฒนา · ขาดวันและเวลา",
    s5.x + 8,
    s5.y + 14,
    { width: s5.width * 0.72 - 16 },
  );
  doc.roundedRect(s5.x + s5.width * 0.28, s5.y + 60, s5.width * 0.72, 40, 8).fill("#f5f5f4");
  doc.font("Thai").fontSize(11).fillColor("#44403c").text(
    "วันที่ 10 มี.ค. 69 เวลา 09:00–16:00 ที่สำนักดิจิทัล",
    s5.x + s5.width * 0.28 + 8,
    s5.y + 72,
    { width: s5.width * 0.72 - 16 },
  );
  doc.roundedRect(s5.x, s5.y + 120, s5.width, 44, 8).fillAndStroke("#ffffff", "#d6d3d1");
  doc.font("Thai").fontSize(11).fillColor("#a8a29e").text("พิมพ์งานที่ทำ…", s5.x + 10, s5.y + 134);
  doc.roundedRect(s5.x, s5.y + 178, 110, 28, 8).fill("#0f766e");
  doc.fillColor("#fff").font("Thai-Bold").fontSize(11).text("บันทึกตามนี้", s5.x, s5.y + 184, {
    width: 110,
    align: "center",
  });
  doc.y = s5.bottom + 14;
  bullet(doc, [
    "เลือกโมเดลแชทได้ถ้าผู้ดูแลเปิดรายการโมเดลไว้",
    "โมเดลที่คิดก่อนตอบอาจใช้เวลานาน — ระบบเผื่อโทเคนและซ่อม JSON ที่ถูกตัด",
    "ยืนยันงานแล้วไปดูได้ที่ตั้งค่า → รายการงาน",
  ], doc.y);

  // --- หน้า 6: รายการงาน / ส่งออก ---
  newPage(doc, 6, "5. รายงาน JA และส่งออก");
  body(
    doc,
    "หน้ารายการงานจัดวางแบบฟอร์มคู่กับ TOR: คอลัมน์ซ้ายเป็นภาระงานตาม TOR คอลัมน์ขวาเป็นผลการปฏิบัติงานจริง ชม./สัปดาห์ฝั่ง JA แสดงผลรวมชั่วโมงจริงของหัวข้อนั้น",
  );
  const s6 = screenFrame(doc, "ตั้งค่า · รายการงาน (JA)", doc.y + 8, 240);
  const colW = (s6.width - 8) / 4;
  const headers = ["ภาระงาน (TOR)", "ชม.", "ผลการปฏิบัติงานจริง", "ชม."];
  headers.forEach((h, i) => {
    doc.rect(s6.x + i * colW, s6.y, colW, 24).fillAndStroke("#e7e5e4", "#d6d3d1");
    doc.fillColor("#44403c").font("Thai-Bold").fontSize(10).text(h, s6.x + i * colW + 4, s6.y + 6, {
      width: colW - 8,
      align: "center",
    });
  });
  const rowY = s6.y + 24;
  doc.rect(s6.x, rowY, colW, 70).stroke("#d6d3d1");
  doc.rect(s6.x + colW, rowY, colW, 70).stroke("#d6d3d1");
  doc.rect(s6.x + 2 * colW, rowY, colW, 70).stroke("#d6d3d1");
  doc.rect(s6.x + 3 * colW, rowY, colW, 70).stroke("#d6d3d1");
  doc.font("Thai").fontSize(10).fillColor("#1c1917");
  doc.text("3.1 พัฒนาตนเอง", s6.x + 4, rowY + 8, { width: colW - 8 });
  doc.text("7", s6.x + colW, rowY + 8, { width: colW, align: "center" });
  doc.text("อบรม LINE OA\n8 ชั่วโมง", s6.x + 2 * colW + 4, rowY + 8, { width: colW - 8 });
  doc.text("8", s6.x + 3 * colW, rowY + 8, { width: colW, align: "center" });
  doc.roundedRect(s6.x, s6.y + 110, 70, 26, 6).fill("#0f766e");
  doc.roundedRect(s6.x + 80, s6.y + 110, 70, 26, 6).fill("#1d4ed8");
  doc.fillColor("#fff").font("Thai-Bold").fontSize(11);
  doc.text("PDF", s6.x, s6.y + 116, { width: 70, align: "center" });
  doc.text("Word", s6.x + 80, s6.y + 116, { width: 70, align: "center" });
  doc.y = s6.bottom + 14;
  bullet(doc, [
    "ส่งออกเป็นทั้งฉบับตามเอกสาร TOR ที่ผูกไว้ ไม่ใช่ทีละรายการอย่างเดียว",
    "PDF รองรับข้อความไทยและแถวที่ยาวเกินหนึ่งหน้าโดยขึ้นหน้าใหม่",
  ], doc.y);

  // --- หน้า 7: ผู้ดูแล AI ---
  newPage(doc, 7, "6. ตั้งค่า AI (ผู้ดูแล)");
  body(
    doc,
    "เฉพาะบทบาท ADMIN เข้า /settings/ai ได้ เลือก provider หลักเป็น OpenAI-compatible หรือ Google AI Studio สามารถบันทึกเฉพาะชื่อโมเดลโดยไม่ต้องใส่คีย์ใหม่หากตั้งค่าไว้แล้ว",
  );
  const s7 = screenFrame(doc, "ตั้งค่า · AI ของระบบ", doc.y + 8, 220);
  doc.font("Thai-Bold").fontSize(13).fillColor("#1c1917").text("OpenAI / OpenAI-compatible", s7.x, s7.y);
  doc.font("Thai").fontSize(11).fillColor("#57534e").text("Base URL · API key · Model", s7.x, s7.y + 24);
  doc.roundedRect(s7.x, s7.y + 48, s7.width, 28, 6).fillAndStroke("#fff", "#d6d3d1");
  doc.fillColor("#a8a29e").text("gemini-2.5-flash / gpt-4.1-mini / เกตเวย์ภายใน", s7.x + 8, s7.y + 56);
  doc.roundedRect(s7.x, s7.y + 92, 140, 30, 8).fill("#0f766e");
  doc.fillColor("#fff").font("Thai-Bold").fontSize(12).text("บันทึกและใช้งาน", s7.x, s7.y + 100, {
    width: 140,
    align: "center",
  });
  doc.roundedRect(s7.x + 150, s7.y + 92, 140, 30, 8).fillAndStroke("#fff", "#6ee7b7");
  doc.fillColor("#047857").font("Thai-Bold").fontSize(12).text("ทดสอบการเชื่อมต่อ", s7.x + 150, s7.y + 100, {
    width: 140,
    align: "center",
  });
  doc.y = s7.bottom + 14;
  bullet(doc, [
    "โมเดล Gemini ที่แนะนำ: gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash",
    "รายการโมเดลแชทตั้งได้ในช่อง chat models (คั่นบรรทัดหรือจุลภาค)",
    "AI_REQUEST_TIMEOUT_MS คุมงบเวลาไม่ให้ชนเพดาน 300 วินาทีของ Vercel",
  ], doc.y);

  // --- หน้า 8: Deploy ---
  newPage(doc, 8, "7. Deploy บน Vercel + Neon + Blob");
  heading(doc, "Environment ที่ต้องตั้ง");
  bullet(doc, [
    "DATABASE_URL — connection string จาก Neon",
    "AUTH_SECRET — สุ่มอย่างน้อย 32 ตัวอักษร",
    "STORAGE_DRIVER=vercel-blob และ BLOB_READ_WRITE_TOKEN",
    "MAX_TOR_FILE_SIZE_MB=4 (แนะนำบน Vercel)",
    "APP_URL — URL จริงของแอป (ใช้สร้าง redirect เข้าสู่ระบบ)",
    "ENTRA_* หรือ DEMO_LOGIN_* ตามโหมดยืนยันตัวตน",
  ], doc.y + 4);
  doc.moveDown(0.6);
  heading(doc, "Region และ migration");
  bullet(doc, [
    "ตั้ง region เป็น Singapore (sin1) ให้ตรงกับ Neon",
    "build รันแค่ prisma generate — ไม่ migrate เอง",
    "ทุกครั้งที่สคีมาเปลี่ยน ต้องรัน prisma migrate deploy ด้วยมือก่อน/คู่กับ deploy",
  ], doc.y);

  // --- หน้า 9: การดูแลข้อมูล ---
  newPage(doc, 9, "8. การดูแล TOR และข้อมูล");
  body(doc, "พฤติกรรมสำคัญเมื่อจัดการเอกสาร TOR:");
  bullet(doc, [
    "วิเคราะห์ซ้ำ: ระบบจำหัวข้อเดิมแล้วผูก JA กลับ (หมวด/ชนิด/รหัส/ชื่อ) ไม่ให้ผลงานหลุดเงียบ ๆ",
    "อัปโหลดปีเดียวกัน: ฉบับเก่าถูกเก็บถาวร ผลงานถูกย้ายมาฉบับใหม่เมื่อ activate",
    "เก็บถาวร TOR: สถานะ ARCHIVED + audit log ไฟล์และ JA ที่บันทึกแล้วยังอยู่ในฐานข้อมูล",
    "ลบรายการงานจากรายงาน: เป็นการ archive JA เช่นกัน ไม่ใช่ลบถาวรจากดิสก์ทันที",
  ], doc.y + 4);
  doc.moveDown(0.8);
  heading(doc, "สุขภาพระบบ");
  bullet(doc, [
    "ตรวจ /api/health หลัง deploy",
    "รัน npm run check ก่อน merge (lint + typecheck + tests)",
    "ดู log ฟังก์ชัน chat/analyze หากหมดเวลา — ลดขนาดไฟล์หรือลด AI_REQUEST_TIMEOUT_MS ให้สอดคล้อง maxDuration",
  ], doc.y);

  // --- หน้า 10: คำถามที่พบบ่อย ---
  newPage(doc, 10, "9. คำถามที่พบบ่อย");
  const faqs: Array<[string, string]> = [
    [
      "อัปโหลดแล้วไม่เห็นหัวข้อ?",
      "รอให้ครบสามขั้น (อัปโหลด/ประมวลผล/วิเคราะห์) หรือเปิดสถานะ FAILED แล้วดูข้อความผิดพลาด",
    ],
    [
      "แชทค้างหรือ JSON พัง?",
      "มักเกิดกับโมเดล reasoning — ลองโมเดลอื่น หรือรอให้ครบงบเวลา ระบบพยายามซ่อม JSON ที่ถูกตัด",
    ],
    [
      "ชม. ฝั่ง JA เป็นเท่าไหร่?",
      "เป็นผลรวมชั่วโมงจริงของ JA ใต้หัวข้อนั้น ไม่ได้ล็อกเป็น 0",
    ],
    [
      "เปิดลิงก์ 0.0.0.0 ไม่ได้ล็อกอิน?",
      "ใช้ APP_URL เช่น http://localhost:4600 แทนที่อยู่ bind ของ Docker",
    ],
    [
      "ควรปิดอะไรก่อนขึ้น production จริง?",
      "ปิด DEMO_LOGIN_ENABLED เปิด Entra ให้ครบ และหมุน secret หากเคยหลุดในไฟล์ env",
    ],
  ];
  let y = doc.y;
  for (const [q, a] of faqs) {
    doc.font("Thai-Bold").fontSize(13).fillColor("#0f766e").text(q, 52, y, {
      width: doc.page.width - 104,
    });
    doc.font("Thai").fontSize(13).fillColor("#44403c").text(a, 52, doc.y + 2, {
      width: doc.page.width - 104,
      lineGap: 1,
    });
    y = doc.y + 10;
  }
  doc.font("Thai").fontSize(12).fillColor("#a8a29e").text(
    "จบคู่มือ · สร้างจากสคริปต์ scripts/generate-manual-pdf.ts · ภาพหน้าจอเป็นการจำลอง UI จริงของ TORI",
    52,
    760,
    { width: doc.page.width - 104, align: "center" },
  );

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
  console.log(`Wrote ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
