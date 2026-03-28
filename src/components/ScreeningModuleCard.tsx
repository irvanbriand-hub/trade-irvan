import { type ScreeningModule } from "@/data/mockStocks";
import {
  Activity, ShieldCheck, GitBranch, CornerRightUp, BarChart2, CornerLeftDown, Rocket
} from "lucide-react";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  activity: Activity,
  "shield-check": ShieldCheck,
  "git-branch": GitBranch,
  "corner-right-up": CornerRightUp,
  "bar-chart-2": BarChart2,
  "corner-left-down": CornerLeftDown,
  rocket: Rocket,
};

interface Props {
  module: ScreeningModule;
  isActive: boolean;
  onClick: () => void;
  matchCount?: number;
  isTechnical?: boolean;
  hasScanData?: boolean;
}

export function ScreeningModuleCard({ module, isActive, onClick, matchCount, hasScanData }: Props) {
  const Icon = iconMap[module.icon] || Activity;
  const displayCount = hasScanData && matchCount !== undefined ? matchCount : (hasScanData ? 0 : null);

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative w-full text-left rounded-lg border p-3 transition-all duration-200",
        "hover:border-primary/40",
        isActive
          ? "border-primary/60 bg-primary/5"
          : "border-border bg-card"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
        <span
          className={cn(
            "font-mono text-xs font-bold px-1.5 py-0.5 rounded-full ml-auto shrink-0",
            displayCount === null
              ? "bg-muted text-muted-foreground"
              : displayCount > 0
                ? "bg-gain/10 text-gain"
                : "bg-muted text-muted-foreground"
          )}
        >
          {displayCount === null ? "—" : displayCount}
        </span>
      </div>
      <h3 className="font-semibold text-xs text-foreground truncate">{module.title}</h3>
      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{module.description}</p>
    </button>
  );
}
