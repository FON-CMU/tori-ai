/**
 * สร้าง manual.pdf — คู่มือการใช้งานเบื้องต้นภาษาไทย
 *
 *   node docs/manual/make-manual.mjs
 *
 * ภาพประกอบอยู่ใน docs/manual/screenshots/ ถ่ายจากระบบจริงด้วย Playwright
 * ที่ viewport 1280x860 ถ้าถ่ายใหม่ให้ใช้ขนาดเดิม ไม่งั้นสัดส่วนภาพจะเพี้ยน
 */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const PDFDocument = require("pdfkit");
const { createWriteStream } = require("node:fs");

const OUT = path.join(ROOT, "manual.pdf");
const font = (file) => path.join(ROOT, "assets", "fonts", file);
const shot = (file) => path.join(HERE, "screenshots", file);

const doc = new PDFDocument({
  size: "A4",
  margin: 50,
  info: { Title: "TORI — คู่มือการใช้งานเบื้องต้น", Author: "TORI" },
  autoFirstPage: false,
});
doc.registerFont("Thai", font("THSarabunNew.ttf"));
doc.registerFont("Thai-Bold", font("THSarabunNew-Bold.ttf"));
doc.pipe(createWriteStream(OUT));

const INK = "#1c1917";
const MUTED = "#57534e";
const ACCENT = "#0f766e";
const WIDTH = 595.28 - 100; // A4 กว้าง 595.28pt หักขอบซ้ายขวาข้างละ 50

let pageNumber = 0;
function newPage() {
  doc.addPage();
  pageNumber += 1;
  if (pageNumber > 1) {
    // เขียนใต้ขอบล่าง ต้องปิด margin ชั่วคราว ไม่งั้น pdfkit ถือว่าล้นหน้าแล้วแทรกหน้าว่างให้
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font("Thai")
      .fontSize(11)
      .fillColor(MUTED)
      .text(`TORI · คู่มือการใช้งานเบื้องต้น · หน้า ${pageNumber - 1}`, 50, doc.page.height - 38, {
        width: WIDTH,
        align: "center",
      });
    doc.page.margins.bottom = bottom;
  }
  doc.x = 50;
  doc.y = 50;
  doc.fillColor(INK);
}

function room(height) {
  if (doc.y + height > doc.page.height - 70) newPage();
}

function heading(text) {
  room(60);
  doc.moveDown(0.6);
  doc.font("Thai-Bold").fontSize(20).fillColor(ACCENT).text(text, { width: WIDTH });
  doc.fillColor(INK);
  doc.moveDown(0.2);
}

function step(number, title) {
  room(70);
  doc.moveDown(0.7);
  const top = doc.y;
  doc.circle(60, top + 9, 10).fill(ACCENT);
  doc.font("Thai-Bold").fontSize(13).fillColor("#ffffff").text(String(number), 50, top + 2, {
    width: 20,
    align: "center",
  });
  doc.font("Thai-Bold").fontSize(19).fillColor(INK).text(title, 80, top, { width: WIDTH - 30 });
  doc.x = 50;
  doc.moveDown(0.2);
}

function para(text) {
  room(40);
  doc.font("Thai").fontSize(15).fillColor(INK).text(text, 50, doc.y, { width: WIDTH, lineGap: 2 });
  doc.x = 50;
  doc.moveDown(0.25);
}

function bullets(items) {
  for (const item of items) {
    room(30);
    doc.font("Thai").fontSize(15).fillColor(INK).text(`•  ${item}`, 62, doc.y, {
      width: WIDTH - 12,
      lineGap: 2,
    });
    doc.x = 50;
  }
  doc.moveDown(0.25);
}

function note(text) {
  const inner = WIDTH - 28;
  doc.font("Thai").fontSize(14);
  const height = doc.heightOfString(text, { width: inner, lineGap: 2 }) + 16;
  room(height + 12);
  const top = doc.y;
  doc.rect(50, top, WIDTH, height).fill("#f0fdfa");
  doc.rect(50, top, 3, height).fill(ACCENT);
  doc.fillColor(INK).font("Thai").fontSize(14).text(text, 64, top + 8, { width: inner, lineGap: 2 });
  doc.x = 50;
  doc.y = top + height + 10;
}

