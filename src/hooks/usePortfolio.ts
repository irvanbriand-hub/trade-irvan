import { useMemo } from "react";
import { useTrades } from "./useTrades";
import { useYahooFinance } from "./useYahooFinance";
import { calculatePositions } from "@/lib/positionCalculator";

export interface PortfolioPosition {
  ticker: string;
  totalLots: number;
  avgBuyPrice: number;
  totalBuyCost: number;
  currentPrice: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
}

export interface ClosedPosition {
  ticker: string;
  realizedPL: number;
  totalBuyAmount: number;
  totalSellAmount: number;
}

export function usePortfolio() {
  const { data: trades, isLoading: tradesLoading } = useTrades();

  const { openPositions, closedPositions, allTickers } = useMemo(() => {
    if (!trades) return { openPositions: [] as any[], closedPositions: [] as ClosedPosition[], allTickers: [] as string[] };

    const result = calculatePositions(trades);

    // Aggregate closed trades per ticker
    const closedMap: Record<string, { totalSell: number; totalCost: number }> = {};
    for (const c of result.closedTrades) {
      if (!closedMap[c.ticker]) closedMap[c.ticker] = { totalSell: 0, totalCost: 0 };
      closedMap[c.ticker].totalSell += c.sellAmount;
      closedMap[c.ticker].totalCost += c.costBasis;
    }

    const closed: ClosedPosition[] = Object.entries(closedMap).map(([ticker, v]) => ({
      ticker,
      realizedPL: v.totalSell - v.totalCost,
      totalBuyAmount: v.totalCost,
      totalSellAmount: v.totalSell,
    }));

    return {
      openPositions: result.openPositions,
      closedPositions: closed,
      allTickers: result.openPositions.map(p => p.ticker),
    };
  }, [trades]);

  const { data: quotes, isLoading: quotesLoading } = useYahooFinance(allTickers);

  const portfolioPositions: PortfolioPosition[] = useMemo(() => {
    if (!quotes) return [];
    return openPositions.map((pos) => {
      const quote = quotes.find((q) => q.symbol === pos.ticker);
      const currentPrice = quote?.price || 0;
      const currentValue = currentPrice * pos.totalLots * 100;
      const sellFee = currentValue * 0.0025;
      const netValue = currentValue - sellFee;

      return {
        ticker: pos.ticker,
        totalLots: pos.totalLots,
        avgBuyPrice: pos.avgBuyPrice,
        totalBuyCost: pos.totalBuyCost,
        currentPrice,
        unrealizedPL: netValue - pos.totalBuyCost,
        unrealizedPLPercent: pos.totalBuyCost > 0 ? ((netValue - pos.totalBuyCost) / pos.totalBuyCost) * 100 : 0,
      };
    });
  }, [openPositions, quotes]);

  const totalPortfolioValue = portfolioPositions.reduce((sum, p) => sum + p.currentPrice * p.totalLots * 100, 0);
  const totalUnrealizedPL = portfolioPositions.reduce((sum, p) => sum + p.unrealizedPL, 0);
  const totalRealizedPL = closedPositions.reduce((sum, p) => sum + p.realizedPL, 0);

  return {
    portfolioPositions,
    closedPositions,
    totalPortfolioValue,
    totalUnrealizedPL,
    totalRealizedPL,
    isLoading: tradesLoading || quotesLoading,
  };
}
