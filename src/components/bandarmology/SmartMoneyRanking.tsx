import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAkTracker } from "@/hooks/useAkTracker";
import { useBrokerProfiles, BrokerProfile } from "@/hooks/useBrokerProfiles";

const formatVal = (v: number | null) => {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toLocaleString("id-ID");
};

interface TickerRanking {
  ticker: string;
  brokersBuying: { broker: BrokerProfile; score: number; net: number; streak: number; tag: string; tagAk: string }[];
  brokersTotal: number;
  confluenceScore: number;
  totalNet: number;
  badge: "🔥" | "⚡" | "📊";
  badgeLabel: string;
}

export default function SmartMoneyRanking() {
  const { allBrokerData, allScores } = useAkTracker();
  const { activeBrokers } = useBrokerProfiles();
  const [minBrokers, setMinBrokers] = useState(1);
  const [dateMode, setDateMode] = useState<string>("latest");

  const uniqueDates = useMemo(() => {
    const dates = [...new Set(allBrokerData.map(d => d.tanggal))];
    return dates.sort((a, b) => b.localeCompare(a));
  }, [allBrokerData]);

  const activeDate = dateMode === "latest" ? (uniqueDates[0] || "") : dateMode;

  const rankings = useMemo(() => {
    if (!activeDate || activeBrokers.length === 0) return [];

    const dataForDate = allBrokerData.filter(d => d.tanggal === activeDate);
    const scoresForDate = allScores.filter(s => s.tanggal === activeDate);

    // Group by ticker
    const tickerMap = new Map<string, TickerRanking>();
    const allTickers = [...new Set(dataForDate.map(d => d.ticker))];

    for (const ticker of allTickers) {
      const brokersBuying: TickerRanking["brokersBuying"] = [];

      for (const broker of activeBrokers) {
        const row = dataForDate.find(d => d.ticker === ticker && d.broker_code === broker.broker_code);
        if (!row || row.net_value <= 0) continue;

        const scoreRow = scoresForDate.find(s => s.ticker === ticker && s.broker_code === broker.broker_code);
        
        let brokerScore = 0;
        if (row.net_value > 0) brokerScore += 30;
        if (scoreRow) {
          if (scoreRow.streak_beli >= 2) brokerScore += 20;
          if (scoreRow.tag_vs_saham === "WHALE" || scoreRow.tag_vs_saham === "BIG_ACCUM") brokerScore += 20;
          if (scoreRow.tag_vs_ak === "HYPERACCUM" || scoreRow.tag_vs_ak === "ACCELERATION") brokerScore += 20;
          if (scoreRow.score_total > 50) brokerScore += 10;
        }

        brokersBuying.push({
          broker,
          score: brokerScore,
          net: row.net_value,
          streak: scoreRow?.streak_beli ?? 0,
          tag: scoreRow?.tag_vs_saham ?? "NORMAL",
          tagAk: scoreRow?.tag_vs_ak ?? "NORMAL",
        });
      }

      if (brokersBuying.length === 0) continue;

      const confluenceScore = Math.round(
        brokersBuying.reduce((s, b) => s + b.score, 0) / activeBrokers.length
      );
      const totalNet = brokersBuying.reduce((s, b) => s + b.net, 0);

      let badge: TickerRanking["badge"];
      let badgeLabel: string;
      if (brokersBuying.length === activeBrokers.length) {
        badge = "🔥";
        badgeLabel = "ALL IN";
      } else if (brokersBuying.length > activeBrokers.length / 2) {
        badge = "⚡";
        badgeLabel = "MAJORITY";
      } else {
        badge = "📊";
        badgeLabel = "MINORITY";
      }

      tickerMap.set(ticker, {
        ticker,
        brokersBuying,
        brokersTotal: activeBrokers.length,
        confluenceScore,
        totalNet,
        badge,
        badgeLabel,
      });
    }

    return [...tickerMap.values()]
      .filter(r => r.brokersBuying.length >= minBrokers)
      .sort((a, b) => b.confluenceScore - a.confluenceScore);
  }, [allBrokerData, allScores, activeDate, activeBrokers, minBrokers]);

  if (activeBrokers.length < 2) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground text-sm">
          Tambahkan minimal 2 broker aktif untuk melihat Smart Money Ranking.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <Select value={dateMode} onValueChange={setDateMode}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Tanggal" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="latest">Terakhir</SelectItem>
            {uniqueDates.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Label className="text-[10px] whitespace-nowrap">Min broker beli:</Label>
          <Slider
            value={[minBrokers]}
            onValueChange={v => setMinBrokers(v[0])}
            min={1}
            max={activeBrokers.length}
            step={1}
            className="w-24"
          />
          <span className="text-xs font-mono">{minBrokers}/{activeBrokers.length}</span>
        </div>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {activeDate} — {rankings.length} saham
        </span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <Card><CardContent className="p-3 text-center">
          <p className="text-lg font-bold text-red-400">{rankings.filter(r => r.badge === "🔥").length}</p>
          <p className="text-[10px] text-muted-foreground">🔥 ALL IN</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-lg font-bold text-yellow-400">{rankings.filter(r => r.badge === "⚡").length}</p>
          <p className="text-[10px] text-muted-foreground">⚡ MAJORITY</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-lg font-bold text-blue-400">{rankings.filter(r => r.badge === "📊").length}</p>
          <p className="text-[10px] text-muted-foreground">📊 MINORITY</p>
        </CardContent></Card>
      </div>

      {/* Ranking Table */}
      {rankings.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground text-sm">
            Tidak ada saham dengan {minBrokers}+ broker beli hari ini.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Ticker</TableHead>
                    <TableHead className="text-[10px]">Broker Beli</TableHead>
                    <TableHead className="text-[10px] text-center">Jumlah</TableHead>
                    <TableHead className="text-[10px] text-center">Confluence</TableHead>
                    <TableHead className="text-[10px] text-right">Total Net</TableHead>
                    <TableHead className="text-[10px] text-center">Badge</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankings.map(r => (
                    <TableRow key={r.ticker} className={cn(
                      r.badge === "🔥" ? "bg-red-500/5" : r.badge === "⚡" ? "bg-yellow-500/5" : ""
                    )}>
                      <TableCell className="font-mono font-bold text-xs text-primary">{r.ticker}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {r.brokersBuying.map(bb => (
                            <Tooltip key={bb.broker.broker_code}>
                              <TooltipTrigger>
                                <Badge
                                  className="text-[8px] px-1.5 py-0"
                                  style={{
                                    backgroundColor: `${bb.broker.color}20`,
                                    color: bb.broker.color,
                                    borderColor: `${bb.broker.color}50`,
                                  }}
                                >
                                  {bb.broker.broker_code}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">
                                <p>{bb.broker.broker_name}</p>
                                <p>Net: {formatVal(bb.net)} | Streak: {bb.streak}h↑</p>
                                <p>Score broker: {bb.score} | Tag: {bb.tag} / {bb.tagAk}</p>
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-xs font-bold">
                        {r.brokersBuying.length}/{r.brokersTotal}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center gap-1 justify-center">
                          <Progress value={r.confluenceScore} className="h-1.5 w-10" />
                          <span className={cn("text-[10px] font-bold",
                            r.confluenceScore >= 70 ? "text-green-400" : r.confluenceScore >= 40 ? "text-yellow-400" : "text-muted-foreground"
                          )}>{r.confluenceScore}</span>
                        </div>
                      </TableCell>
                      <TableCell className={cn("text-right font-mono text-[10px] font-bold text-green-400")}>
                        +{formatVal(r.totalNet)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={cn("text-[9px]",
                          r.badge === "🔥" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                          r.badge === "⚡" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
                          "bg-blue-500/20 text-blue-400 border-blue-500/30"
                        )}>
                          {r.badge} {r.badgeLabel}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
