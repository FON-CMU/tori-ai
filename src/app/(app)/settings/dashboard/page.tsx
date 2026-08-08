import { requirePageSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export default async function SettingsDashboardPage() {
  const { userId } = await requirePageSession();
  const [count, hours, categories] = await Promise.all([
    prisma.jaRecord.count({ where: { userId, status: "CONFIRMED" } }),
    prisma.jaRecord.aggregate({ where: { userId, status: "CONFIRMED" }, _sum: { totalHours: true } }),
    prisma.jaRecord.groupBy({
      by: ["category"],
      where: { userId, status: "CONFIRMED" },
      _count: true,
      _sum: { totalHours: true },
    }),
  ]);

  return (
    <section>
      <p className="text-sm font-medium text-teal-700">สรุป</p>
      <h1 className="mt-2 text-3xl font-semibold">ภาพรวมงานของฉัน</h1>
      <p className="mt-2 text-stone-600">ชั่วโมงและหมวดงานที่ยืนยันแล้ว</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-teal-800 p-6 text-white">
          <p>งานที่ยืนยันแล้ว</p>
          <strong className="mt-2 block text-4xl">{count}</strong>
        </div>
        <div className="rounded-2xl bg-amber-100 p-6">
          <p>ชั่วโมงรวม</p>
          <strong className="mt-2 block text-4xl">{hours._sum.totalHours?.toString() ?? "0"}</strong>
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {categories.map((item) => (
          <div key={item.category} className="rounded-2xl border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-500">{item.category}</p>
            <strong className="mt-2 block text-2xl">{item._count} งาน</strong>
            <p>{item._sum.totalHours?.toString() ?? 0} ชั่วโมง</p>
          </div>
        ))}
      </div>
    </section>
  );
}
