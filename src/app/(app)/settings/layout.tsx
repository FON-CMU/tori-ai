import Link from "next/link";

import { UserProfileCard } from "@/components/auth/user-profile-card";
import { SettingsNav } from "@/components/settings/settings-nav";
import { requirePageSession } from "@/lib/auth/session";
import { getCurrentUserProfile } from "@/server/services/user-profile-service";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageSession();
  const profile = await getCurrentUserProfile(session);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-5 py-6 md:flex-row md:gap-8 md:py-8">
      <aside className="w-full shrink-0 md:w-64">
        <div className="sticky top-6 space-y-6">
          <div>
            <Link href="/chat" className="text-sm font-medium text-teal-700 hover:text-teal-800">
              ← กลับไปแชท
            </Link>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">ตั้งค่า</h1>
            <p className="mt-1 text-sm text-stone-500">จัดการ TOR งาน และระบบ</p>
          </div>

          <UserProfileCard
            displayName={profile.displayName}
            email={profile.email}
            position={profile.position}
            unitName={profile.unitName}
            isAdmin={profile.isAdmin}
          />

          <SettingsNav isAdmin={profile.isAdmin} />

          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-left text-sm text-stone-600 hover:bg-stone-50"
            >
              ออกจากระบบ
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 pb-10">{children}</main>
    </div>
  );
}
