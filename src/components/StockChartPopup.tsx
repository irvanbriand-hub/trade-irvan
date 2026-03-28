import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, type IChartApi, type CandlestickData, type HistogramData, type LineData, type Time } from "lightweight-charts";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { sma, bollingerBands, calcMACD, calcStochastic, calcIIScoreArray } from "@/lib/chartIndicators";

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }
interface Props { ticker: string; stockName: string; price: number; changePct: number; open: boolean; onClose: () => void; }

function toTime(ts: number): Time {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` as Time;
}

const TOGGLES_DEFAULT = { MA: true, BB: true, VOL: true, MACD: true, STOCH: true, II: true };

export function StockChartPopup({ ticker, stockName, price, changePct, open: isOpen, onClose }: Props) {
  const mainRef = useRef<HTMLDivElement>(null);
  const volRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const stochRef = useRef<HTMLDivElement>(null);
  const iiRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(false);
  const [candleCount, setCandleCount] = useState<50 | 100 | 200>(50);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [legend, setLegend] = useState<any>(null);
  const [sectorInfo, setSectorInfo] = useState<{ sector: string | null; changePct: number | null }>({ sector: null, changePct: null });
  const [toggles, setToggles] = useState(TOGGLES_DEFAULT);
  const chartsRef = useRef<IChartApi[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    supabase.functions.invoke("yahoo-finance-ohlcv", { body: { ticker, count: 500 } })
      .then(({ data, error }) => {
        if (error) console.error(error);
        const raw: Candle[] = data?.candles || [];
        const seen = new Map<string, Candle>();
        for (const c of raw) {
          const dayKey = toTime(c.time) as string;
          seen.set(dayKey, c);
        }
        const deduped = Array.from(seen.values()).sort((a, b) => a.time - b.time);
        setCandles(deduped);
        setSectorInfo({ sector: data?.sector || null, changePct: data?.sectorChangePct ?? null });
      })
      .finally(() => setLoading(false));
  }, [isOpen, ticker]);

  useEffect(() => {
    if (!isOpen || candles.length === 0 || !mainRef.current) return;

    chartsRef.current.forEach(c => { try { c.remove(); } catch {} });
    chartsRef.current = [];

    const allCloses = candles.map(c => c.close);
    const allHighs = candles.map(c => c.high);
    const allLows = candles.map(c => c.low);
    const allVols = candles.map(c => c.volume);

    // Only needed MAs
    const ma5All = sma(allCloses, 5);
    const ma20All = sma(allCloses, 20);
    const ma50All = sma(allCloses, 50);
    const ma200All = sma(allCloses, 200);

    const bbAll = bollingerBands(allCloses, 20, 2);
    const macdAll = calcMACD(allCloses);
    const stochAll = calcStochastic(allCloses, allHighs, allLows, 15, 3, 3);
    const iiAll = calcIIScoreArray(allCloses, allHighs, allLows);
    const volMA20All = sma(allVols, 20);

    const offset = Math.max(0, candles.length - candleCount);
    const sliced = candles.slice(offset);

    const bg = 'rgb(15, 17, 23)';
    const textColor = 'rgba(255,255,255,0.6)';
    const gridColor = 'rgba(255,255,255,0.06)';
    const fontSize = isMobile ? 8 : 10;

    const commonOpts: any = {
      layout: { background: { color: bg }, textColor, fontFamily: 'monospace', fontSize },
      grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: gridColor, scaleMargins: { top: 0.05, bottom: 0.05 } },
      timeScale: { borderColor: gridColor, timeVisible: false },
      handleScroll: { vertTouchDrag: false },
    };

    const addLine = (chart: IChartApi, vals: (number | null)[], color: string, width = 1, dash = false) => {
      const s = chart.addSeries(LineSeries, {
        color, lineWidth: width as any, ...(dash ? { lineStyle: 2 } : {}),
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      });
      const d: LineData[] = [];
      for (let i = offset; i < candles.length; i++) {
        if (vals[i] != null) d.push({ time: toTime(candles[i].time), value: vals[i]! });
      }
      s.setData(d);
      return s;
    };

    const addHLine = (chart: IChartApi, val: number, color: string) => {
      if (sliced.length < 2) return;
      const s = chart.addSeries(LineSeries, {
        color, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      });
      s.setData([
        { time: toTime(sliced[0].time), value: val },
        { time: toTime(sliced[sliced.length - 1].time), value: val },
      ]);
    };

    const allCharts: IChartApi[] = [];
    const panelEls: HTMLDivElement[] = [];

    // ===== PANEL 1 — CANDLESTICK =====
    const mainEl = mainRef.current;
    mainEl.innerHTML = '';
    const mainChart = createChart(mainEl, {
      ...commonOpts, width: mainEl.clientWidth, height: mainEl.clientHeight,
      timeScale: { ...commonOpts.timeScale, visible: false },
    });
    allCharts.push(mainChart);
    panelEls.push(mainEl);

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: '#22c55e', downColor: '#ef4444', borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    });
    candleSeries.setData(sliced.map(c => ({
      time: toTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close,
    })) as CandlestickData[]);

    if (toggles.MA) {
      addLine(mainChart, ma5All, '#FFFF00', 1);
      addLine(mainChart, ma20All, '#FF0000', 1);
      addLine(mainChart, ma50All, '#87CEEB', 1);
      addLine(mainChart, ma200All, '#00FF00', 1);
    }

    if (toggles.BB) {
      addLine(mainChart, bbAll.top, '#FF6B9D', 1, true);
      addLine(mainChart, bbAll.mid, '#FFFFFF', 1, true);
      addLine(mainChart, bbAll.bottom, '#00D4FF', 1, true);
    }

    // ===== PANEL 2 — VOLUME =====
    if (toggles.VOL) {
      const volEl = volRef.current!;
      volEl.innerHTML = '';
      const volChart = createChart(volEl, {
        ...commonOpts, width: volEl.clientWidth, height: volEl.clientHeight,
        timeScale: { ...commonOpts.timeScale, visible: false },
        rightPriceScale: { ...commonOpts.rightPriceScale, scaleMargins: { top: 0.1, bottom: 0 } },
      });
      allCharts.push(volChart);
      panelEls.push(volEl);

      const volSeries = volChart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false });
      volSeries.setData(sliced.map(c => ({
        time: toTime(c.time), value: c.volume,
        color: c.close >= c.open ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)',
      })) as HistogramData[]);
      addLine(volChart, volMA20All, '#FFFF00', 1);
    }

    // ===== PANEL 3 — MACD =====
    if (toggles.MACD) {
      const macdEl = macdRef.current!;
      macdEl.innerHTML = '';
      const macdChart = createChart(macdEl, {
        ...commonOpts, width: macdEl.clientWidth, height: macdEl.clientHeight,
        timeScale: { ...commonOpts.timeScale, visible: false },
      });
      allCharts.push(macdChart);
      panelEls.push(macdEl);

      const macdHistSeries = macdChart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false });
      const macdHistData: HistogramData[] = [];
      for (let i = offset; i < candles.length; i++) {
        const h = macdAll.histogram[i];
        const hp = i > 0 ? macdAll.histogram[i - 1] : null;
        if (h != null) {
          let color: string;
          if (h >= 0 && (hp == null || h >= hp)) color = 'rgba(34,197,94,0.7)';
          else if (h >= 0) color = 'rgba(255,182,193,0.7)';
          else if (h < 0 && (hp == null || h <= hp)) color = 'rgba(239,68,68,0.7)';
          else color = 'rgba(255,165,0,0.7)';
          macdHistData.push({ time: toTime(candles[i].time), value: h, color });
        }
      }
      macdHistSeries.setData(macdHistData);
      addLine(macdChart, macdAll.macdLine, '#00FFFF', 1);
      addLine(macdChart, macdAll.signalLine, '#FF0000', 1);
      addHLine(macdChart, 0, 'rgba(255,255,255,0.2)');
    }

    // ===== PANEL 4 — STOCHASTIC =====
    if (toggles.STOCH) {
      const stochEl = stochRef.current!;
      stochEl.innerHTML = '';
      const stochChart = createChart(stochEl, {
        ...commonOpts, width: stochEl.clientWidth, height: stochEl.clientHeight,
        rightPriceScale: { ...commonOpts.rightPriceScale, scaleMargins: { top: 0.05, bottom: 0.05 } },
        timeScale: { ...commonOpts.timeScale, visible: false },
      });
      allCharts.push(stochChart);
      panelEls.push(stochEl);

      addLine(stochChart, stochAll.k, '#00FFFF', 1);
      addLine(stochChart, stochAll.d, '#FF6600', 1);
      addHLine(stochChart, 80, '#ef4444');
      addHLine(stochChart, 20, '#22c55e');
    }

    // ===== PANEL 5 — II SCORE =====
    if (toggles.II) {
      const iiEl = iiRef.current!;
      iiEl.innerHTML = '';
      const iiChart = createChart(iiEl, {
        ...commonOpts, width: iiEl.clientWidth, height: iiEl.clientHeight,
      });
      allCharts.push(iiChart);
      panelEls.push(iiEl);

      addLine(iiChart, iiAll.ii, '#00FF00', 1.5);
      addLine(iiChart, iiAll.iiMA5, '#FFFF00', 2);
      addHLine(iiChart, 0, 'rgba(255,255,255,0.3)');
    }

    chartsRef.current = allCharts;

    // Sync time scales
    allCharts.forEach((chart, idx) => {
      chart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
        if (range) allCharts.forEach((o, oi) => { if (idx !== oi) o.timeScale().setVisibleLogicalRange(range); });
      });
    });

    // Legend
    const updateLegend = (gi: number) => {
      const c = candles[gi];
      setLegend({
        date: toTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
        ma5: ma5All[gi], ma20: ma20All[gi], ma50: ma50All[gi], ma200: ma200All[gi],
        bbTop: bbAll.top[gi], bbMid: bbAll.mid[gi], bbBot: bbAll.bottom[gi],
        macd: macdAll.macdLine[gi], signal: macdAll.signalLine[gi],
        macdHist: macdAll.histogram[gi],
        stochK: stochAll.k[gi], stochD: stochAll.d[gi],
        ii: iiAll.ii[gi], iiMA5: iiAll.iiMA5[gi], is: iiAll.is[gi],
      });
    };
    updateLegend(candles.length - 1);

    mainChart.subscribeCrosshairMove((param: any) => {
      if (!param.time) return;
      const ci = sliced.findIndex(c => toTime(c.time) === param.time);
      if (ci >= 0) updateLegend(offset + ci);
    });

    const handleResize = () => {
      allCharts.forEach((chart, idx) => {
        const el = panelEls[idx];
        if (el) chart.applyOptions({ width: el.clientWidth });
      });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chartsRef.current.forEach(c => { try { c.remove(); } catch {} });
      chartsRef.current = [];
    };
  }, [isOpen, candles, candleCount, isMobile, toggles]);

  const fmt = (v: number | null | undefined) => v != null ? (Math.abs(v) >= 10 ? Math.round(v).toLocaleString('id-ID') : v.toFixed(2)) : '-';
  const fmtVol = (v: number | null | undefined) => {
    if (v == null) return '-';
    if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toString();
  };

  const toggleKey = (key: keyof typeof TOGGLES_DEFAULT) => {
    setToggles(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const sectorIsUp = sectorInfo.changePct != null && sectorInfo.changePct >= 0;

  const mainFlex = 45;
  const volFlex = toggles.VOL ? 12 : 0;
  const macdFlex = toggles.MACD ? 15 : 0;
  const stochFlex = toggles.STOCH ? 14 : 0;
  const iiFlex = toggles.II ? 14 : 0;

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={cn(
          "p-0 gap-0 overflow-hidden flex flex-col",
          "w-[100vw] h-[100vh] max-w-[100vw] max-h-[100vh] border-none rounded-none",
          "sm:w-[95vw] sm:h-[90vh] sm:max-w-[95vw] sm:max-h-[90vh] sm:border-border sm:rounded-lg"
        )}
        style={{ backgroundColor: 'rgb(15, 17, 23)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-border/30 shrink-0">
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap min-w-0">
            <div className="min-w-0">
              <span className="font-bold font-mono text-foreground text-sm sm:text-lg">{ticker}</span>
              <span className="text-muted-foreground text-[10px] sm:text-sm ml-1 sm:ml-2 truncate">{stockName}</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <span className="font-mono font-bold text-foreground text-xs sm:text-base">{price.toLocaleString('id-ID')}</span>
              <span className={`font-mono text-[10px] sm:text-sm font-semibold ${changePct >= 0 ? 'text-gain' : 'text-loss'}`}>
                {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
              </span>
            </div>
            {sectorInfo.sector && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[9px] sm:text-xs font-mono px-1.5 py-0.5 rounded bg-muted/50 cursor-help">
                      <span className="text-muted-foreground">Sektor: </span>
                      <span className="text-foreground">{sectorInfo.sector}</span>
                      {sectorInfo.changePct != null && (
                        <span className={`ml-1 font-semibold ${sectorIsUp ? 'text-gain' : 'text-loss'}`}>
                          {sectorIsUp ? '+' : ''}{sectorInfo.changePct.toFixed(2)}%
                        </span>
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Sektor {sectorInfo.sector}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="flex items-center gap-1 sm:gap-3 shrink-0">
            <div className="flex items-center gap-0.5 bg-muted/30 rounded-md p-0.5">
              {([50, 100, 200] as const).map(n => (
                <button
                  key={n}
                  onClick={() => setCandleCount(n)}
                  className={`px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-mono rounded transition-all ${
                    candleCount === n ? 'bg-primary/20 text-primary font-bold' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : candles.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Tidak ada data chart untuk {ticker}
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toggle bar */}
            <div className="px-2 sm:px-4 py-1 flex flex-wrap gap-1 shrink-0 border-b border-border/20">
              {(Object.keys(TOGGLES_DEFAULT) as (keyof typeof TOGGLES_DEFAULT)[]).map(key => (
                <button
                  key={key}
                  onClick={() => toggleKey(key)}
                  className={cn(
                    "px-1.5 py-0.5 text-[9px] sm:text-[10px] font-mono rounded transition-all",
                    toggles[key] ? "bg-primary/20 text-primary" : "bg-muted/20 text-muted-foreground/50 line-through"
                  )}
                >
                  {key}
                </button>
              ))}
            </div>

            {/* Legend */}
            <div className="px-2 sm:px-4 py-1 flex flex-wrap gap-x-2 sm:gap-x-3 gap-y-0.5 text-[7px] sm:text-[9px] font-mono shrink-0">
              {legend?.date && <span className="text-muted-foreground">{legend.date}</span>}
              {legend?.open != null && (
                <>
                  <span className="text-muted-foreground">O:<span className="text-foreground ml-0.5">{fmt(legend.open)}</span></span>
                  <span className="text-muted-foreground">H:<span className="text-foreground ml-0.5">{fmt(legend.high)}</span></span>
                  <span className="text-muted-foreground">L:<span className="text-foreground ml-0.5">{fmt(legend.low)}</span></span>
                  <span className="text-muted-foreground">C:<span className="text-foreground ml-0.5">{fmt(legend.close)}</span></span>
                  <span className="text-muted-foreground">V:<span className="text-foreground ml-0.5">{fmtVol(legend.volume)}</span></span>
                </>
              )}
              <span style={{ color: '#FFFF00' }}>MA5:{fmt(legend?.ma5)}</span>
              <span style={{ color: '#FF0000' }}>MA20:{fmt(legend?.ma20)}</span>
              <span style={{ color: '#87CEEB' }}>MA50:{fmt(legend?.ma50)}</span>
              <span style={{ color: '#00FF00' }}>MA200:{fmt(legend?.ma200)}</span>
              <span style={{ color: '#FF6B9D' }}>BB↑{fmt(legend?.bbTop)}</span>
              <span style={{ color: '#FFFFFF' }}>BB—{fmt(legend?.bbMid)}</span>
              <span style={{ color: '#00D4FF' }}>BB↓{fmt(legend?.bbBot)}</span>
              <span style={{ color: '#00FFFF' }}>MACD:{fmt(legend?.macd)}</span>
              <span style={{ color: '#FF0000' }}>Sig:{fmt(legend?.signal)}</span>
              <span style={{ color: '#00FFFF' }}>K:{fmt(legend?.stochK)}</span>
              <span style={{ color: '#FF6600' }}>D:{fmt(legend?.stochD)}</span>
              <span style={{ color: '#00FF00' }}>II:{fmt(legend?.ii)}</span>
              <span style={{ color: '#FFFF00' }}>MA5(II):{fmt(legend?.iiMA5)}</span>
              <span className="text-muted-foreground">IS:{fmt(legend?.is)}</span>
            </div>

            {/* Panels */}
            <div ref={mainRef} className="min-h-0" style={{ flex: mainFlex }} />
            {toggles.VOL && (
              <>
                <div className="px-2 sm:px-4 text-[7px] sm:text-[8px] font-mono text-muted-foreground/50 shrink-0">VOLUME</div>
                <div ref={volRef} className="min-h-0" style={{ flex: volFlex }} />
              </>
            )}
            {toggles.MACD && (
              <>
                <div className="px-2 sm:px-4 text-[7px] sm:text-[8px] font-mono text-muted-foreground/50 shrink-0">MACD (12,26,9)</div>
                <div ref={macdRef} className="min-h-0" style={{ flex: macdFlex }} />
              </>
            )}
            {toggles.STOCH && (
              <>
                <div className="px-2 sm:px-4 text-[7px] sm:text-[8px] font-mono text-muted-foreground/50 shrink-0">STOCH (15,3,3)</div>
                <div ref={stochRef} className="min-h-0" style={{ flex: stochFlex }} />
              </>
            )}
            {toggles.II && (
              <>
                <div className="px-2 sm:px-4 text-[7px] sm:text-[8px] font-mono text-muted-foreground/50 shrink-0">II SCORE</div>
                <div ref={iiRef} className="min-h-0" style={{ flex: iiFlex }} />
              </>
            )}
            {!toggles.VOL && <div ref={volRef} className="hidden" />}
            {!toggles.MACD && <div ref={macdRef} className="hidden" />}
            {!toggles.STOCH && <div ref={stochRef} className="hidden" />}
            {!toggles.II && <div ref={iiRef} className="hidden" />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