function figure(file, caption) {
  const source = shot(file);
  if (!existsSync(source)) throw new Error(`ไม่พบภาพ ${source}`);
  const imageWidth = WIDTH;
  const imageHeight = Math.round((860 / 1280) * imageWidth);
  room(imageHeight + 34);
  const top = doc.y;
  doc.image(source, 50, top, { width: imageWidth });
  doc.rect(50, top, imageWidth, imageHeight).lineWidth(0.7).stroke("#d6d3d1");
  doc.y = top + imageHeight + 6;
  doc.font("Thai").fontSize(13).fillColor(MUTED).text(caption, 50, doc.y, {
    width: imageWidth,
    align: "center",
  });
  doc.fillColor(INK);
  doc.x = 50;
  doc.moveDown(0.5);
}

// ---------- ปก ----------
newPage();
doc.rect(0, 0, doc.page.width, 240).fill(ACCENT);
doc.font("Thai-Bold").fontSize(56).fillColor("#ffffff").text("TORI", 50, 84, { width: WIDTH });
doc.font("Thai").fontSize(22).fillColor("#ccfbf1").text("เลขาส่วนตัวสำหรับบันทึกผลการปฏิบัติงาน", 50, 156, {
  width: WIDTH,
});
doc.fillColor(INK);
doc.y = 300;
doc.font("Thai-Bold").fontSize(34).text("คู่มือการใช้งานเบื้องต้น", 50, doc.y, { width: WIDTH });
doc.moveDown(0.4);
doc
  .font("Thai")
  .fontSize(17)
  .fillColor(MUTED)
  .text(
    "ระบบบันทึกผลการปฏิบัติงานจริง (JA) ให้ตรงกับข้อตกลงการปฏิบัติงาน (TOR) " +
      "โดยเล่างานผ่านการแชทเป็นภาษาไทย แล้วส่งออกฟอร์มทั้งฉบับเป็น Word หรือ PDF",
    50,
    doc.y,
    { width: WIDTH, lineGap: 3 },
  );
doc.fillColor(INK);
doc.y = doc.page.height - 150;
doc.font("Thai").fontSize(15).fillColor(MUTED).text("ฉบับวันที่ 10 สิงหาคม 2569", 50, doc.y, { width: WIDTH });
doc.text("ภาพประกอบทั้งหมดถ่ายจากระบบจริง — ข้อมูลในภาพเป็นข้อมูลตัวอย่างสำหรับทดสอบ", 50, doc.y + 2, {
  width: WIDTH,
});

// ---------- ภาพรวม ----------
newPage();
heading("TORI ช่วยอะไร");
para(
  "งานเอกสารประเมินผลมักเสียเวลาไปกับการนั่งนึกว่าทำอะไรไปบ้าง แล้วมานั่งจับคู่ว่างานนั้นตรงกับหัวข้อไหนใน TOR " +
    "TORI ย้ายงานส่วนนี้มาไว้ในการแชท คุณเล่างานด้วยภาษาพูดตามปกติ ระบบจะสกัดรายละเอียด จับคู่หัวข้อ TOR ให้เอง " +
    "แล้วเก็บเป็นรายการ JA ที่พร้อมส่งออกเป็นฟอร์มราชการ",
);
bullets([
  "อัปโหลดไฟล์ TOR ครั้งเดียว ระบบอ่านโครงหัวข้อทั้งฉบับให้อัตโนมัติ",
  "เล่างานในแชทเป็นภาษาไทย ไม่ต้องกรอกฟอร์มทีละช่อง",
  "ระบบถามเฉพาะข้อมูลที่ยังขาด เช่น สถานที่ หรือ ความรู้ที่ได้รับ",
  "ส่งออกแบบฟอร์ม TOR/JA ทั้งฉบับเป็น Word หรือ PDF ได้ทุกเมื่อ",
]);

heading("ลำดับการใช้งานโดยสรุป");
para("เข้าสู่ระบบ › อัปโหลด TOR › ตรวจโครงหัวข้อ › เล่างานในแชท › ยืนยันบันทึก › ดูรายงาน › ส่งออกไฟล์");

// ---------- ขั้นตอน ----------
step(1, "เข้าสู่ระบบ");
para("เปิดหน้าเว็บของระบบ แล้วเข้าสู่ระบบด้วยบัญชีที่ผู้ดูแลกำหนดให้ เมื่อเข้าสำเร็จระบบจะพาไปหน้าแชททันที");
figure("manual-01-login.png", "ภาพที่ 1 — หน้าเข้าสู่ระบบ");

