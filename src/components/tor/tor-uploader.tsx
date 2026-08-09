"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, useRef, useState } from "react";

import { currentBuddhistYear } from "@/lib/date";

function yearOptions(center: number) {
  return Array.from({ length: 7 }, (_, index) => center - 3 + index);
}

export function TorUploader({ maxSizeMb }: { maxSizeMb: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [year, setYear] = useState(() => currentBuddhistYear());
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("year", String(year));
      const response = await fetch("/api/tor/upload", { method: "POST", body: form });
      const result = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "อัปโหลดไม่สำเร็จ");
      setMessage({
        type: "success",
        text: `อัปโหลด TOR ปี พ.ศ. ${year} สำเร็จ ระบบกำลังอ่านเอกสารและแยกหัวข้อด้วย AI`,
      });
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "อัปโหลดไม่สำเร็จ" });
      router.refresh();
    } finally {
      setUploading(false);
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
        {uploading ? "กำลังอัปโหลด…" : "เลือกไฟล์ TOR"}
      </button>
      {message ? (
        <p role="status" className={`mt-3 text-sm ${message.type === "success" ? "text-emerald-700" : "text-red-700"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
