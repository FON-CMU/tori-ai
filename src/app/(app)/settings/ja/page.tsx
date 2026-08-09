import { JaTorFormSection } from "@/components/ja/ja-tor-form-section";
import { TorJaExportButtons } from "@/components/ja/tor-ja-export-buttons";
import { requirePageSession } from "@/lib/auth/session";
import { sumJaHours } from "@/lib/report/ja-hours";
import {
  listJaReportDocuments,
  loadJaReportDocument,
} from "@/server/services/ja-report-service";

export default async function SettingsJaPage() {
  const { userId } = await requirePageSession();
  const docs = await listJaReportDocuments(userId);
  const reports = await Promise.all(docs.map((doc) => loadJaReportDocument(userId, doc.id)));

  return (
    <section>
      <p className="text-sm font-medium text-teal-700">งาน</p>
      <h1 className="mt-2 text-3xl font-semibold">รายงานผลการปฏิบัติงานจริง</h1>
      <p className="mt-2 max-w-3xl text-stone-600">
        แสดงทั้งฉบับตามฟอร์ม TOR — ซ้ายคือภาระงานตาม TOR ขวาคือผลการปฏิบัติงานจริง (JA)
        ช่องขวาสุดคือผลรวมชั่วโมงจริงของ JA ในหัวข้อนั้น และส่งออกได้ทั้งฉบับเป็น Word/PDF
      </p>

      <div className="mt-6 space-y-8">
        {reports.length ? (
          reports.map((report) => (
            <article key={report.id} className="rounded-2xl border border-stone-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-stone-900">{report.fileName}</h2>
                  <p className="mt-1 text-sm text-stone-500">
                    พ.ศ. {report.year} · {report.sections.reduce((sum, section) => sum + section.topics.length, 0)}{" "}
                    หัวข้อ TOR ·{" "}
                    {report.sections.reduce(
                      (sum, section) => sum + section.topics.reduce((inner, topic) => inner + topic.jas.length, 0),
                      0,
                    ) + report.orphanJas.length}{" "}
                    รายการ JA
                  </p>
                </div>
                <TorJaExportButtons torDocumentId={report.id} year={report.year} />
              </div>

              <div className="mt-5 space-y-5">
                {report.sections.map((section) => (
                  <JaTorFormSection
                    key={section.key}
                    label={section.label}
                    title={section.title}
                    topics={section.topics.map((topic) => ({
                      id: topic.id,
                      code: topic.code,
                      title: topic.title,
                      description: topic.description,
                      hoursPerWeek: topic.hoursPerWeek,
                      jaHours: sumJaHours(topic.jas),
                      children: topic.children.map((child) => ({
                        id: child.id,
                        code: child.code,
                        title: child.title,
                        description: child.description,
                      })),
                      jas: topic.jas,
                    }))}
                  />
                ))}

                {report.orphanJas.length ? (
                  <JaTorFormSection
                    label="รายการที่ยังไม่ผูกหัวข้อ TOR"
                    title=""
                    topics={[
                      {
                        id: `${report.id}-orphan`,
                        code: null,
                        title: "ยังไม่ระบุหัวข้อตาม TOR",
                        description: null,
                        hoursPerWeek: null,
                        jaHours: sumJaHours(report.orphanJas),
                        children: [],
                        jas: report.orphanJas,
                      },
                    ]}
                  />
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-stone-500">
            ยังไม่มีเอกสาร TOR สำหรับสร้างรายงาน — ไปที่ตั้งค่า → TOR เพื่ออัปโหลดก่อน
          </div>
        )}
      </div>
    </section>
  );
}
