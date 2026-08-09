/**
 * ชั่วโมงที่ลงในคอลัมน์ขวาสุดของฟอร์ม = ผลรวมชั่วโมงจริงของ JA ในหัวข้อนั้น
 * totalHours มาจากคอลัมน์ Decimal(6,2) จึงมาเป็นสตริงและต้องผ่าน Number() ก่อนบวก
 * อยู่แยกจาก ja-report-service เพื่อให้เทสต์เรียกได้โดยไม่ลาก prisma มาด้วย
 */
export function sumJaHours(jas: Array<{ totalHours: string }>) {
  const total = jas.reduce((sum, ja) => sum + (Number(ja.totalHours) || 0), 0);
  return Number.isInteger(total) ? String(total) : total.toFixed(2).replace(/\.?0+$/, "");
}