step(2, "อัปโหลดเอกสาร TOR");
para(
  "ไปที่ ตั้งค่า › TOR ของฉัน กดปุ่ม “เลือกไฟล์ TOR” แล้วเลือกไฟล์ PDF หรือ DOCX ของข้อตกลงการปฏิบัติงาน " +
    "เลือกปี พ.ศ. ให้ตรงกับรอบการประเมิน จากนั้นระบบจะอ่านไฟล์และแยกหัวข้อด้วย AI ให้เอง ใช้เวลาราวครึ่งนาที",
);
figure("manual-05-tor-upload.png", "ภาพที่ 2 — หน้าอัปโหลด TOR");
note(
  "ทำครั้งเดียวต่อปี หากอัปโหลดฉบับใหม่ของปีเดียวกัน ระบบจะถือว่าฉบับใหม่แทนที่ฉบับเดิม " +
    "และย้ายผลงานที่บันทึกไว้แล้วมาผูกกับหัวข้อของฉบับใหม่ให้อัตโนมัติ",
);

step(3, "ตรวจโครงหัวข้อที่ระบบอ่านได้");
para(
  "เลื่อนลงมาดูหัวข้อที่ระบบแยกไว้ ควรตรงกับฟอร์มในไฟล์ทั้งลำดับหมวด หัวข้อภาระงาน รายการย่อย และชั่วโมงต่อสัปดาห์ " +
    "ถ้าเห็นสถานะ “ใช้งานอยู่” แปลว่าพร้อมใช้จับคู่งานในแชทแล้ว",
);
figure("manual-06-tor-outline.png", "ภาพที่ 3 — โครง TOR ที่ระบบอ่านได้จากไฟล์");
note("ระบบจับคู่ผลงานกับหัวข้อระดับ “ภาระงาน” เท่านั้น (เช่น 1.1, 2.3, 3.1) รายการย่อยใต้หัวข้อมีไว้ให้อ่านประกอบ");

step(4, "เล่างานในแชท");
para(
  "กลับไปหน้าแชท แล้วพิมพ์เล่างานที่ทำด้วยภาษาปกติ ยิ่งเล่าครบยิ่งถามน้อย เช่น " +
    "“วันนี้เข้าร่วมอบรม Basic Generative AI 9.00 - 16.00 น. ที่โรงแรมคุ้มภูคำ” " +
    "ระบบจะสกัดชื่องาน วันเวลา สถานที่ จำนวนชั่วโมง และเลือกหัวข้อ TOR ที่ใกล้เคียงที่สุดให้",
);
figure("manual-04-chat-top.png", "ภาพที่ 4 — เล่างานหนึ่งประโยค ระบบสรุปเป็นร่างให้ตรวจ");
para("ถ้าข้อมูลยังไม่ครบ ระบบจะถามกลับทีละข้อ เช่น ถามสถานที่ หรือถามว่าได้ความรู้/ทักษะอะไรจากการอบรม");

step(5, "ตรวจแล้วยืนยันบันทึก");
para(
  "อ่านร่างที่ระบบสรุปให้ ถ้าถูกต้องกดปุ่ม “ยืนยันบันทึก JA” หรือพิมพ์คำว่า “ยืนยัน” " +
    "ระบบจะออกเลขที่รายการให้ เช่น JA-2026-000001 และนำไปวางในช่องผลการปฏิบัติงานจริงของหัวข้อที่จับคู่ไว้",
);
figure("manual-03-chat-flow.png", "ภาพที่ 5 — ยืนยันแล้วระบบออกเลขที่รายการให้");
note("ถ้ายังไม่ยืนยัน ข้อมูลจะเป็นเพียงร่าง ยังไม่ถูกนำไปแสดงในรายงาน");

step(6, "ดูรายงานทั้งฉบับ");
para(
  "ไปที่ ตั้งค่า › รายการงาน จะเห็นฟอร์มเดียวกับที่ต้องส่ง คือคอลัมน์ซ้ายเป็นภาระงานตาม TOR " +
    "คอลัมน์ขวาเป็นผลการปฏิบัติงานจริงที่บันทึกไว้ และช่องขวาสุดเป็นผลรวมชั่วโมงจริงของหัวข้อนั้น",
);
figure("manual-07-report-top.png", "ภาพที่ 6 — รายงานทั้งฉบับตามฟอร์ม TOR");
figure("manual-08-report-ja.png", "ภาพที่ 7 — หัวข้อที่มีผลงานแล้ว พร้อมชั่วโมงรวมทางขวา");

