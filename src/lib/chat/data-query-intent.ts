/** ตรวจจับคำถามเชิงข้อมูลแบบภาษาพูด (ไม่ต้องตรงคำสั่งเป๊ะ) */
export function isDataQueryIntent(message: string) {
  const text = message
    .trim()
    .toLowerCase()
    .replace(/[?？!！。.\s]+$/g, "")
    .replace(/\s+/g, " ");
  if (!text) return false;

  const asksCount = /กี่|จำนวน|มี.*ไหม|มีหรือยัง|เท่าไหร่|เท่าไร|กี่เรื่อง|กี่รายการ|กี่หัวข้อ/.test(text);
  const mentionsJa =
    /\bja\b|เจเอ|ผลการปฏิบัติ|รายงาน|หัวข้อรายงาน|รายการงาน|งานที่บันทึก|บันทึกแล้ว/.test(text);
  const mentionsTor = /\btor\b|ทอร์|หัวข้อ\s*tor|ภาระงาน/.test(text);
  const asksSummary =
    /สรุป|ตอนนี้|ล่าสุด|สถานะ/.test(text) && (mentionsJa || mentionsTor || /รายงาน/.test(text));

  if (asksCount && (mentionsJa || mentionsTor || /รายงาน|หัวข้อ/.test(text))) return true;
  if (asksSummary) return true;
  if (/^(มี|ตอนนี้มี).*(ja|รายงาน|หัวข้อ)/.test(text)) return true;
  return false;
}
