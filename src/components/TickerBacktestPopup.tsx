import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ExternalLink, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { runBacktestForTicker, calcScreenerStats, type BacktestSignal, type BacktestScreenerStats } from "@/lib/backtestEngine";
import { cn } from "@/lib/utils";

interface Props {
  ticker: string | null;
  tickerName?: string;
  screenerNames: string[];
  onClose: () => void;
  onGoToAnalisa?: (ticker: string) => void;
}

export function TickerBacktestPopup({ ticker, tickerName, screenerNames, onClose, onGoToAnalisa }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState<BacktestSignal[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [hasResult, setHasResult] = useState(false);

  useEffect(() => {
    if (!ticker) {
      setHasResult(false);
      setSignals([]);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setHasResult(false);
      try {
        const result = await runBacktestForTicker(ticker);
        if (cancelled) return;
        setSignals(result.signals);
        setCompanyName(result.companyName);
        setHasResult(true);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [ticker]);

  const stats = useMemo<BacktestScreenerStats[]>(() => {
    if (!hasResult || screenerNames.length === 0) return [];
    return calcScreenerStats(signals, screenerNames).filter(s => s.total > 0 || screenerNames.includes(s.name));
  }, [signals, screenerNames, hasResult]);

  return (
    <Dialog open={!!ticker} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-bold">{ticker}</span>
            {companyName && companyName !== ticker && (
              <span className="text-sm font-normal text-muted-foreground">— {companyName}</span>
            )}
          </DialogTitle>
          {hasResult && (
            <p className="text-xs text-muted-foreground">Data 1 tahun terakhir</p>
          )}
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Menganalisa historis {ticker}...</p>
          </div>
        )}

        {hasResult && !loading && (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Screener</TableHead>
                    <TableHead className="text-xs text-center">Total</TableHead>
                    <TableHead className="text-xs text-center">WIN</TableHead>
                    <TableHead className="text-xs text-center">LOSE</TableHead>
                    <TableHead className="text-xs text-center">WR %</TableHead>
                    <TableHead className="text-xs text-center">Avg % (WIN)</TableHead>
                    <TableHead className="text-xs text-center">Badge</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.map(st => (
                    <TableRow key={st.name}>
                      <TableCell className="text-xs font-medium whitespace-nowrap">{st.name}</TableCell>
                      <TableCell className="text-center font-mono text-xs">{st.total}</TableCell>
                      <TableCell className="text-center font-mono text-xs text-green-500">{st.wins}</TableCell>
                      <TableCell className="text-center font-mono text-xs text-red-500">{st.losses}</TableCell>
                      <TableCell className="text-center">
                        <span className={cn("font-bold font-mono text-xs", st.winRate >= 50 ? "text-green-500" : "text-red-500")}>
                          {st.winRate.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs">{st.avgGainWin.toFixed(2)}%</TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {st.winRate >= 70 && st.total > 0 && (
                            <Badge className="bg-green-500/10 text-green-500 border-green-500/30 text-[9px]">🔥 WR Tinggi</Badge>
                          )}
                          {st.winRate < 40 && st.total > 0 && (
                            <Badge className="bg-red-500/10 text-red-500 border-red-500/30 text-[9px]">⚠️ WR Rendah</Badge>
                          )}
                          {st.total <= 3 && st.total > 0 && (
                            <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/30 text-[9px]">📊 Sinyal Langka</Badge>
                          )}
                          {st.total === 0 && (
                            <span className="text-[9px] text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end gap-2">
              {onGoToAnalisa && ticker && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onGoToAnalisa(ticker)}
                  className="text-xs"
                >
                  <ArrowRight className="h-3 w-3 mr-1.5" />
                  Lihat di Analisa Historis
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onClose();
                  navigate(`/historical-backtest?ticker=${ticker}`);
                }}
                className="text-xs"
              >
                <ExternalLink className="h-3 w-3 mr-1.5" />
                Lihat Detail Lengkap
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
