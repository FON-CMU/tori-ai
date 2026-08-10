import Link from "next/link";

import { env } from "@/lib/env";

const errorMessages: Record<string, string> = {
  invalid_callback: "การยืนยันตัวตนไม่สำเร็จ (state ไม่ตรง) กรุณาลองใหม่",
  entra_not_configured: "ยังไม่ได้ตั้งค่า Microsoft Entra ในระบบ",
  entra_start_failed: "เริ่มเข้าสู่ระบบ Microsoft ไม่สำเร็จ",
  entra_callback_failed: "ยืนยันตัวตนกับ Microsoft ไม่สำเร็จ",
  cmu_not_configured: "ยังไม่ได้ตั้งค่า CMU Account",
  cmu_start_failed: "เริ่มเข้าสู่ระบบ CMU ไม่สำเร็จ",
};

/**
 * ทุกค่าอ่านผ่าน env ไม่ใช่ process.env.X ตรง ๆ เพราะ Next แทนค่า process.env.X
 * ที่อ้างถึงแบบตายตัวตั้งแต่ตอน build — แก้ค่าในแดชบอร์ด Vercel แล้วหน้านี้จะ
 * ไม่รู้จนกว่าจะ deploy ใหม่ ส่วน env.ts อ่าน process.env ทั้งก้อนจึงเป็นค่า runtime จริง
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const cmuReady = Boolean(
    env.CMU_CLIENT_ID && env.CMU_CLIENT_SECRET && env.CMU_ISSUER && env.CMU_REDIRECT_URI,
  );
  const entraReady = Boolean(
    env.ENTRA_TENANT_ID && env.ENTRA_CLIENT_ID && env.ENTRA_CLIENT_SECRET && env.ENTRA_REDIRECT_URI,
  );
  const isDevelopment = env.NODE_ENV === "development";
  // Must match the route's own gate exactly, or a half-configured deployment
  // renders a form whose every submission lands on a bare 404.
  const showDemoLogin = isDevelopment || (env.ALLOW_MOCK_LOGIN && Boolean(env.MOCK_LOGIN_PASSWORD));
  const error = (await searchParams).error;
  const errorText = error
    ? (errorMessages[error] ?? "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่")
    : null;

  return (
    <main className="grid min-h-screen place-items-center bg-stone-50 px-6">
      <section className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-xl shadow-stone-200/50">
        <p className="text-sm font-bold tracking-[.25em] text-teal-700">TORI</p>
        <h1 className="mt-3 text-3xl font-semibold text-stone-900">
          ผู้ช่วยงานที่เข้าใจ TOR ของคุณ
        </h1>
        <p className="mt-3 text-stone-600">
          เข้าสู่ระบบเพื่อบันทึกและสรุปการปฏิบัติงานอย่างเป็นระบบ — TOR ของแต่ละบัญชีแยกกัน
        </p>

        {errorText ? (
          <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{errorText}</p>
        ) : null}

        <div className="mt-8 space-y-3">
          {entraReady ? (
            <Link
              className="block rounded-xl bg-[#2F2F2F] px-5 py-3 text-center font-medium text-white hover:bg-black"
              href="/api/auth/entra/login"
            >
              เข้าสู่ระบบด้วย Microsoft
            </Link>
          ) : null}

          {cmuReady ? (
            <Link
              className="block rounded-xl bg-teal-700 px-5 py-3 text-center font-medium text-white hover:bg-teal-800"
              href="/api/auth/login"
            >
              เข้าสู่ระบบด้วย CMU Account
            </Link>
          ) : null}

          {!entraReady && !cmuReady ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              ยังไม่ได้ตั้งค่า Microsoft Entra หรือ CMU Account — ใช้บัญชีสาธิตชั่วคราวไปก่อน
            </p>
          ) : null}

          {showDemoLogin ? (
            <form action="/api/auth/mock" method="post">
              {isDevelopment ? null : (
                <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <p className="font-semibold">⚠️ โหมดทดสอบ</p>
                  <p className="mt-1">
                    เข้าสู่ระบบชั่วคราวโดยไม่ผ่าน Microsoft หรือ CMU Account และได้สิทธิ์ผู้ดูแลระบบ ต้องปิดก่อนใช้งานจริง
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
              <button className="w-full rounded-xl border border-stone-200 bg-white px-5 py-3 font-medium text-stone-800 hover:bg-stone-50">
                เข้าใช้บัญชีสาธิต
              </button>
            </form>
          ) : null}
        </div>

        <p className="mt-6 text-center text-xs text-stone-500">
          ตั้งค่า AI ของระบบได้เฉพาะผู้ดูแล (ADMIN)
        </p>
      </section>
    </main>
  );
}
