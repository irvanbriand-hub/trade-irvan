/**
 * Shared backtest timing utility.
 * Determines next trading day status and whether backtest results can be calculated.
 */

export type BacktestStatus = "WIN" | "LOSE" | "PENDING" | "MARKET_OPEN" | "OPEN";

export interface BacktestTimingResult {
  status: BacktestStatus;
  message: string;
  nextTradingDay: string | null;
  canCalculate: boolean;
}

/**
 * Given a signal date string (YYYY-MM-DD) and a set of known trading dates,
 * find the next trading day after the signal and determine if data is available.
 */
export function getBacktestTiming(
  signalDateStr: string,
  tradingDates: Set<string>,
  nowWIB?: Date
): BacktestTimingResult {
  const now = nowWIB ?? getWIBNow();
  const todayStr = formatDateStr(now);

  // Find next trading day after signal date
  const nextTD = findNextTradingDay(signalDateStr, tradingDates);

  if (!nextTD) {
    return {
      status: "PENDING",
      message: "Menunggu hari bursa berikutnya",
      nextTradingDay: null,
      canCalculate: false,
    };
  }

  // Compare next trading day with today
  if (nextTD > todayStr) {
    return {
      status: "PENDING",
      message: `Menunggu data ${nextTD}`,
      nextTradingDay: nextTD,
      canCalculate: false,
    };
  }

  if (nextTD === todayStr) {
    const hour = now.getHours();
    if (hour < 16) {
      return {
        status: "MARKET_OPEN",
        message: "Market sedang berjalan — update setelah jam 16:00 WIB",
        nextTradingDay: nextTD,
        canCalculate: false,
      };
    }
    // After 16:00 WIB, data is available
    return {
      status: "OPEN", // Will be set to WIN/LOSE after calculation
      message: "Data tersedia",
      nextTradingDay: nextTD,
      canCalculate: true,
    };
  }

  // nextTD < today — data is available
  return {
    status: "OPEN",
    message: "Data tersedia",
    nextTradingDay: nextTD,
    canCalculate: true,
  };
}

/**
 * Find the first trading day AFTER the given date.
 * Searches up to 14 calendar days ahead.
 */
export function findNextTradingDay(
  dateStr: string,
  tradingDates: Set<string>
): string | null {
  if (tradingDates.size === 0) {
    // Fallback: skip weekends only
    return findNextWeekday(dateStr);
  }

  const d = new Date(dateStr + "T00:00:00+07:00");
  for (let i = 1; i <= 14; i++) {
    const next = new Date(d);
    next.setDate(next.getDate() + i);
    const nextStr = formatDateStr(next);
    if (tradingDates.has(nextStr)) {
      return nextStr;
    }
  }

  // If no trading date found in next 14 days, fallback to weekday
  return findNextWeekday(dateStr);
}

/** Fallback: find next weekday (Mon-Fri) */
function findNextWeekday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+07:00");
  for (let i = 1; i <= 7; i++) {
    const next = new Date(d);
    next.setDate(next.getDate() + i);
    const dow = next.getDay();
    if (dow !== 0 && dow !== 6) {
      return formatDateStr(next);
    }
  }
  const fallback = new Date(d);
  fallback.setDate(fallback.getDate() + 1);
  return formatDateStr(fallback);
}

/** Get current time in WIB (UTC+7) */
export function getWIBNow(): Date {
  const now = new Date();
  // Convert to WIB
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 7 * 3600000);
}

/** Format Date to YYYY-MM-DD */
export function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Determine backtest result for BSJP strategy.
 * Entry = Close on signal day
 * Exit = High on next trading day
 * WIN = High >= Close * 1.02
 */
export function calcBSJPResult(
  closeSignalDay: number,
  highNextDay: number | null,
  signalDateStr: string,
  tradingDates: Set<string>
): { status: BacktestStatus; pct: number | null; message: string; nextTradingDay: string | null } {
  const timing = getBacktestTiming(signalDateStr, tradingDates);

  if (!timing.canCalculate) {
    return {
      status: timing.status,
      pct: null,
      message: timing.message,
      nextTradingDay: timing.nextTradingDay,
    };
  }

  if (highNextDay == null || closeSignalDay <= 0) {
    return {
      status: "PENDING",
      pct: null,
      message: "Data tidak tersedia",
      nextTradingDay: timing.nextTradingDay,
    };
  }

  const pct = ((highNextDay - closeSignalDay) / closeSignalDay) * 100;
  const isWin = highNextDay >= closeSignalDay * 1.02;

  return {
    status: isWin ? "WIN" : "LOSE",
    pct: Math.round(pct * 100) / 100,
    message: isWin ? "WIN" : "LOSE",
    nextTradingDay: timing.nextTradingDay,
  };
}
