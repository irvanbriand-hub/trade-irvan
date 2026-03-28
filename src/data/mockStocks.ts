export interface Stock {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  marketCap: number;
  per: number;
  pbv: number;
  roe: number;
  dividendYield: number;
  debtToEquity: number;
  eps: number;
  revenueGrowth: number;
  netProfitMargin: number;
  beta: number;
  rsi: number;
  ma50: number;
  ma200: number;
  // Technical fields
  sma3: number;
  sma5: number;
  sma10: number;
  sma20: number;
  sma50: number;
  sma200: number;
  ema10: number;
  ema20: number;
  ema50: number;
  bollingerMean: number;
  bollingerBottom: number;
  bollingerTop: number;
  bollingerBandwidth: number;
  value: number;
  prevClose: number;
  prevHigh: number;
  prevLow: number;
  prevVolume: number;
  prevOpen: number;
  prev2Close: number;
  prev2High: number;
  prev3Close: number;
  prevLlvLow5: number;
  prevBollingerBottom: number;
  prevClose2BollingerBottom: boolean;
  smaVol20: number;
}

export const mockStocks: Stock[] = [];

export interface ScreeningModule {
  id: string;
  title: string;
  description: string;
  icon: string;
  criteria: string[];
  filter: (stock: Stock) => boolean;
  badgeColor: "gain" | "loss" | "neutral";
  category: "technical";
}

const ONE_BILLION = 1_000_000_000;

export const screeningModules: ScreeningModule[] = [
  {
    id: "ma50",
    title: "MA50 Support",
    description: "Harga mendekati SMA50 sebagai support, prev low > SMA50, value > 1B",
    icon: "activity",
    criteria: ["prev LLV(low,5) > SMA50", "Close ≈ SMA50 (±1%)", "Value > 1B"],
    filter: (s) =>
      s.prevLlvLow5 > s.sma50 &&
      s.price >= s.sma50 * 0.99 &&
      s.price <= s.sma50 * 1.02 &&
      s.value > ONE_BILLION,
    badgeColor: "gain",
    category: "technical",
  },
  {
    id: "ma200",
    title: "MA200 Support",
    description: "Harga mendekati SMA200 sebagai support kuat, value > 1B",
    icon: "shield-check",
    criteria: ["prev LLV(low,5) > SMA200", "Close ≈ SMA200 (±1%)", "Value > 1B"],
    filter: (s) =>
      s.prevLlvLow5 > s.sma200 &&
      s.price >= s.sma200 * 0.99 &&
      s.price <= s.sma200 * 1.02 &&
      s.value > ONE_BILLION,
    badgeColor: "gain",
    category: "technical",
  },
  {
    id: "bb-mid",
    title: "BB Mid Bounce",
    description: "Close dekat BB Mean, EMA trending up, bandwidth > 0.1",
    icon: "git-branch",
    criteria: ["Close ≈ BB Mean (±2%)", "EMA10 > EMA20 > EMA50", "BB Width ≥ 0.1", "Close > BB Mean", "Value > 1B"],
    filter: (s) =>
      s.price >= s.bollingerMean * 0.98 &&
      s.price <= s.bollingerMean * 1.02 &&
      s.value > ONE_BILLION &&
      s.ema10 > s.ema20 &&
      s.ema20 > s.ema50 &&
      s.bollingerBandwidth >= 0.1 &&
      s.price > s.bollingerMean,
    badgeColor: "gain",
    category: "technical",
  },
  {
    id: "bb-bottom",
    title: "BB Bottom Reversal",
    description: "Reversal dari Bollinger Bottom, volume naik, high > prev high, close > prev close",
    icon: "corner-right-up",
    criteria: ["Prev Low < BB Bottom", "Prev Close < BB Bottom", "Close > BB Bottom", "Vol > Prev Vol", "High > Prev High", "Close > Prev Close"],
    filter: (s) =>
      s.prevClose2BollingerBottom &&
      s.prevLow < s.bollingerBottom &&
      s.price > s.bollingerBottom &&
      s.volume > s.prevVolume &&
      s.high > s.prevHigh &&
      s.price > s.prevClose,
    badgeColor: "gain",
    category: "technical",
  },
  {
    id: "v1",
    title: "V1 — Volume Breakout",
    description: "Volume naik, close > prev close, harga di atas SMA5, value > 5B",
    icon: "bar-chart-2",
    criteria: ["Vol > Prev Vol", "Close > Prev Close", "Price > SMA5", "Value > 5B"],
    filter: (s) =>
      s.volume > s.prevVolume &&
      s.prevClose < s.price &&
      s.price > s.sma5 &&
      s.value > 5_000_000_000,
    badgeColor: "gain",
    category: "technical",
  },
  {
    id: "v1.2",
    title: "V1.2 — Pullback After Spike",
    description: "Saham pullback setelah spike besar (prev2 high/prev3 close ≥ 1.1), value > 1B",
    icon: "corner-left-down",
    criteria: ["Price & Prev & Prev2 Close > SMA5", "Prev2 High/Prev3 Close ≥ 1.1", "Prev Close < Prev2 Close", "Price < Prev Close", "Value > 1B"],
    filter: (s) =>
      s.price > s.sma5 &&
      s.prevClose > s.sma5 &&
      s.prev2Close > s.sma5 &&
      (s.prev2High / s.prev3Close) >= 1.1 &&
      s.prevClose < s.prev2Close &&
      s.price < s.prevClose &&
      s.value > ONE_BILLION,
    badgeColor: "neutral",
    category: "technical",
  },
  {
    id: "v2",
    title: "V2 — Big Move Breakout",
    description: "Volume naik, close > prev close, harga > SMA5, high/prev close ≥ 10%, value > 5B",
    icon: "rocket",
    criteria: ["Vol > Prev Vol", "Close > Prev Close", "Price > SMA5", "High/Prev Close ≥ 1.10", "Value > 5B"],
    filter: (s) =>
      s.volume > s.prevVolume &&
      s.price > s.prevClose &&
      s.price > s.sma5 &&
      s.value > 5_000_000_000 &&
      (s.prevClose > 0 && (s.high / s.prevClose) >= 1.10),
    badgeColor: "gain",
    category: "technical",
  },
];
