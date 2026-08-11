"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function JaReviewActions({ id }: { id: string }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review(action: "APPROVE" | "REQUEST_REVISION") {
    if (action === "REQUEST_REVISION" && !comment.trim()) { setError("กรุณาระบุเหตุผลที่ส่งกลับแก้ไข"); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/ja/${id}/review`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, comment }) });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "ตรวจทานไม่สำเร็จ");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "ตรวจทานไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  return <div className="mt-4"><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="หมายเหตุ (จำเป็นเมื่อส่งกลับแก้ไข)" rows={2} className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-teal-600" /><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => review("APPROVE")} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">อนุมัติ</button><button type="button" disabled={busy} onClick={() => review("REQUEST_REVISION")} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50">ส่งกลับแก้ไข</button></div>{error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}</div>;
}
