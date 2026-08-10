"use client";

import { useState } from "react";

export function DemoLoginForm({ defaultEmail }: { defaultEmail?: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <form
      action="/api/auth/demo"
      method="post"
      onSubmit={() => setBusy(true)}
      className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4"
    >
      <p className="text-sm font-medium text-amber-900">เข้าสู่ระบบสาธิต (ชั่วคราว)</p>
      <p className="text-xs text-amber-800">
        ใช้ระหว่างรอ Microsoft Entra / CMU OIDC พร้อมใช้งาน — ปิดเมื่อยืนยันตัวตนจริงเปิดแล้ว
      </p>
      <div>
        <label htmlFor="demo-email" className="sr-only">อีเมล</label>
        <input
          id="demo-email"
          name="email"
          type="email"
          required
          defaultValue={defaultEmail}
          autoComplete="username"
          placeholder="อีเมลสาธิต"
          className="h-11 w-full rounded-xl border border-amber-200 bg-white px-3 text-sm outline-none focus:border-amber-500"
        />
      </div>
      <div>
        <label htmlFor="demo-password" className="sr-only">รหัสผ่าน</label>
        <input
          id="demo-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="current-password"
          placeholder="รหัสผ่านสาธิต"
          className="h-11 w-full rounded-xl border border-amber-200 bg-white px-3 text-sm outline-none focus:border-amber-500"
        />
      </div>
      <button
        disabled={busy}
        className="w-full rounded-xl bg-amber-700 px-5 py-3 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-60"
      >
        {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าใช้บัญชีสาธิต"}
      </button>
    </form>
  );
}
