// Module-level singleton store for screener scan results
import type { Json } from "@/integrations/supabase/types";

export interface ScreenerStockData {
  ticker: string; close: number; open: number; high: number; low: number;
  volume: number; value: number; prevClose: number; prevHigh: number; prevLow: number;
  prevOpen: number; prevVolume: number; prev2Close: number; prev2High: number;
  prev3Close: number; sma3: number; sma5: number; sma10: number; sma20: number;
  sma50: number; sma200: number; ema10: number; ema20: number; ema50: number;
  bbMean: number; bbTop: number; bbBottom: number; bbWidth: number;
  prevBbBottom: number; prevCloseBelowBbBottom: boolean; prevLlvLow5: number;
  smaVol20: number; smaVol5: number; prevSma5: number; name: string;
}

export interface AnalisisRow {
  ticker: string; screener: string; total: number; wins: number;
  losses: number; winRate: number; avgGainWin: number; lastSignalDate: string;
}

export interface SKStockData {
  ticker: string; name: string; close: number; open: number; high: number;
  low: number; volume: number; value: number; prevClose: number; changePct: number;
  vv1: number; vv0: number; vm60: number; vma60: number; v3ma60: number; v5ma60: number; v10ma60: number;
  v30ma90: number; vok: boolean; vokTipe: string; rp: number;
  ma3: number; ma5: number; ma10: number; ma20: number; ma50: number;
  dma3: number; dma5: number; dma10: number; dma20: number; dma50: number;
  tma20: number; tma50: number; ii: number; iiy: number; is_val: number;
  k5: number; d5: number; adx13: number; safebull: boolean; safemsp: boolean;
  jalur: string; macdKondisi: string; stochKondisi: string; adxKondisi: string;
  isConfluence: boolean;
}

export interface SwingStockData {
  ticker: string; name: string; close: number; open: number; high: number;
  low: number; volume: number; value: number; prevClose: number; changePct: number;
  vv1: number; vma60: number; v3ma60: number; v5ma60: number; v10ma60: number;
  v30ma90: number; vok: boolean; vokTipe: string; rp: number;
  ma3: number; ma5: number; ma10: number; ma20: number; ma50: number;
  ma100: number; ma200: number; ma400: number; bbBottom: number;
  dma3: number; dma5: number; dma10: number; dma20: number; dma50: number;
  dma100: number; dma200: number; dma400: number; clrbbb: number;
  tma20: number; tma50: number; ii: number; iiy: number; is_val: number;
  k5: number; d5: number; adx13: number;
  ketat: boolean; bullish: boolean; msp: boolean;
  aboveAllMA: boolean; maAboveCount: number; ketatYesterday: boolean;
  nearestMA: string; nearestMADist: number;
  macdKondisi: string; stochKondisi: string; adxKondisi: string;
}

type SwingScreenerType = "ketat_allma" | "ketat_pertama" | "bottom_fishing";

interface ScreenerStore {
  allStockData: ScreenerStockData[];
  lastScanTime: Date | null;
  lastMarketDataTime: Date | null;
  hasScanRun: boolean;
  analisisRows: AnalisisRow[];
  analysisDone: boolean;
  skStocks: SKStockData[];
  skLastScanTime: Date | null;
  skHasScanRun: boolean;
  // Swing screener states (per screener type)
  swingStocks: Record<SwingScreenerType, SwingStockData[]>;
  swingLastScanTime: Record<SwingScreenerType, Date | null>;
  swingHasScanRun: Record<SwingScreenerType, boolean>;
  // IEP Gap Analysis cache (ticker → result or null)
  iepCache: Record<string, unknown>;
}

const store: ScreenerStore = {
  allStockData: [],
  lastScanTime: null,
  lastMarketDataTime: null,
  hasScanRun: false,
  analisisRows: [],
  analysisDone: false,
  skStocks: [],
  skLastScanTime: null,
  skHasScanRun: false,
  swingStocks: { ketat_allma: [], ketat_pertama: [], bottom_fishing: [] },
  swingLastScanTime: { ketat_allma: null, ketat_pertama: null, bottom_fishing: null },
  swingHasScanRun: { ketat_allma: false, ketat_pertama: false, bottom_fishing: false },
  iepCache: {},
};

export function getScreenerStore() { return store; }

export function updateScreenerStore(partial: Partial<ScreenerStore>) {
  Object.assign(store, partial);
}

export function resetScreenerStore() {
  store.allStockData = [];
  store.lastScanTime = null;
  store.lastMarketDataTime = null;
  store.hasScanRun = false;
  store.analisisRows = [];
  store.analysisDone = false;
  store.skStocks = [];
  store.skLastScanTime = null;
  store.skHasScanRun = false;
  store.swingStocks = { ketat_allma: [], ketat_pertama: [], bottom_fishing: [] };
  store.swingLastScanTime = { ketat_allma: null, ketat_pertama: null, bottom_fishing: null };
  store.swingHasScanRun = { ketat_allma: false, ketat_pertama: false, bottom_fishing: false };
  store.iepCache = {};
}
