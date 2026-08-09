"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, useRef, useState } from "react";

import { currentBuddhistYear } from "@/lib/date";

function yearOptions(center: number) {
  return Array.from({ length: 7 }, (_, index) => center - 3 + index);
}

/**
 * A rejected upload does not always come from the app. A hosting platform
 * answers an oversized body or a function timeout itself, in HTML, so parsing
 * the response as JSON unconditionally surfaces a raw SyntaxError to the user.
 */
async function readJson<T>(response: Response): Promise<{ data?: T; error?: { message?: string } }> {
  try {
    return await response.json() as { data?: T; error?: { message?: string } };
  } catch {
    if (response.ok) return {};
    const byStatus: Record<number, string> = {
      413: "ไฟล์ใหญ่เกินกว่าที่เซิร์ฟเวอร์รับได้ กรุณาใช้ไฟล์ที่เล็กลง",
      504: "เซิร์ฟเวอร์ใช้เวลานานเกินกำหนด กรุณาลองใหม่",
    };
    return { error: { message: byStatus[response.status] ?? `เซิร์ฟเวอร์ตอบกลับผิดพลาด (${response.status})` } };
  }
}

export function TorUploader({ maxSizeMb }: { maxSizeMb: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [year, setYear] = useState(() => currentBuddhistYear());
  const [stage, setStage] = useState<"idle" | "uploading" | "processing">("idle");
  const [message, setMessage] = useState<{ type: "error" | "warning" | "success"; text: string } | null>(null);
  const uploading = stage !== "idle";

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Hosting platforms reject an oversized body before the route handler runs,
    // which would surface as an opaque 413 instead of this message.
    if (file.size > maxSizeMb * 1024 * 1024) {
      setMessage({ type: "error", text: `ไฟล์ต้องมีขนาดไม่เกิน ${maxSizeMb} MB` });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setStage("uploading");
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("year", String(year));
      const response = await fetch("/api/tor/upload", { method: "POST", body: form });
      const result = await readJson<{ id: string }>(response);
      if (!response.ok || !result.data) throw new Error(result.error?.message ?? "อัปโหลดไม่สำเร็จ");

      setStage("processing");
      setMessage({
        type: "success",
        text: `อัปโหลด TOR ปี พ.ศ. ${year} สำเร็จ กำลังอ่านเอกสารและแยกหัวข้อด้วย AI…`,
      });

      const processed = await fetch(`/api/tor/${result.data.id}/process`, { method: "POST" });
      const processedResult = await readJson<{ status?: string; topicCount?: number }>(processed);
      if (!processed.ok) {
        // The file is saved either way — the card below offers a retry button.
        throw new Error(
          `${processedResult.error?.message ?? "อ่านเอกสารไม่สำเร็จ"} (ไฟล์ถูกบันทึกแล้ว กดปุ่มประมวลผลในการ์ดด้านล่างเพื่อลองใหม่)`,
        );
      }

      // ingestTor answers 200 even when the AI step failed, so the document can
      // come back readable but with no topics — it is not usable in chat yet.
      const ready = processedResult.data?.status === "ACTIVE" && (processedResult.data.topicCount ?? 0) > 0;
      setMessage(ready
        ? { type: "success", text: `TOR ปี พ.ศ. ${year} พร้อมใช้งานในแชทแล้ว` }
        : { type: "warning", text: "อ่านเอกสารสำเร็จ แต่ยังแยกหัวข้อไม่ได้ ดูรายละเอียดและลองใหม่ได้ในการ์ดด้านล่าง" });
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "อัปโหลดไม่สำเร็จ" });
      router.refresh();
    } finally {
      setStage("idle");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="mt-7 rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center">
      <input
        ref={inputRef}
        className="sr-only"
        id="tor-file"
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={upload}
        disabled={uploading}
      />
      <p className="font-medium">PDF หรือ DOCX ขนาดไม่เกิน {maxSizeMb} MB</p>
      <p className="mt-1 text-sm text-stone-500">ไฟล์จะถูกเก็บอย่างปลอดภัยในพื้นที่ส่วนตัวของคุณ เข้าถึงได้เฉพาะระบบ TORI</p>

      <label className="mx-auto mt-5 flex max-w-xs flex-col gap-2 text-left">
        <span className="text-sm font-medium text-stone-700">ปีของ TOR (พ.ศ.)</span>
        <select
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
          disabled={uploading}
          className="h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm outline-none focus:border-teal-600"
        >
          {yearOptions(currentBuddhistYear()).map((option) => (
            <option key={option} value={option}>
              พ.ศ. {option}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="mt-5 rounded-xl bg-teal-700 px-5 py-3 text-white hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60"
      >
        {stage === "uploading" ? "กำลังอัปโหลด…" : stage === "processing" ? "กำลังวิเคราะห์ด้วย AI…" : "เลือกไฟล์ TOR"}
      </button>
      {message ? (
        <p
          role="status"
          className={`mt-3 text-sm ${message.type === "success" ? "text-emerald-700" : message.type === "warning" ? "text-amber-700" : "text-red-700"}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
