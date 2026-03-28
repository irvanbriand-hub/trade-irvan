import { useMemo } from "react";
import { useTrades } from "./useTrades";
import { calculatePositions } from "@/lib/positionCalculator";

export interface ActivePosition {
  ticker: string;
  totalLots: number;
  avgBuyPrice: number;
  totalBuyCost: number;
  totalBuyFee: number;
}

export function useActivePositions() {
  const { data: trades, isLoading } = useTrades();

  const positions = useMemo(() => {
    if (!trades) return [];
    const result = calculatePositions(trades);
    return result.openPositions.map(p => ({
      ...p,
      totalBuyFee: 0, // fee tracked separately if needed
    }));
  }, [trades]);

  return { positions, isLoading };
}
