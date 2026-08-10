"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, useRef, useState } from "react";

import { currentBuddhistYear } from "@/lib/date";
import { humanizeClientError, readJsonResponse } from "@/lib/http/client-json";

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
      const uploadResponse = await fetch("/api/tor/upload", { method: "POST", body: form });
      const uploadBody = await readJsonResponse<{
        data?: { id: string; year: number };
        error?: { message?: string };
      }>(uploadResponse);
      if (!uploadResponse.ok || !uploadBody.data) {
        throw new Error(uploadBody.error?.message ?? "อัปโหลดไม่สำเร็จ");
      }

      setMessage({ type: "success", text: "อัปโหลดสำเร็จ กำลังอ่านข้อความจากเอกสาร…" });
      const processResponse = await fetch(`/api/tor/${uploadBody.data.id}/process`, { method: "POST" });
      const processBody = await readJsonResponse<{ error?: { message?: string } }>(processResponse);
      if (!processResponse.ok) {
        throw new Error(processBody.error?.message ?? "ประมวลผลข้อความไม่สำเร็จ");
      }

      setMessage({ type: "success", text: "อ่านข้อความแล้ว กำลังวิเคราะห์หัวข้อด้วย AI…" });
      const analyzeResponse = await fetch(`/api/tor/${uploadBody.data.id}/analyze`, { method: "POST" });
      const analyzeBody = await readJsonResponse<{
        data?: { topicCount: number };
        error?: { message?: string };
      }>(analyzeResponse);
      if (!analyzeResponse.ok) {
        throw new Error(analyzeBody.error?.message ?? "วิเคราะห์หัวข้อไม่สำเร็จ");
      }

      setMessage({
        type: "success",
        text: `พร้อมใช้งาน TOR ปี พ.ศ. ${uploadBody.data.year} · หัวข้อ ${analyzeBody.data?.topicCount ?? 0} รายการ`,
      });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: humanizeClientError(error, "อัปโหลดไม่สำเร็จ"),
      });
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
        accept=".pdf,.docx"
        onChange={upload}
        disabled={uploading}
      />
      <p className="font-medium">PDF หรือ DOCX ขนาดไม่เกิน {maxSizeMb} MB</p>
      <p className="mt-1 text-sm text-stone-500">
        อัปโหลด → อ่านข้อความ → วิเคราะห์หัวข้อ แยกเป็นคนละคำขอ (เหมาะกับ Vercel)
      </p>

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
        {uploading ? "กำลังดำเนินการ…" : "เลือกไฟล์ TOR"}
      </button>
      {message ? (
        <p role="status" className={`mt-3 text-sm ${message.type === "success" ? "text-emerald-700" : "text-red-700"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
