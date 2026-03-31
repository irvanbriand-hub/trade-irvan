import { useState, useMemo } from "react";
import { usePortfolio } from "./usePortfolio";
import { useModalSummary } from "./useModalTransactions";
import { useStampDuty } from "./useStampDuty";

export type DisplayMode = "rp" | "pct";

export function useEquityToggle() {
  const [mode, setMode] = useState<DisplayMode>(() => {
    return (sessionStorage.getItem("equity-display-mode") as DisplayMode) || "rp";
  });

  const toggle = () => {
    const next = mode === "rp" ? "pct" : "rp";
    sessionStorage.setItem("equity-display-mode", next);
    setMode(next);
  };

  return { mode, toggle, setMode };
}

export function useEquityCalc() {
  const { totalRealizedPL, totalUnrealizedPL } = usePortfolio();
  const { modalBersih } = useModalSummary();
  const { data: stampDuties } = useStampDuty();

  // Use modal bersih from DB; fallback to 0 if no transactions yet
  const effectiveModal = modalBersih > 0 ? modalBersih : 0;

  // Total biaya materai yang sudah terjadi
  const totalStampDuty = useMemo(() => {
    if (!stampDuties) return 0;
    return stampDuties.reduce((sum, s) => sum + s.amount, 0);
  }, [stampDuties]);

  const totalEquity = useMemo(() => {
    return effectiveModal + totalRealizedPL + totalUnrealizedPL - totalStampDuty;
  }, [effectiveModal, totalRealizedPL, totalUnrealizedPL, totalStampDuty]);

  const toPct = (rupiah: number) => {
    if (effectiveModal <= 0) return 0;
    return (rupiah / effectiveModal) * 100;
  };

  const formatPct = (pct: number) => {
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
  };

  const formatRupiah = (val: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(val);

  const formatValue = (rupiah: number, mode: DisplayMode) => {
    if (mode === "pct") return formatPct(toPct(rupiah));
    return formatRupiah(rupiah);
  };

  const returnPct = effectiveModal > 0
    ? ((totalRealizedPL + totalUnrealizedPL) / effectiveModal) * 100
    : 0;

  return { totalEquity, toPct, formatPct, formatRupiah, formatValue, modalBersih: effectiveModal, returnPct, totalStampDuty };
}
