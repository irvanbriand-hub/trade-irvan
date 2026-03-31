/**
 * LIFO position calculator with reset on full close.
 * Sorts trades by trade date, then preserves actual input order via created_at.
 * Sells consume the most recent BUY layers first.
 * When all layers are sold, the position resets for the next BUY.
 */

export interface PositionState {
  runningLots: number;
  runningCost: number; // total cost in Rp (lots * 100 * price)
  avgBuyPrice: number; // per share
}

export interface OpenPosition {
  ticker: string;
  totalLots: number;
  avgBuyPrice: number;
  totalBuyCost: number; // runningCost at current state
}

export interface ClosedTrade {
  ticker: string;
  sellLots: number;
  sellAmount: number; // total_amount from sell trade
  costBasis: number;  // matched buy layers * lots * 100 at time of sell
  realizedPL: number;
  date: string;
  categoryName?: string;
}

export interface PositionResult {
  openPositions: OpenPosition[];
  closedTrades: ClosedTrade[];
  totalRealizedPL: number;
}

interface PositionLayer {
  lots: number;
  price: number;
  fee: number; // buy fee; reduced proportionally as lots are consumed
}

export function calculatePositions(trades: any[]): PositionResult {
  if (!trades || trades.length === 0) {
    return { openPositions: [], closedTrades: [], totalRealizedPL: 0 };
  }

  const sorted = [...trades].sort((a, b) => {
    const dateCompare = a.trade_date.localeCompare(b.trade_date);
    if (dateCompare !== 0) return dateCompare;

    if (a.created_at && b.created_at) {
      return a.created_at.localeCompare(b.created_at);
    }

    return 0;
  });

  const layersByTicker: Record<string, PositionLayer[]> = {};
  const closedTrades: ClosedTrade[] = [];

  for (const t of sorted) {
    const ticker = t.ticker;
    if (!layersByTicker[ticker]) {
      layersByTicker[ticker] = [];
    }

    const layers = layersByTicker[ticker];

    if (t.trade_type === "BUY") {
      layers.push({
        lots: Number(t.lots) || 0,
        price: Number(t.price) || 0,
        fee: Number(t.fee) || 0,
      });
      continue;
    }

    let remainingLots = Number(t.lots) || 0;
    let costBasis = 0;

    while (remainingLots > 0 && layers.length > 0) {
      const latestLayer = layers[layers.length - 1];
      const matchedLots = Math.min(remainingLots, latestLayer.lots);

      const proportionalFee = latestLayer.lots > 0
        ? (matchedLots / latestLayer.lots) * latestLayer.fee
        : 0;

      costBasis += matchedLots * 100 * latestLayer.price + proportionalFee;
      latestLayer.fee -= proportionalFee;
      latestLayer.lots -= matchedLots;
      remainingLots -= matchedLots;

      if (latestLayer.lots <= 0) {
        layers.pop();
      }
    }

    const sellAmount = Number(t.total_amount || t.price * t.lots * 100);
    const realizedPL = sellAmount - costBasis;

    closedTrades.push({
      ticker,
      sellLots: Number(t.lots) || 0,
      sellAmount,
      costBasis,
      realizedPL,
      date: t.trade_date,
      categoryName: t.trading_categories?.name,
    });
  }

  const openPositions: OpenPosition[] = Object.entries(layersByTicker)
    .map(([ticker, layers]) => {
      const totalLots = layers.reduce((sum, layer) => sum + layer.lots, 0);
      const totalBuyCost = layers.reduce((sum, layer) => sum + layer.lots * 100 * layer.price + layer.fee, 0);
      const avgBuyPrice = totalLots > 0 ? totalBuyCost / (totalLots * 100) : 0;

      return {
        ticker,
        totalLots,
        avgBuyPrice,
        totalBuyCost,
      };
    })
    .filter((position) => position.totalLots > 0);

  const totalRealizedPL = closedTrades.reduce((sum, c) => sum + c.realizedPL, 0);

  return { openPositions, closedTrades, totalRealizedPL };
}
