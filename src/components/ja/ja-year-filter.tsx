"use client";

import { useRouter } from "next/navigation";

export function JaYearFilter({
  years,
  selectedYear,
}: {
  years: number[];
  selectedYear: number | null;
}) {
  const router = useRouter();

  if (!years.length) return null;

  return (
    <label className="flex items-center gap-2 text-sm text-stone-600">
      <span>แสดงปี พ.ศ.</span>
      <select
        value={selectedYear ?? years[0]}
        onChange={(event) => {
          const year = Number(event.target.value);
          router.push(`/settings/ja?year=${year}`);
        }}
        className="h-9 rounded-lg border border-stone-300 bg-white px-2 text-sm outline-none focus:border-teal-600"
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </label>
  );
}
