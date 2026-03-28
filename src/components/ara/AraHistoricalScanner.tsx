import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { IDX_TICKERS } from "@/data/idxTickers";

interface Props {
  onComplete: (count: number) => void;
  onGoNext: () => void;
}

interface AraEvent {
  ticker: string;
  tanggal_ara: string;
  harga_open: number;
  harga_high: number;
  harga_low: number;
  harga_close: number;
  pct_change: number;
  volume: number;
  value: number;
  fraksi_harga: string;
  batas_ara: number;
}

export default function AraHistoricalScanner({ onComplete, onGoNext }: Props) {
  const [scanning, setScanning] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [found, setFound] = useState(0);
  const [done, setDone] = useState(false);
  const [uniqueTickers, setUniqueTickers] = useState(0);
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const cancelRef = useRef(false);
  const total = IDX_TICKERS.length;

  async function startScan() {
    setScanning(true);
    setProcessed(0);
    setFound(0);
    setDone(false);
    cancelRef.current = false;

    // Clear old data
    await supabase.from("ara_pre_pattern").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("ara_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    const allEvents: AraEvent[] = [];
    const tickerSet = new Set<string>();
    const batchSize = 5;

    for (let i = 0; i < total; i += batchSize) {
      if (cancelRef.current) break;
      const batch = IDX_TICKERS.slice(i, i + batchSize);

      const promises = batch.map(async (ticker) => {
        try {
          const { data, error } = await supabase.functions.invoke("yahoo-finance-ohlcv", {
            body: { ticker: ticker + ".JK", count: 500 },
          });
          if (error || !data?.candles?.length) return [];

          const candles = data.candles
            .filter((c: any) => c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0)
            .sort((a: any, b: any) => a.time - b.time);

          if (candles.length < 10) return [];

          const events: AraEvent[] = [];
          for (let j = 1; j < candles.length; j++) {
            const prevClose = candles[j - 1].close;
            const c = candles[j];
            const pctChange = ((c.close - prevClose) / prevClose) * 100;

            let fraksi: string;
            let batasAra: number;
            if (prevClose < 200) { fraksi = "<200"; batasAra = 35; }
            else if (prevClose <= 5000) { fraksi = "200-5000"; batasAra = 25; }
            else { fraksi = ">5000"; batasAra = 20; }

            if (pctChange >= batasAra) {
              const d = new Date((c.time + 7 * 3600) * 1000);
              const dateStr = d.toISOString().slice(0, 10);
              events.push({
                ticker,
                tanggal_ara: dateStr,
                harga_open: c.open,
                harga_high: c.high,
                harga_low: c.low,
                harga_close: c.close,
                pct_change: pctChange,
                volume: c.volume,
                value: c.close * c.volume,
                fraksi_harga: fraksi,
                batas_ara: batasAra,
              });
            }
          }
          return events;
        } catch {
          return [];
        }
      });

      const results = await Promise.all(promises);
      for (const events of results) {
        for (const e of events) {
          allEvents.push(e);
          tickerSet.add(e.ticker);
        }
      }
      setProcessed(Math.min(i + batchSize, total));
      setFound(allEvents.length);
    }

    if (cancelRef.current) { setScanning(false); return; }

    // Insert in batches of 100
    for (let i = 0; i < allEvents.length; i += 100) {
      const batch = allEvents.slice(i, i + 100);
      await supabase.from("ara_events").insert(batch);
    }

    setUniqueTickers(tickerSet.size);
    if (allEvents.length > 0) {
      const dates = allEvents.map(e => e.tanggal_ara).sort();
      setDateRange({ from: dates[0], to: dates[dates.length - 1] });
    }
    setDone(true);
    setScanning(false);
    onComplete(allEvents.length);
  }

  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="text-center space-y-2">
          <div className="text-4xl">📊</div>
          <h3 className="text-lg font-bold">Scan ARA Historis</h3>
          <p className="text-sm text-muted-foreground">
            Memindai 2 tahun data historis {total} saham IDX untuk menemukan semua kejadian ARA
          </p>
        </div>

        {!scanning && !done && (
          <div className="text-center">
            <Button onClick={startScan} size="lg">🔍 Scan ARA Historis</Button>
          </div>
        )}

        {scanning && (
          <div className="space-y-3">
            <Progress value={pct} className="h-3" />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Memproses: {processed} / {total} saham</span>
              <span>ARA ditemukan: <span className="text-primary font-bold">{found}</span> kejadian</span>
            </div>
            <div className="text-center">
              <button onClick={() => { cancelRef.current = true; }} className="text-xs text-muted-foreground hover:text-destructive underline">
                Batalkan
              </button>
            </div>
          </div>
        )}

        {done && (
          <div className="space-y-4 text-center">
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 space-y-1">
              <p className="text-green-600 dark:text-green-400 font-bold">✅ Scan selesai!</p>
              <p className="text-sm">Total ARA ditemukan: <strong>{found}</strong> kejadian</p>
              <p className="text-sm">Dari <strong>{uniqueTickers}</strong> saham berbeda</p>
              <p className="text-sm text-muted-foreground">Periode: {dateRange.from} — {dateRange.to}</p>
            </div>
            <Button onClick={onGoNext}>▶ Ekstrak Pola Pre-ARA →</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
