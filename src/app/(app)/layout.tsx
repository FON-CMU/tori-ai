import { requirePageSession } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requirePageSession();
  return <div className="min-h-screen bg-[#f7f6f1] text-stone-900">{children}</div>;
}
