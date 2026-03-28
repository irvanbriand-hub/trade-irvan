import { cn } from "@/lib/utils";
import type { DisplayMode } from "@/hooks/useEquityToggle";

interface DisplayModeToggleProps {
  mode: DisplayMode;
  onToggle: () => void;
  className?: string;
}

export function DisplayModeToggle({ mode, onToggle, className }: DisplayModeToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "inline-flex items-center rounded-md border border-border text-xs font-medium overflow-hidden h-7",
        className
      )}
    >
      <span
        className={cn(
          "px-2.5 py-1 transition-colors",
          mode === "rp" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        Rp
      </span>
      <span
        className={cn(
          "px-2.5 py-1 transition-colors",
          mode === "pct" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        %
      </span>
    </button>
  );
}
