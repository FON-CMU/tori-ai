/**
 * คีย์ที่ใช้บอกว่า "หัวข้อ TOR อันนี้คืออันเดียวกับก่อนวิเคราะห์ใหม่"
 * id ใช้ไม่ได้เพราะการวิเคราะห์ซ้ำลบหัวข้อทิ้งทั้งชุดแล้วสร้างใหม่ทุกครั้ง
 * จึงเทียบจากสิ่งที่ AI อ่านได้จากไฟล์เดิม — ชนิด + รหัสข้อ + ชื่อหัวข้อ
 * ตัดช่องว่างซ้ำและ trim ก่อน เพราะข้อความจาก DOCX/PDF มักมีช่องว่างไม่คงที่
 */
export function topicIdentity(topic: { kind: string; code: string | null; title: string }) {
  const title = topic.title.replace(/\s+/g, " ").trim();
  const code = (topic.code ?? "").replace(/\s+/g, "").trim();
  return `${topic.kind}|${code}|${title}`;
}
