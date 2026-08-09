import { requirePageSession } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requirePageSession();
  return <div className="min-h-screen bg-[var(--apple-bg,#f5f5f7)] text-[var(--apple-ink,#1d1d1f)]">{children}</div>;
}
