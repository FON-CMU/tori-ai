import { JaExportButtons } from "@/components/ja/ja-export-buttons";
import { requirePageSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const categoryLabel = {
  ROUTINE: "งานประจำ",
  ASSIGNED: "งานที่ได้รับมอบหมาย",
  DEVELOPMENT: "งานเชิงพัฒนา",
} as const;

export default async function SettingsJaPage() {
  const { userId } = await requirePageSession();
  const rows = await prisma.jaRecord.findMany({
    where: { userId },
    orderBy: { startAt: "desc" },
    take: 50,
    include: {
      torTopic: { select: { title: true } },
    },
  });

  return (
    <section>
      <p className="text-sm font-medium text-teal-700">งาน</p>
      <h1 className="mt-2 text-3xl font-semibold">รายการปฏิบัติงาน</h1>
      <p className="mt-2 text-stone-600">
        งานที่บันทึกผ่าน TORI สามารถส่งออกเป็นแบบฟอร์ม Word หรือ PDF ได้
      </p>
      <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {rows.length ? (
          rows.map((row) => (
            <article
              key={row.id}
              className="flex flex-col gap-3 border-b border-stone-100 p-5 last:border-0 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-stone-900">{row.workTitle}</strong>
                  <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600">
                    {categoryLabel[row.category]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-stone-500">
                  {row.runningNumber} ·{" "}
                  {row.startAt.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })} ·{" "}
                  {row.totalHours.toString()} ชม.
                </p>
                {row.torTopic ? (
                  <p className="mt-1 text-xs text-stone-500">TOR: {row.torTopic.title}</p>
                ) : null}
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-600">{row.description}</p>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-stone-500">
                  ผลลัพธ์: {row.result}
                </p>
              </div>
              <JaExportButtons id={row.id} runningNumber={row.runningNumber} />
            </article>
          ))
        ) : (
          <p className="p-8 text-center text-stone-500">ยังไม่มีรายการงาน</p>
        )}
      </div>
    </section>
  );
}
