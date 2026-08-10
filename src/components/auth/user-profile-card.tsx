type ProfileCardProps = {
  displayName: string;
  email: string;
  position: string | null;
  unitName: string;
  isAdmin: boolean;
  compact?: boolean;
  /** ไม่มีกรอบนอก — ใช้เมื่ออยู่ในการ์ดโปรไฟล์รวม */
  bare?: boolean;
};

export function UserProfileCard({
  displayName,
  email,
  position,
  unitName,
  isAdmin,
  compact = false,
  bare = false,
}: ProfileCardProps) {
  const initials = displayName
    .replace(/\s+/g, "")
    .slice(0, 2)
    .toUpperCase() || "?";

  if (compact) {
    return (
      <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-teal-700 text-[11px] font-semibold text-white">
          {initials}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-[var(--apple-ink,#1d1d1f)]">
            {displayName}
          </span>
          <span className="block truncate text-[11px] text-[var(--apple-muted,#86868b)]">
            {isAdmin ? "ADMIN · " : ""}{email}
          </span>
        </span>
      </div>
    );
  }

  const body = (
    <div className="flex items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-teal-700 text-sm font-semibold text-white">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-stone-900">{displayName}</p>
        <p className="mt-0.5 truncate text-xs text-stone-500">{email}</p>
        {position ? <p className="mt-1 truncate text-xs text-stone-600">{position}</p> : null}
        {unitName ? <p className="mt-0.5 truncate text-xs text-stone-500">{unitName}</p> : null}
        {isAdmin ? (
          <span className="mt-2 inline-flex rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-800">
            ADMIN
          </span>
        ) : null}
      </div>
    </div>
  );

  if (bare) return body;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      {body}
    </div>
  );
}
