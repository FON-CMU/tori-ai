"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/settings/tor", label: "TOR ของฉัน", description: "อัปโหลดและจัดการเอกสาร TOR" },
  { href: "/settings/ja", label: "รายการงาน", description: "ดูงานที่บันทึกแล้ว" },
  { href: "/settings/dashboard", label: "ภาพรวม", description: "สรุปชั่วโมงและหมวดงาน" },
] as const;

export function SettingsNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  function itemClass(href: string) {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return active
      ? "block rounded-xl bg-teal-50 px-3 py-2.5 ring-1 ring-teal-100"
      : "block rounded-xl px-3 py-2.5 hover:bg-stone-50";
  }

  return (
    <nav className="space-y-1 rounded-2xl border border-stone-200 bg-white p-2">
      {navItems.map((item) => (
        <Link key={item.href} href={item.href} className={itemClass(item.href)}>
          <span className="block text-sm font-medium text-stone-800">{item.label}</span>
          <span className="mt-0.5 block text-xs text-stone-500">{item.description}</span>
        </Link>
      ))}
      {isAdmin ? (
        <Link href="/settings/ai" className={itemClass("/settings/ai")}>
          <span className="block text-sm font-medium text-stone-800">AI ของระบบ</span>
          <span className="mt-0.5 block text-xs text-stone-500">ตั้งค่า provider และ model (admin)</span>
        </Link>
      ) : null}
    </nav>
  );
}
