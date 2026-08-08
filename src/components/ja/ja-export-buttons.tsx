"use client";

import { useState } from "react";

export function JaExportButtons({ id, runningNumber }: { id: string; runningNumber: string }) {
  const [busy, setBusy] = useState<"pdf" | "docx" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(format: "pdf" | "docx") {
    setBusy(format);
    setError(null);
    try {
      const response = await fetch(`/api/ja/${id}/export?format=${format}`);
      if (!response.ok) {
        const body = await response.json() as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "ส่งออกไม่สำเร็จ");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${runningNumber}.${format === "pdf" ? "pdf" : "docx"}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ส่งออกไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => download("pdf")}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          {busy === "pdf" ? "กำลังสร้าง…" : "PDF"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => download("docx")}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          {busy === "docx" ? "กำลังสร้าง…" : "Word"}
        </button>
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
