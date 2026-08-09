import { TorAnalyzeButton } from "@/components/tor/tor-analyze-button";
import { TorDeleteButton } from "@/components/tor/tor-delete-button";
import { TorOutline } from "@/components/tor/tor-outline";
import { TorProcessButton } from "@/components/tor/tor-process-button";
import { TorUploader } from "@/components/tor/tor-uploader";
import { TorYearSelect } from "@/components/tor/tor-year-select";
import { requirePageSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const statusLabel = {
  UPLOADED: "รอประมวลผล",
  PROCESSING: "กำลังประมวลผล",
  REVIEW_REQUIRED: "รอตรวจทาน",
  ACTIVE: "ใช้งานอยู่",
  FAILED: "ประมวลผลไม่สำเร็จ",
  ARCHIVED: "เก็บถาวร",
} as const;

export default async function SettingsTorPage() {
  const { userId } = await requirePageSession();
  const docs = await prisma.torDocument.findMany({
    where: { userId },
    orderBy: [{ year: "desc" }, { version: "desc" }],
    include: {
      topics: { orderBy: [{ sortOrder: "asc" }, { title: "asc" }] },
      pages: { orderBy: { pageNumber: "asc" } },
    },
  });

  return (
    <section>
      <p className="text-sm font-medium text-teal-700">เอกสาร</p>
      <h1 className="mt-2 text-3xl font-semibold">TOR ของฉัน</h1>
      <p className="mt-2 text-stone-600">
        อัปโหลดแล้วระบบจะอ่านโครงตามฟอร์มในไฟล์ (หมวด → หัวข้อภาระงาน → รายการย่อย + ชม./สัปดาห์)
        เพื่อใช้จับคู่บันทึก JA ในหน้าแชท
      </p>
      <TorUploader maxSizeMb={env.MAX_TOR_FILE_SIZE_MB} />
      <div className="mt-6 space-y-4">
        {docs.map((doc) => {
          const hasPages = doc.pages.length > 0;
          const hasTopics = doc.topics.length > 0;
          const matchableCount = doc.topics.filter((topic) => topic.matchable).length;
          const needsAnalyze = hasPages && !hasTopics;
          const needsProcess = !hasPages || ["UPLOADED", "FAILED"].includes(doc.status);

          return (
            <article key={doc.id} className="rounded-2xl border border-stone-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="truncate">{doc.fileName}</strong>
                    <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600">
                      พ.ศ. {doc.year}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-stone-500">
                    เวอร์ชัน {doc.version} · {doc.pages.length} หน้า · {matchableCount} หัวข้อจับคู่ JA ·{" "}
                    {doc.createdAt.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs ${
                      doc.status === "FAILED"
                        ? "bg-red-50 text-red-700"
                        : doc.status === "REVIEW_REQUIRED"
                          ? "bg-amber-50 text-amber-700"
                          : doc.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-teal-50 text-teal-700"
                    }`}
                  >
                    {statusLabel[doc.status]}
                  </span>
                  <TorDeleteButton id={doc.id} fileName={doc.fileName} />
                </div>
              </div>

              {doc.status === "ACTIVE" && hasTopics ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-medium text-emerald-950">TOR พร้อมใช้ในแชทแล้ว</p>
                  <p className="mt-1 text-sm text-emerald-900/80">
                    ไปที่หน้าแชทเพื่อเล่างาน แล้วให้ TORI จับคู่หัวข้อตามฟอร์มด้านล่างและบันทึกเป็น JA
                  </p>
                </div>
              ) : null}

              {needsAnalyze ? (
                <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-medium text-blue-900">ขั้นถัดไป: วิเคราะห์โครง TOR ด้วย AI</p>
                  <p className="mt-1 text-sm text-blue-800/80">
                    อ่านข้อความจากเอกสารแล้ว แต่ยังแยกโครงไม่สำเร็จ กดปุ่มด้านล่างเพื่อลองอีกครั้ง
                  </p>
                  <div className="mt-3">
                    <TorAnalyzeButton id={doc.id} />
                  </div>
                </div>
              ) : null}

              {needsProcess && !needsAnalyze ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-medium text-amber-900">
                    {hasPages ? "ประมวลผลเอกสารอีกครั้ง" : "ยังไม่มีข้อความจากเอกสาร"}
                  </p>
                  <p className="mt-1 text-sm text-amber-800/80">
                    ระบบจะอ่านไฟล์แล้วแยกโครงตามฟอร์มด้วย AI อัตโนมัติ
                  </p>
                  <div className="mt-3">
                    <TorProcessButton id={doc.id} />
                  </div>
                </div>
              ) : null}

              <div className="mt-4">
                <TorYearSelect id={doc.id} year={doc.year} />
              </div>

              {doc.processingError ? (
                <p
                  className={`mt-3 rounded-xl p-3 text-sm ${
                    doc.status === "FAILED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {doc.processingError}
                </p>
              ) : null}

              {hasTopics ? (
                <div className="mt-5 border-t border-stone-100 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">โครง TOR ตามฟอร์มในไฟล์</h3>
                    {doc.status !== "ACTIVE" ? <TorAnalyzeButton id={doc.id} /> : null}
                  </div>
                  <div className="mt-3">
                    <TorOutline topics={doc.topics} />
                  </div>
                </div>
              ) : hasPages ? (
                <details className="mt-4 rounded-xl bg-stone-50 p-3">
                  <summary className="cursor-pointer text-sm font-medium">ข้อความที่อ่านได้จากเอกสาร</summary>
                  <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-stone-600">
                    {doc.pages.map((page) => page.extractedText).join("\n\n")}
                  </p>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
