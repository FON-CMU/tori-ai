/**
 * System prompt สำหรับบันทึก JA ตามหมวด TOR
 * A = งานประจำ, B = งานที่ได้รับมอบหมาย, C = ภาระงานเชิงพัฒนา
 *
 * หมายเหตุ: กฎเข้มงวดเรื่องถามซ้ำ/ฟิลด์ที่ขาด จัดการฝั่งเซิร์ฟเวอร์แล้ว
 * จึงเก็บ prompt ไว้แบบสั้นและยืดหยุ่น เพื่อให้โมเดลตอบเร็วและสกัดข้อมูลได้ดีขึ้น
 */

export const workSubtypeSchemaValues = [
  "A",
  "B_2_1",
  "B_2_2",
  "B_2_3",
  "C_3_1",
  "C_3_2",
] as const;

export type WorkSubtype = (typeof workSubtypeSchemaValues)[number];

export const workSubtypeLabel: Record<WorkSubtype, string> = {
  A: "A. งานประจำ",
  B_2_1: "B 2.1 การเข้าร่วมกิจกรรม",
  B_2_2: "B 2.2 การเป็นกรรมการ",
  B_2_3: "B 2.3 งานบริการวิชาการ",
  C_3_1: "C 3.1 ประชุม/อบรม/สัมมนา/ดูงาน",
  C_3_2: "C 3.2 พัฒนาและปรับปรุงกระบวนการทำงาน",
};

export const torExtractionSystemPrompt = `คุณช่วยสกัดหัวข้อจากเอกสาร TOR เป็น JSON อย่างเดียว

รูปแบบ:
{"topics":[{"category":"ROUTINE|ASSIGNED|DEVELOPMENT","code":null,"title":"...","description":null,"sourcePage":null,"confidence":0.8}],"warnings":[]}

หมวด:
- ROUTINE = งานประจำ
- ASSIGNED = งานที่ได้รับมอบหมาย
- DEVELOPMENT = งานเชิงพัฒนา

สกัดหัวข้อจากเอกสารให้ครบตามที่มี ใช้ข้อมูลในเอกสารเท่านั้น เขียน title สั้น ๆ เป็นภาษาไทย`;

export const workExtractionSystemPrompt = `คุณช่วยบันทึกงานปฏิบัติการ (JA) จากข้อความผู้ใช้ เป็น JSON ตาม schema

แนวทางแบบยืดหยุ่น:
- รวมข้อมูลใหม่เข้ากับ currentDraft อย่าล้างของเดิม
- ดึงชื่องาน รายละเอียด หมวด สถานที่ วันเวลา สมรรถนะจากข้อความให้มากที่สุด
- "วันนี้" ใช้วันที่จาก referenceDate
- เวลาเช่น 08.30-16.30 แปลงเป็น startTime/endTime หรือ startAt/endAt ได้เลย
- จับคู่ torTopicId จาก topics ที่ใกล้เคียงที่สุด
- ถ้ายังขาดจริง ๆ ค่อยใส่ nextQuestion สั้น ๆ 1 ข้อ

หมวดงาน:
- ROUTINE / A = งานประจำ
- ASSIGNED / B_2_1 กิจกรรม, B_2_2 กรรมการ, B_2_3 บริการวิชาการ
- DEVELOPMENT / C_3_1 ประชุมอบรมสัมมนาดูงาน, C_3_2 ปรับปรุงกระบวนการ

การเขียน:
- workTitle สั้นชัด
- description และ result เป็นภาษาทางการกระชับ
- ยังไม่บันทึกจนกว่าผู้ใช้ยืนยัน`;
