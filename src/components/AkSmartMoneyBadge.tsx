import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AkSmartMoneyBadge as BadgeData } from "@/hooks/useAkSmartMoney";

const formatVal = (v: number | null) => {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `Rp ${(v / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `Rp ${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `Rp ${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `Rp ${(v / 1e3).toFixed(0)}K`;
  return `Rp ${v.toLocaleString("id-ID")}`;
};

export function AkSmartMoneyBadgeComponent({ data }: { data: BadgeData | null }) {
  if (!data || data.badgeType === "none") return null;

  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge className={`${data.badgeColor} text-[8px] whitespace-nowrap`}>
          {data.badgeLabel}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="text-xs space-y-1 max-w-[220px]">
        <p className="font-semibold">{data.ticker} — Smart Money</p>
        <p>AK Buy: {formatVal(data.buyValue)}</p>
        <p>AK Sell: {formatVal(data.sellValue)}</p>
        <p>Net: {data.netValue > 0 ? "+" : ""}{formatVal(data.netValue)}</p>
        {data.pctOfMarket > 0 && (
          <p>vs Saham: {data.pctOfMarket.toFixed(2)}% → {data.tagVsSaham}</p>
        )}
        <p>vs Avg AK: {data.ratio.toFixed(1)}x → {data.tagVsAk}</p>
        <p>Streak: {data.streakBeli > 0 ? `${data.streakBeli}h↑` : data.streakJual > 0 ? `${data.streakJual}h↓` : "—"}</p>
        <p>Score: {data.score}/100</p>
        <p className="text-muted-foreground">Data: {data.tanggal}</p>
        {data.hasBandar && <p className="text-yellow-400 font-semibold">🎯 Confluence AK + Bandar Tier {data.bandarTier}</p>}
        {data.valueSource === "FALLBACK_HARDCODED" && (
          <p className="text-yellow-500">⚠️ Data market tidak tersedia, menggunakan estimasi</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
