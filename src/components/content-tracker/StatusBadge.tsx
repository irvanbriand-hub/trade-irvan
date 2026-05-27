import { STATUS_META, type DerivedStatus } from "@/lib/content-tracker";

export function StatusBadge({ status, className = "" }: { status: DerivedStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${meta.badgeClass} ${className}`}
    >
      {meta.label}
    </span>
  );
}
