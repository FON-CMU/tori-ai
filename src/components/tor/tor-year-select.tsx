"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { currentBuddhistYear } from "@/lib/date";

function yearOptions(center: number, current: number) {
  const years = new Set(Array.from({ length: 7 }, (_, index) => center - 3 + index));
  years.add(current);
  return [...years].sort((a, b) => a - b);
}

export function TorYearSelect({ id, year }: { id: string; year: number }) {
  const router = useRouter();
  const [value, setValue] = useState(year);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeYear(nextYear: number) {
    if (nextYear === value) return;
    setBusy(true);
    setError(null);
    const previous = value;
    setValue(nextYear);
    try {
      const response = await fetch(`/api/tor/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ year: nextYear }),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "เปลี่ยนปีไม่สำเร็จ");
      router.refresh();
    } catch (reason) {
      setValue(previous);
      setError(reason instanceof Error ? reason.message : "เปลี่ยนปีไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="flex items-center gap-2 text-sm text-stone-600">
        <span>ปี พ.ศ.</span>
        <select
          value={value}
          disabled={busy}
          onChange={(event) => changeYear(Number(event.target.value))}
          className="h-9 rounded-lg border border-stone-300 bg-white px-2 text-sm outline-none focus:border-teal-600 disabled:opacity-50"
        >
          {yearOptions(currentBuddhistYear(), year).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
