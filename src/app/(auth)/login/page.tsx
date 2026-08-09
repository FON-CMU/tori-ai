import Link from "next/link";

const errorMessages: Record<string, string> = {
  invalid_callback: "การยืนยันตัวตนไม่สำเร็จ (state ไม่ตรง) กรุณาลองใหม่",
  entra_not_configured: "ยังไม่ได้ตั้งค่า Microsoft Entra ในระบบ",
  entra_start_failed: "เริ่มเข้าสู่ระบบ Microsoft ไม่สำเร็จ",
  entra_callback_failed: "ยืนยันตัวตนกับ Microsoft ไม่สำเร็จ",
  cmu_not_configured: "ยังไม่ได้ตั้งค่า CMU Account",
  cmu_start_failed: "เริ่มเข้าสู่ระบบ CMU ไม่สำเร็จ",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const cmuReady = Boolean(
    process.env.CMU_CLIENT_ID
    && process.env.CMU_CLIENT_SECRET
    && process.env.CMU_ISSUER
    && process.env.CMU_REDIRECT_URI,
  );
  const entraReady = Boolean(
    process.env.ENTRA_TENANT_ID
    && process.env.ENTRA_CLIENT_ID
    && process.env.ENTRA_CLIENT_SECRET
    && process.env.ENTRA_REDIRECT_URI,
  );
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
              ยังไม่ได้ตั้งค่า Microsoft Entra หรือ CMU Account — ในโหมดพัฒนาใช้บัญชีสาธิตได้
            </p>
          ) : null}

          {process.env.NODE_ENV === "development" ? (
            <form action="/api/auth/mock" method="post">
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