step(7, "ส่งออกเป็น Word หรือ PDF");
para(
  "ที่มุมขวาบนของรายงานมีปุ่ม “Word ทั้งฉบับ” และ “PDF ทั้งฉบับ” กดแล้วไฟล์จะดาวน์โหลดทันที " +
    "รูปแบบตรงกับแบบฟอร์มราชการ ใช้ส่งได้เลย หรือจะพิมพ์คำว่า “ส่งออก PDF” ในแชทก็ได้เช่นกัน",
);

step(8, "ดูภาพรวมชั่วโมงและหมวดงาน");
para("หน้า ภาพรวม สรุปจำนวนชั่วโมงและสัดส่วนของแต่ละหมวดงาน ใช้ตรวจว่าบันทึกครบตามที่ TOR กำหนดหรือยัง");
figure("manual-09-dashboard.png", "ภาพที่ 8 — ภาพรวมชั่วโมงและหมวดงาน");

// ---------- ภาคผนวก ----------
heading("ภาคผนวก ก — คำสั่งลัดในแชท");
para("พิมพ์คำเหล่านี้ในช่องแชทได้โดยตรง ระบบตอบจากข้อมูลจริงในฐานข้อมูล ไม่ผ่าน AI จึงเร็วและแม่นยำ");
bullets([
  "ช่วยเหลือ / คำสั่ง — แสดงรายการคำสั่งทั้งหมด",
  "ตอนนี้มี JA กี่เรื่อง — นับจำนวนรายการที่บันทึกแล้ว",
  "ดู TOR / หัวข้อ TOR — สรุปหัวข้อ TOR ที่ใช้งานอยู่",
  "ดูรายงาน / สรุป JA — สรุปผลการปฏิบัติงานจริงทั้งฉบับ",
  "ส่งออก PDF / ส่งออก Word — ดาวน์โหลดรายงานทั้งฉบับ",
  "ไปหน้า TOR / ไปหน้ารายงาน / ไปตั้งค่า — เปิดหน้าที่ต้องการ",
  "ลบแชทนี้ — ลบการสนทนาปัจจุบัน",
]);

heading("ภาคผนวก ข — ตั้งค่า AI (เฉพาะผู้ดูแลระบบ)");
para(
  "หน้า ตั้งค่า › AI ของระบบ ใช้กำหนดผู้ให้บริการ AI คีย์ และรุ่นของโมเดลที่ทั้งระบบใช้ร่วมกัน " +
    "ผู้ใช้ทั่วไปไม่ต้องตั้งค่าส่วนนี้ หลังบันทึกแล้วควรกด “ทดสอบการเชื่อมต่อ” หนึ่งครั้งเพื่อยืนยันว่าใช้งานได้",
);
figure("manual-10-ai-settings.png", "ภาพที่ 9 — หน้าตั้งค่า AI สำหรับผู้ดูแลระบบ");
note("คีย์ถูกเข้ารหัสก่อนเก็บลงฐานข้อมูล และแสดงกลับมาเพียง 4 ตัวท้ายเท่านั้น");

heading("ภาคผนวก ค — ข้อควรรู้");
bullets([
  "ต้องมี TOR ที่ใช้งานอยู่ก่อน ระบบจึงจะบันทึกงานจากแชทได้",
  "ไฟล์ TOR รองรับ PDF และ DOCX ที่เป็นไฟล์ข้อความ ไฟล์สแกนเป็นรูปภาพจะอ่านไม่ได้",
  "ขนาดไฟล์สูงสุดแสดงอยู่ใต้ปุ่มเลือกไฟล์ในหน้าอัปโหลด",
  "การลบเอกสาร TOR จะลบเฉพาะไฟล์ต้นฉบับ ผลการปฏิบัติงานที่บันทึกไว้ยังอยู่ในระบบ",
  "การลบรายการ JA เป็นการเก็บเข้าคลัง ไม่ใช่การลบถาวร ระบบเก็บประวัติไว้ทุกครั้ง",
  "ทุกอย่างใช้เวลาประเทศไทยและปี พ.ศ.",
]);

doc.end();
console.log(`เขียน ${OUT}`);
