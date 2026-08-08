"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TorProcessButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function process() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/tor/${id}/process`, { method: "POST" });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "ประมวลผลไม่สำเร็จ");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ประมวลผลไม่สำเร็จ");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={process}
        disabled={busy}
        className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
      >
        {busy ? "กำลังอ่านข้อความ…" : "ประมวลผลเอกสาร"}
      </button>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
