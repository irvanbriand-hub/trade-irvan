import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { WrScannerItem } from "@/hooks/useWrScanner";

interface ComboStat {
  key: string;
  total: number;
  win: number;
  lose: number;
  winRate: number;
  avgPctWin: number;
  lastDate: string | null;
}

function generateCombinations(arr: string[]): string[][] {
  const result: string[][] = [];
  const sorted = [...arr].sort();
  for (let size = 1; size <= sorted.length; size++) {
    const combine = (start: number, combo: string[]) => {
      if (combo.length === size) {
        result.push([...combo]);
        return;
      }
      for (let i = start; i < sorted.length; i++) {
        combo.push(sorted[i]);
        combine(i + 1, combo);
        combo.pop();
      }
    };
    combine(0, []);
  }
  return result;
}

/** Pre-compute all combination stats from historical wr_scanner data */
export function useWrComboStats(wrData: WrScannerItem[]) {
  return useMemo(() => {
    const backtested = wrData.filter(d => d.status === "WIN" || d.status === "LOSE");
    const map: Record<string, ComboStat> = {};

    for (const item of backtested) {
      const screeners = item.screener_names;
      if (!screeners.length) continue;
      const combos = generateCombinations(screeners);

      for (const combo of combos) {
        const key = combo.join(" + ");
        if (!map[key]) {
          map[key] = { key, total: 0, win: 0, lose: 0, winRate: 0, avgPctWin: 0, lastDate: null };
        }
        const stat = map[key];
        stat.total++;
        if (item.status === "WIN") {
          stat.win++;
          stat.avgPctWin += (item.pct_open_to_high ?? 0);
        } else {
          stat.lose++;
        }
        // Track latest date
        const date = item.tanggal_backtest || item.tanggal_import;
        if (!stat.lastDate || date > stat.lastDate) stat.lastDate = date;
      }
    }

    // Finalize averages
    for (const stat of Object.values(map)) {
      stat.winRate = stat.total > 0 ? (stat.win / stat.total) * 100 : 0;
      stat.avgPctWin = stat.win > 0 ? stat.avgPctWin / stat.win : 0;
    }

    return map;
  }, [wrData]);
}

interface Props {
  /** Screener names that detected this stock in current scan */
  screenerNames: string[];
  /** Pre-computed combo stats map */
  comboStats: Record<string, ComboStat>;
}

export function WrHistorisBadges({ screenerNames, comboStats }: Props) {
  const badges = useMemo(() => {
    if (!screenerNames.length) return [];

    const combos = generateCombinations(screenerNames);
    // Sort longest combo first (triple → double → single)
    combos.sort((a, b) => b.length - a.length);

    return combos.map(combo => {
      const key = combo.join(" + ");
      const stat = comboStats[key];
      return { key, combo, stat: stat || null };
    });
  }, [screenerNames, comboStats]);

  if (badges.length === 0) {
    return <span className="text-[9px] text-muted-foreground">—</span>;
  }

  const hasAnyData = badges.some(b => b.stat);
  if (!hasAnyData) {
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
        Belum ada data historis
      </span>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-wrap gap-1">
        {badges.map(({ key, stat }) => {
          if (!stat) {
            return (
              <span key={key} className="text-[8px] px-1 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">
                {key} | 0x
              </span>
            );
          }

          const badgeColor =
            stat.winRate >= 70
              ? "bg-gain/15 text-gain border-gain/30"
              : stat.winRate >= 50
              ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30"
              : "bg-loss/15 text-loss border-loss/30";

          return (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "text-[8px] px-1.5 py-0.5 rounded border font-medium cursor-default whitespace-nowrap",
                    badgeColor
                  )}
                >
                  {key} | {stat.total}x | WR {stat.winRate.toFixed(0)}%
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs space-y-1 max-w-xs">
                <p className="font-semibold">{key}</p>
                <p>Total muncul: {stat.total} kali</p>
                <p>WIN: {stat.win} | LOSE: {stat.lose}</p>
                <p>Win Rate: {stat.winRate.toFixed(1)}%</p>
                <p>Avg % gain saat WIN: {stat.avgPctWin.toFixed(2)}%</p>
                {stat.lastDate && <p>Terakhir muncul: {stat.lastDate}</p>}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
