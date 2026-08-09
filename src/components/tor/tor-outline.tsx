const categoryLabel = {
  ROUTINE: "งานประจำ",
  ASSIGNED: "งานที่ได้รับมอบหมาย",
  DEVELOPMENT: "งานเชิงพัฒนา",
} as const;

type TorOutlineTopic = {
  id: string;
  category: keyof typeof categoryLabel;
  kind: "SECTION" | "TOPIC" | "SUBITEM";
  sectionLabel: string | null;
  code: string | null;
  title: string;
  description: string | null;
  hoursPerWeek: { toString(): string } | null;
  sortOrder: number;
  parentId: string | null;
  matchable: boolean;
};

function hoursLabel(value: TorOutlineTopic["hoursPerWeek"]) {
  if (!value) return null;
  return `${value.toString()} ชม./สัปดาห์`;
}

export function TorOutline({ topics }: { topics: TorOutlineTopic[] }) {
  const byParent = new Map<string | null, TorOutlineTopic[]>();
  for (const topic of topics) {
    const key = topic.parentId;
    const list = byParent.get(key) ?? [];
    list.push(topic);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "th"));
  }

  const roots = byParent.get(null) ?? [];
  const hasTree = topics.some((topic) => topic.kind === "SECTION" || topic.parentId);

  if (!hasTree) {
    const grouped = (Object.keys(categoryLabel) as Array<keyof typeof categoryLabel>).map((category) => ({
      category,
      items: topics.filter((topic) => topic.category === category && topic.kind === "TOPIC"),
    })).filter((group) => group.items.length);

    return (
      <div className="space-y-4">
        {grouped.map((group) => (
          <section key={group.category}>
            <h4 className="text-sm font-semibold text-teal-900">{categoryLabel[group.category]}</h4>
            <ul className="mt-2 space-y-2">
              {group.items.map((topic) => (
                <li key={topic.id} className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
                  <p className="text-sm font-medium text-stone-900">
                    {topic.code ? `${topic.code} ` : ""}
                    {topic.title}
                  </p>
                  {topic.description ? (
                    <p className="mt-1 text-xs leading-5 text-stone-500">{topic.description}</p>
                  ) : null}
                  {hoursLabel(topic.hoursPerWeek) ? (
                    <p className="mt-1 text-xs text-teal-800">{hoursLabel(topic.hoursPerWeek)}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {roots.map((section) => {
        const children = byParent.get(section.id) ?? [];
        const label = section.sectionLabel || section.title;
        return (
          <section key={section.id} className="overflow-hidden rounded-2xl border border-stone-200">
            <div className="border-b border-stone-200 bg-stone-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-teal-800">
                {categoryLabel[section.category]}
              </p>
              <h4 className="mt-1 text-sm font-semibold text-stone-900">{label}</h4>
              {section.kind === "SECTION" && section.title !== label ? (
                <p className="mt-0.5 text-sm text-stone-600">{section.title}</p>
              ) : null}
              {hoursLabel(section.hoursPerWeek) ? (
                <p className="mt-1 text-xs text-teal-800">{hoursLabel(section.hoursPerWeek)}</p>
              ) : null}
            </div>
            <div className="divide-y divide-stone-100">
              {(section.kind === "TOPIC" ? [section, ...children] : children).map((topic) => {
                if (topic.kind === "SECTION") return null;
                const subItems = byParent.get(topic.id) ?? [];
                return (
                  <div key={topic.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-900">
                          {topic.code ? (
                            <span className="mr-1.5 text-teal-700">{topic.code}</span>
                          ) : null}
                          {topic.title}
                        </p>
                        {topic.description ? (
                          <p className="mt-1 text-xs leading-5 text-stone-500">{topic.description}</p>
                        ) : null}
                      </div>
                      {hoursLabel(topic.hoursPerWeek) ? (
                        <span className="shrink-0 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-900">
                          {hoursLabel(topic.hoursPerWeek)}
                        </span>
                      ) : null}
                    </div>
                    {subItems.length ? (
                      <ul className="mt-3 space-y-2 border-l-2 border-teal-100 pl-3">
                        {subItems.map((item) => (
                          <li key={item.id}>
                            <p className="text-sm text-stone-800">
                              {item.code ? (
                                <span className="mr-1.5 font-medium text-teal-700">{item.code}</span>
                              ) : null}
                              {item.title}
                            </p>
                            {item.description ? (
                              <p className="mt-0.5 text-xs leading-5 text-stone-500">{item.description}</p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
