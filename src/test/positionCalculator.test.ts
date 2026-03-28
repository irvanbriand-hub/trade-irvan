import { describe, expect, it } from "vitest";
import { calculatePositions } from "@/lib/positionCalculator";

describe("calculatePositions", () => {
  it("resets cleanly after a full close on the same day before a new buy", () => {
    const result = calculatePositions([
      {
        ticker: "BIPI",
        trade_type: "BUY",
        lots: 165,
        price: 153,
        trade_date: "2026-02-10",
        created_at: "2026-03-17T01:08:28.529726Z",
      },
      {
        ticker: "BIPI",
        trade_type: "SELL",
        lots: 165,
        price: 156,
        total_amount: 2567565,
        trade_date: "2026-02-11",
        created_at: "2026-03-17T01:08:57.991818Z",
      },
      {
        ticker: "BIPI",
        trade_type: "BUY",
        lots: 149,
        price: 168,
        trade_date: "2026-02-11",
        created_at: "2026-03-17T01:12:54.412864Z",
      },
    ]);

    expect(result.openPositions).toEqual([
      {
        ticker: "BIPI",
        totalLots: 149,
        avgBuyPrice: 168,
        totalBuyCost: 2503200,
      },
    ]);
  });

  it("keeps older core lots untouched when newer lots are bought and sold back out", () => {
    const result = calculatePositions([
      {
        ticker: "PART",
        trade_type: "BUY",
        lots: 85,
        price: 181,
        trade_date: "2026-02-18",
        created_at: "2026-03-17T01:47:10.17243Z",
      },
      {
        ticker: "PART",
        trade_type: "BUY",
        lots: 430,
        price: 128,
        trade_date: "2026-03-10",
        created_at: "2026-03-10T02:46:13.851406Z",
      },
      {
        ticker: "PART",
        trade_type: "SELL",
        lots: 430,
        price: 129,
        total_amount: 5533132.5,
        trade_date: "2026-03-10",
        created_at: "2026-03-10T02:46:36.165057Z",
      },
      {
        ticker: "PART",
        trade_type: "BUY",
        lots: 262,
        price: 128,
        trade_date: "2026-03-10",
        created_at: "2026-03-10T04:42:53.32883Z",
      },
      {
        ticker: "PART",
        trade_type: "BUY",
        lots: 18,
        price: 127,
        trade_date: "2026-03-10",
        created_at: "2026-03-10T11:30:43.682839Z",
      },
      {
        ticker: "PART",
        trade_type: "SELL",
        lots: 280,
        price: 123,
        total_amount: 3435390,
        trade_date: "2026-03-11",
        created_at: "2026-03-11T06:59:00.522424Z",
      },
    ]);

    expect(result.openPositions).toEqual([
      {
        ticker: "PART",
        totalLots: 85,
        avgBuyPrice: 181,
        totalBuyCost: 1538500,
      },
    ]);
  });
});
