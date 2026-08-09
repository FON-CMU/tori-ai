import Link from "next/link";

import { env } from "@/lib/env";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const cmuReady = Boolean(env.CMU_CLIENT_ID && env.CMU_CLIENT_SECRET && env.CMU_ISSUER && env.CMU_REDIRECT_URI);
  const isDevelopment = env.NODE_ENV === "development";
  // Must match the route's own gate exactly, or a half-configured deployment
  // renders a form whose every submission lands on a bare 404.
  const showDemoLogin = isDevelopment || (env.ALLOW_MOCK_LOGIN && Boolean(env.MOCK_LOGIN_PASSWORD));
  const error = (await searchParams).error;

  return (
    <main className="grid min-h-screen place-items-center bg-stone-50 px-6">
      <section className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-xl shadow-stone-200/50">
        <p className="text-sm font-bold tracking-[.25em] text-teal-700">TORI</p>
        <h1 className="mt-3 text-3xl font-semibold text-stone-900">ผู้ช่วยงานที่เข้าใจ TOR ของคุณ</h1>
        <p className="mt-3 text-stone-600">เข้าสู่ระบบเพื่อบันทึกและสรุปการปฏิบัติงานอย่างเป็นระบบ</p>

        {error ? (
          <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่</p>
        ) : null}

        {cmuReady ? (
          <Link
            className="mt-8 block rounded-xl bg-teal-700 px-5 py-3 text-center font-medium text-white hover:bg-teal-800"
            href="/api/auth/login"
          >
            เข้าสู่ระบบด้วย CMU Account
          </Link>
        ) : (
          <p className="mt-6 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            CMU Account ยังไม่ได้ตั้งค่าครบ กรุณาใช้บัญชีสาธิตชั่วคราว
          </p>
        )}

        {showDemoLogin ? (
          <form action="/api/auth/mock" method="post" className="mt-3">
            {isDevelopment ? null : (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <p className="font-semibold">⚠️ โหมดทดสอบ</p>
                <p className="mt-1">
                  เข้าสู่ระบบชั่วคราวโดยไม่ผ่าน CMU Account และได้สิทธิ์ผู้ดูแลระบบ ต้องปิดก่อนใช้งานจริง
                </p>
                <input
                  className="mt-3 h-11 w-full rounded-xl border border-red-300 bg-white px-3 text-stone-900 outline-none focus:border-red-500"
                  type="password"
                  name="password"
                  required
                  autoComplete="off"
                  placeholder="รหัสผ่านโหมดทดสอบ"
                />
              </div>
            )}
            <button className="w-full rounded-xl bg-teal-700 px-5 py-3 font-medium text-white hover:bg-teal-800">
              เข้าใช้บัญชีสาธิต
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
