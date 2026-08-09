"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function JaDeleteButton({ id, workTitle }: { id: string; workTitle: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`ลบรายการ “${workTitle}” ออกจากรายงานหรือไม่?`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/ja/${id}`, { method: "DELETE" });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "ลบไม่สำเร็จ");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? "กำลังลบ…" : "ลบ"}
      </button>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
