import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface AkSmartMoneyBadge {
  ticker: string;
  tanggal: string;
  score: number;
  netValue: number;
  buyValue: number | null;
  sellValue: number | null;
  ratio: number;
  tagVsSaham: string;
  tagVsAk: string;
  streakBeli: number;
  streakJual: number;
  pctOfMarket: number;
  valueSource: string;
  rollingWindow: number;
  hasBandar: boolean;
  bandarTier?: string;
  badgeType: "whale_bandar" | "whale" | "big_accum" | "ak_positive" | "ak_negative" | "none";
  badgeLabel: string;
  badgeColor: string;
}

export function useAkSmartMoney(bandarData?: any[]) {
  const { user } = useAuth();

  const { data: latestScores = [] } = useQuery({
    queryKey: ["ak_smart_money_scores", user?.id],
    queryFn: async () => {
      // Get the latest date with data
      const { data: dateData } = await supabase
        .from("ak_broker_scores")
        .select("tanggal")
        .order("tanggal", { ascending: false })
        .limit(1);
      
      if (!dateData || dateData.length === 0) return [];
      const latestDate = dateData[0].tanggal;

      const { data, error } = await supabase
        .from("ak_broker_scores")
        .select("*")
        .eq("tanggal", latestDate)
        .order("score_total", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  const { data: latestBrokerData = [] } = useQuery({
    queryKey: ["ak_smart_money_broker", user?.id],
    queryFn: async () => {
      const { data: dateData } = await supabase
        .from("ak_broker_data")
        .select("tanggal")
        .order("tanggal", { ascending: false })
        .limit(1);
      
      if (!dateData || dateData.length === 0) return [];
      const latestDate = dateData[0].tanggal;

      const { data, error } = await supabase
        .from("ak_broker_data")
        .select("*")
        .eq("tanggal", latestDate);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  const formatVal = (v: number | null) => {
    if (v == null) return "—";
    const abs = Math.abs(v);
    if (abs >= 1e12) return `${(v / 1e12).toFixed(1)}T`;
    if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return v.toLocaleString("id-ID");
  };

  const badgeMap = useMemo(() => {
    const map = new Map<string, AkSmartMoneyBadge>();
    const bandarMap = new Map<string, any>();
    
    if (bandarData) {
      for (const b of bandarData) {
        if (!bandarMap.has(b.ticker) || b.tanggal_data > bandarMap.get(b.ticker).tanggal_data) {
          bandarMap.set(b.ticker, b);
        }
      }
    }

    // Merge broker data + scores
    for (const broker of latestBrokerData) {
      const score = latestScores.find((s: any) => s.ticker === broker.ticker);
      const bandar = bandarMap.get(broker.ticker);
      const scoreTotal = score?.score_total ?? 0;
      const netValue = broker.net_value ?? 0;
      const hasBandar = !!bandar && (bandar.tier === "S" || bandar.tier === "A");
      const isPositiveNet = netValue > 0;

      let badgeType: AkSmartMoneyBadge["badgeType"] = "none";
      let badgeLabel = "";
      let badgeColor = "";

      if (hasBandar && isPositiveNet && scoreTotal >= 30) {
        badgeType = "whale_bandar";
        badgeLabel = `🎯 AK+Bandar`;
        badgeColor = "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 shadow-[0_0_6px_hsl(45_100%_50%/0.3)]";
      } else if (scoreTotal >= 80 || score?.tag_vs_saham === "WHALE") {
        badgeType = "whale";
        badgeLabel = `🐋 +${formatVal(netValue)} | ${(score?.buy_vs_avg_ratio ?? 0).toFixed(1)}x`;
        badgeColor = "bg-yellow-600/20 text-yellow-400 border-yellow-600/30";
      } else if (scoreTotal >= 50 || score?.tag_vs_saham === "BIG_ACCUM") {
        badgeType = "big_accum";
        badgeLabel = `💰 +${formatVal(netValue)} | ${(score?.buy_vs_avg_ratio ?? 0).toFixed(1)}x`;
        badgeColor = "bg-green-500/20 text-green-400 border-green-500/30";
      } else if (scoreTotal >= 30 && isPositiveNet) {
        badgeType = "ak_positive";
        badgeLabel = `AK +${formatVal(netValue)}`;
        badgeColor = "bg-green-500/10 text-green-500 border-green-500/20";
      } else if (netValue < 0) {
        badgeType = "ak_negative";
        badgeLabel = `📤 -${formatVal(Math.abs(broker.sell_value ?? 0))}`;
        badgeColor = "bg-red-500/10 text-red-400 border-red-500/20";
      }

      if (badgeType !== "none") {
        map.set(broker.ticker, {
          ticker: broker.ticker,
          tanggal: broker.tanggal,
          score: scoreTotal,
          netValue,
          buyValue: broker.buy_value,
          sellValue: broker.sell_value,
          ratio: score?.buy_vs_avg_ratio ?? 0,
          tagVsSaham: score?.tag_vs_saham ?? "NORMAL",
          tagVsAk: score?.tag_vs_ak ?? "NORMAL",
          streakBeli: score?.streak_beli ?? 0,
          streakJual: score?.streak_jual ?? 0,
          pctOfMarket: score?.pct_of_market ?? 0,
          valueSource: score?.value_source ?? "FALLBACK_HARDCODED",
          rollingWindow: 10,
          hasBandar,
          bandarTier: bandar?.tier,
          badgeType,
          badgeLabel,
          badgeColor,
        });
      }
    }

    return map;
  }, [latestScores, latestBrokerData, bandarData]);

  const getBadge = (ticker: string): AkSmartMoneyBadge | null => {
    return badgeMap.get(ticker) || null;
  };

  const getEntryBonus = (ticker: string): number => {
    const badge = badgeMap.get(ticker);
    if (!badge) return 0;
    if (badge.badgeType === "whale_bandar") return 5;
    if (badge.score >= 70) return 3;
    if (badge.score >= 50) return 2;
    if (badge.score >= 30) return 1;
    return 0;
  };

  const confluenceTickers = useMemo(() => {
    return [...badgeMap.values()].filter(b => b.badgeType === "whale_bandar");
  }, [badgeMap]);

  return {
    badgeMap,
    getBadge,
    getEntryBonus,
    confluenceTickers,
    latestDate: latestBrokerData[0]?.tanggal || null,
  };
}
