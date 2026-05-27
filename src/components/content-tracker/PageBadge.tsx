import { PlatformIcon } from "./PlatformIcon";

interface PageBadgeProps {
  platform: string;
  name?: string | null;
  color?: string | null;
  showName?: boolean;
  className?: string;
}

// Chip kecil: dot warna + logo platform + (opsional) nama page
export function PageBadge({ platform, name, color, showName = true, className = "" }: PageBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${className}`}>
      {color && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />}
      <PlatformIcon platform={platform} size={14} />
      {showName && name && <span className="truncate font-medium text-foreground">{name}</span>}
    </span>
  );
}
