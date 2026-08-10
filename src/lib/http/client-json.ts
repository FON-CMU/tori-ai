/** อ่าน JSON จาก Response — กัน Safari ขึ้น "The string did not match the expected pattern" เมื่อได้ HTML */
export async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    if (!response.ok) throw new Error(`คำขอล้มเหลว (${response.status})`);
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    if (response.status === 401 || response.status === 403) {
      throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
    }
    throw new Error(
      response.ok
        ? "รูปแบบข้อมูลจากเซิร์ฟเวอร์ไม่ถูกต้อง"
        : `คำขอล้มเหลว (${response.status}) — ลองรีเฟรชหน้าหรือเข้าสู่ระบบใหม่`,
    );
  }
}

export function humanizeClientError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  if (/string did not match the expected pattern/i.test(message)) {
    return "ข้อมูลที่ส่งไม่ถูกต้อง หรือเซิร์ฟเวอร์ตอบกลับผิดรูปแบบ — ตรวจ Base URL (ต้องขึ้นต้นด้วย https://) หรือลองเข้าสู่ระบบใหม่";
  }
  return message || fallback;
}
