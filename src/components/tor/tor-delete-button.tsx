"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TorDeleteButton({ id, fileName }: { id: string; fileName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function archive() {
    if (
      !window.confirm(
        `เก็บถาวร TOR “${fileName}” หรือไม่? ไฟล์จะถูกเก็บถาวร (ไม่ลบถาวร) และผลงานที่บันทึกไว้จะยังอยู่`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/tor/${id}`, { method: "DELETE" });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "เก็บถาวรไม่สำเร็จ");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "เก็บถาวรไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={busy}
        onClick={archive}
        className="rounded-lg border border-stone-200 px-2.5 py-1 text-xs text-stone-600 hover:bg-stone-50 disabled:opacity-50"
      >
        {busy ? "กำลังเก็บถาวร…" : "เก็บถาวร"}
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
