import { useState, useEffect, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { compileFormula, type CandleData } from "@/lib/formulaEvaluator";
import { IDX_TICKERS } from "@/data/idxTickers";

export interface ScanResult {
  ticker: string;
  close: number;
  change: number;
  volume: number;
  value: number;
  cap?: string;
  dataDate?: string;
}

interface ScanProgressProps {
  formula: string;
  screeningDate?: string;
  onScreeningDateChange?: (d: string | undefined) => void;
  onComplete: (results: ScanResult[], dataDate?: string) => void;
  onCancel: () => void;
}

type DateMode = "today" | "yesterday" | "custom";

export default function ScanProgress({ formula, screeningDate, onScreeningDateChange, onComplete, onCancel }: ScanProgressProps) {
  const [total, setTotal] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [found, setFound] = useState(0);
  const [status, setStatus] = useState("Pilih tanggal screening...");
  const [scanning, setScanning] = useState(false);
  const cancelledRef = useRef(false);

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const yesterdayStr = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const selectedDate = screeningDate || todayStr;

  const dateMode: DateMode = selectedDate === todayStr ? "today" : selectedDate === yesterdayStr ? "yesterday" : "custom";

  const handleDateMode = (mode: DateMode) => {
    if (mode === "today") onScreeningDateChange?.(todayStr);
    else if (mode === "yesterday") onScreeningDateChange?.(yesterdayStr);
  };

  const handleCalendarSelect = (d: Date | undefined) => {
    if (d) onScreeningDateChange?.(format(d, "yyyy-MM-dd"));
  };

  const startScan = () => {
    setScanning(true);
    setStatus("Scanning saham IDX...");
    cancelledRef.current = false;
    runScan();
  };

  async function runScan() {
    try {
      const tickers = IDX_TICKERS;
      setTotal(tickers.length);

      const results: ScanResult[] = [];
      let latestDataDate = "";
      const batchSize = 5;
      const targetDate = selectedDate;

      for (let i = 0; i < tickers.length; i += batchSize) {
        if (cancelledRef.current) return;

        const batch = tickers.slice(i, i + batchSize);
        const promises = batch.map(async (ticker) => {
          try {
            const { data, error } = await supabase.functions.invoke("yahoo-finance-ohlcv", {
              body: { ticker: ticker + ".JK", count: 300 },
            });
            if (error || !data?.candles?.length) return null;

            const candles: CandleData[] = data.candles;
            candles.sort((a: CandleData, b: CandleData) => a.time - b.time);

            const valid = candles.filter((c: CandleData) => c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0);
            if (valid.length < 50) return null;

            // Find the candle index for the target date (or the closest before it)
            let targetIdx = valid.length - 1;
            if (targetDate) {
              const targetTs = new Date(targetDate + "T23:59:59").getTime() / 1000;
              let found = -1;
              for (let j = valid.length - 1; j >= 0; j--) {
                const candleDate = new Date((valid[j].time + 7 * 3600) * 1000).toISOString().slice(0, 10);
                if (candleDate <= targetDate) { found = j; break; }
              }
              if (found >= 50) targetIdx = found;
              else if (found >= 0) return null; // not enough warmup
              // else use latest
            }

            const evalFn = compileFormula(formula, valid);

            const lastCandle = valid[targetIdx];
            const d = new Date((lastCandle.time + 7 * 3600) * 1000);
            const dateStr = d.toISOString().slice(0, 10);

            if (evalFn(targetIdx)) {
              const c = valid[targetIdx];
              const prevC = targetIdx >= 1 ? valid[targetIdx - 1].close : c.close;
              const change = prevC > 0 ? ((c.close - prevC) / prevC) * 100 : 0;
              return {
                ticker,
                close: c.close,
                change,
                volume: c.volume,
                value: c.close * c.volume,
                dataDate: dateStr,
              } as ScanResult;
            }
            if (!latestDataDate && dateStr) latestDataDate = dateStr;
            return null;
          } catch {
            return null;
          }
        });

        const batchResults = await Promise.all(promises);
        for (const r of batchResults) {
          if (r) {
            results.push(r);
            if (r.dataDate && (!latestDataDate || r.dataDate > latestDataDate)) {
              latestDataDate = r.dataDate;
            }
            setFound(results.length);
          }
        }
        setProcessed(Math.min(i + batchSize, tickers.length));
      }

      if (!cancelledRef.current) {
        const dataDate = results[0]?.dataDate || latestDataDate;
        onComplete(results, dataDate);
      }
    } catch (err) {
      console.error("Scan error:", err);
      onComplete([]);
    }
  }

  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

  if (!scanning) {
    return (
      <Card className="max-w-lg mx-auto">
        <CardContent className="p-6 space-y-4">
          <div className="text-center">
            <div className="text-4xl mb-2">📅</div>
            <h3 className="text-lg font-bold text-foreground">Pilih Tanggal Screening</h3>
            <p className="text-xs text-muted-foreground mt-1">Data candle terakhir yang akan digunakan untuk evaluasi formula</p>
          </div>

          <div className="flex justify-center gap-2">
            <Button
              variant={dateMode === "today" ? "default" : "outline"}
              size="sm"
              onClick={() => handleDateMode("today")}
              className="text-xs"
            >
              Hari Ini
            </Button>
            <Button
              variant={dateMode === "yesterday" ? "default" : "outline"}
              size="sm"
              onClick={() => handleDateMode("yesterday")}
              className="text-xs"
            >
              Kemarin
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={dateMode === "custom" ? "default" : "outline"}
                  size="sm"
                  className="text-xs gap-1"
                >
                  <CalendarIcon className="h-3 w-3" />
                  Custom
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single"
                  selected={new Date(selectedDate)}
                  onSelect={handleCalendarSelect}
                  disabled={(date) => date > new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              Tanggal screening: <span className="text-primary font-bold">{format(new Date(selectedDate), "dd MMM yyyy")}</span>
            </p>
          </div>

          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} className="text-xs">← Kembali</Button>
            <Button size="sm" onClick={startScan} className="text-xs gap-1.5">🔍 Mulai Scan</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-lg mx-auto">
      <CardContent className="p-6 space-y-4 text-center">
        <div className="text-4xl">🔍</div>
        <h3 className="text-lg font-bold text-foreground drop-shadow-sm">{status}</h3>
        <p className="text-xs text-muted-foreground">Tanggal: {format(new Date(selectedDate), "dd MMM yyyy")}</p>
        <Progress value={pct} className="h-3" />
        <div className="flex justify-between text-sm">
          <span className="text-foreground/80">Memproses: <span className="font-semibold text-foreground">{processed}</span> / {total} saham</span>
          <span className="text-foreground/80">Ditemukan: <span className="text-primary font-bold">{found}</span> saham lolos</span>
        </div>
        <p className="text-xs text-foreground/60">{pct}% selesai</p>
        <button onClick={() => { cancelledRef.current = true; onCancel(); }} className="text-xs text-foreground/50 hover:text-destructive underline">
          Batalkan
        </button>
      </CardContent>
    </Card>
  );
}
