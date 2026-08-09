import { JaDeleteButton } from "@/components/ja/ja-delete-button";

type JaCard = {
  id: string;
  workTitle: string;
  description: string;
  location: string | null;
  competency: string | null;
  startAtLabel: string;
  endAtLabel: string;
  totalHours: string;
  hoursPerWeek: string;
};

type TopicRow = {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  hoursPerWeek: string | null;
  children: Array<{
    id: string;
    code: string | null;
    title: string;
    description: string | null;
  }>;
  jas: JaCard[];
};

function JaBlock({ ja }: { ja: JaCard }) {
  return (
    <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <dl className="min-w-0 flex-1 space-y-1 text-sm text-stone-800">
          <div><span className="text-stone-500">ชื่องาน: </span>{ja.workTitle}</div>
          <div><span className="text-stone-500">รายละเอียด: </span>{ja.description}</div>
          {ja.location ? <div><span className="text-stone-500">สถานที่: </span>{ja.location}</div> : null}
          {ja.competency ? (
            <div><span className="text-stone-500">ความรู้/ทักษะ/สมรรถนะ: </span>{ja.competency}</div>
          ) : null}
          <div><span className="text-stone-500">เริ่ม: </span>{ja.startAtLabel}</div>
          <div><span className="text-stone-500">สิ้นสุด: </span>{ja.endAtLabel}</div>
          <div><span className="text-stone-500">ชั่วโมง: </span>{ja.totalHours}</div>
        </dl>
        <div className="flex flex-col items-end gap-2">
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-stone-600">
            ชม./สัปดาห์ {ja.hoursPerWeek}
          </span>
          <JaDeleteButton id={ja.id} workTitle={ja.workTitle} />
        </div>
      </div>
    </div>
  );
}

export function JaTorFormSection({
  label,
  title,
  topics,
}: {
  label: string;
  title: string;
  topics: TopicRow[];
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200">
      <div className="border-b border-stone-200 bg-stone-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-stone-900">{label}</h3>
        {title && title !== label ? <p className="mt-0.5 text-sm text-stone-600">{title}</p> : null}
      </div>

      <div className="hidden grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)_4.5rem] gap-0 border-b border-stone-200 bg-stone-100 text-xs font-medium text-stone-600 md:grid">
        <div className="px-3 py-2">ภาระงาน/ลักษณะงานที่ปฏิบัติ (TOR)</div>
        <div className="border-l border-stone-200 px-2 py-2 text-center">ชม./สัปดาห์</div>
        <div className="border-l border-stone-200 px-3 py-2">ผลการปฏิบัติงานจริง (JA)</div>
        <div className="border-l border-stone-200 px-2 py-2 text-center">ชม./สัปดาห์</div>
      </div>

      <div className="divide-y divide-stone-100">
        {topics.length ? (
          topics.map((topic) => (
            <div
              key={topic.id}
              className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)_4.5rem] md:gap-0"
            >
              <div className="md:pr-3">
                <p className="text-sm font-medium text-stone-900">
                  {topic.code ? <span className="mr-1 text-teal-700">{topic.code}</span> : null}
                  {topic.title}
                </p>
                {topic.description ? (
                  <p className="mt-1 text-xs leading-5 text-stone-500">{topic.description}</p>
                ) : null}
                {topic.children.length ? (
                  <ul className="mt-2 space-y-1 border-l-2 border-teal-100 pl-3 text-xs text-stone-600">
                    {topic.children.map((child) => (
                      <li key={child.id}>
                        {child.code ? <span className="mr-1 font-medium text-teal-700">{child.code}</span> : null}
                        {child.title}
                        {child.description ? (
                          <span className="mt-0.5 block text-stone-500">{child.description}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="text-sm text-stone-700 md:border-l md:border-stone-100 md:px-2 md:pt-0.5 md:text-center">
                <span className="md:hidden text-xs text-stone-500">ชม./สัปดาห์ TOR: </span>
                {topic.hoursPerWeek ?? "-"}
              </div>
              <div className="space-y-2 md:border-l md:border-stone-100 md:px-3">
                {topic.jas.length ? (
                  topic.jas.map((ja) => <JaBlock key={ja.id} ja={ja} />)
                ) : (
                  <p className="text-xs text-stone-400">ยังไม่มีผลการปฏิบัติงานจริง</p>
                )}
              </div>
              <div className="text-sm text-stone-700 md:border-l md:border-stone-100 md:px-2 md:pt-0.5 md:text-center">
                <span className="md:hidden text-xs text-stone-500">ชม./สัปดาห์ JA: </span>
                0
              </div>
            </div>
          ))
        ) : (
          <p className="p-4 text-sm text-stone-500">ยังไม่มีหัวข้อในหมวดนี้</p>
        )}
      </div>
    </section>
  );
}
