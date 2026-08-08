"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TorAnalyzeButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    if (!window.confirm("ข้อความจาก TOR จะถูกส่งไปยัง AI ของระบบเพื่อสกัดหัวข้อ ดำเนินการต่อหรือไม่?")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/tor/${id}/analyze`, { method: "POST" });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "วิเคราะห์ไม่สำเร็จ");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "วิเคราะห์ไม่สำเร็จ");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={analyze}
        disabled={busy}
        className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
      >
        {busy ? "กำลังวิเคราะห์ด้วย AI…" : "วิเคราะห์หัวข้อด้วย AI"}
      </button>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
