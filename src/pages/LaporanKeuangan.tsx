import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWrScanner, useImportToWrScanner } from "@/hooks/useWrScanner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Search, TrendingUp, TrendingDown, Rocket, AlertTriangle, CheckCircle, Plus, FileBarChart, CalendarDays, Info } from "lucide-react";

interface StatementRow {
  endDate: string | null;
  revenue: number | null;
  ebitda: number | null;
  netProfit: number | null;
  eps: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  roe: number | null;
  roa: number | null;
  debtToEquity: number | null;
}

interface FinancialData {
  header: {
    name: string;
    ticker: string;
    sector: string | null;
    industry: string | null;
    price: number | null;
    marketCap: number | null;
    currency: string;
  };
  quarterly: StatementRow[];
  annual: StatementRow[];
  lastReportDate?: string | null;
  mostRecentQuarter?: string | null;
  lastFiscalYearEnd?: string | null;
  error?: string;
}

const formatBig = (n: number | null) => {
  if (n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  return n.toLocaleString("id-ID");
};

const formatPct = (n: number | null) => {
  if (n === null || n === undefined) return "—";
  return `${n.toFixed(2)}%`;
};

const formatNum = (n: number | null, dec = 2) => {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("id-ID", { maximumFractionDigits: dec });
};

const pctChange = (current: number | null, prev: number | null) => {
  if (current === null || prev === null || prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
};

const ComparisonCard = ({ label, value }: { label: string; value: number | null }) => {
  if (value === null) return null;
  const isPositive = value >= 0;
  return (
    <div className={`flex items-center gap-2 p-3 rounded-lg border ${isPositive ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
      {isPositive ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-sm font-bold ${isPositive ? "text-green-500" : "text-red-500"}`}>
          {isPositive ? "+" : ""}{value.toFixed(2)}%
        </p>
      </div>
    </div>
  );
};

const dataRows: { label: string; key: keyof StatementRow; format: "big" | "pct" | "num" }[] = [
  { label: "Revenue", key: "revenue", format: "big" },
  { label: "EBITDA", key: "ebitda", format: "big" },
  { label: "Laba Bersih", key: "netProfit", format: "big" },
  { label: "EPS", key: "eps", format: "num" },
  { label: "Gross Margin %", key: "grossMargin", format: "pct" },
  { label: "Operating Margin %", key: "operatingMargin", format: "pct" },
  { label: "Net Profit Margin %", key: "netMargin", format: "pct" },
  { label: "ROE %", key: "roe", format: "pct" },
  { label: "ROA %", key: "roa", format: "pct" },
  { label: "Debt to Equity", key: "debtToEquity", format: "num" },
];

const formatCell = (row: StatementRow, key: keyof StatementRow, format: string) => {
  const val = row[key] as number | null;
  if (format === "big") return formatBig(val);
  if (format === "pct") return formatPct(val);
  return formatNum(val);
};

export default function LaporanKeuangan() {
  const [tickerInput, setTickerInput] = useState("");
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: wrScannerData } = useWrScanner();
  const importMutation = useImportToWrScanner();

  const handleAnalyze = async () => {
    const ticker = tickerInput.trim().toUpperCase();
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const { data: d, error: e } = await supabase.functions.invoke("yahoo-finance-financial-report", {
        body: { ticker },
      });
      if (e) throw e;
      if (d?.error && !d?.header) {
        setError(d.error);
      } else {
        setData(d);
      }
    } catch (err: any) {
      setError(err.message || "Gagal mengambil data");
    } finally {
      setLoading(false);
    }
  };

  // Quarterly data: Q0, Q-1, Q-4
  const q0 = data?.quarterly?.[0] || null;
  const q1 = data?.quarterly?.[1] || null;
  const q4 = data?.quarterly?.[3] || null; // 4th quarter back = YoY

  // Annual data: FY0, FY-1, FY-2
  const fy0 = data?.annual?.[0] || null;
  const fy1 = data?.annual?.[1] || null;
  const fy2 = data?.annual?.[2] || null;

  // Quarterly comparisons
  const labaQoQ = pctChange(q0?.netProfit, q1?.netProfit);
  const labaYoY = pctChange(q0?.netProfit, q4?.netProfit);
  const revQoQ = pctChange(q0?.revenue, q1?.revenue);
  const revYoY = pctChange(q0?.revenue, q4?.revenue);

  // Annual comparisons
  const labaFY01 = pctChange(fy0?.netProfit, fy1?.netProfit);
  const labaFY12 = pctChange(fy1?.netProfit, fy2?.netProfit);
  const revFY01 = pctChange(fy0?.revenue, fy1?.revenue);
  const revFY12 = pctChange(fy1?.revenue, fy2?.revenue);

  // Flags
  const flags: { icon: React.ReactNode; text: string; type: "success" | "warning" }[] = [];
  if (labaQoQ !== null && labaQoQ >= 50) flags.push({ icon: <Rocket className="h-4 w-4" />, text: "Laba Naik >50% QoQ", type: "success" });
  if (labaYoY !== null && labaYoY >= 50) flags.push({ icon: <Rocket className="h-4 w-4" />, text: "Laba Naik >50% YoY", type: "success" });
  if (
    fy0 && fy1 && fy2 &&
    fy0.revenue !== null && fy1.revenue !== null && fy2.revenue !== null &&
    fy0.netProfit !== null && fy1.netProfit !== null && fy2.netProfit !== null &&
    fy0.revenue > fy1.revenue && fy1.revenue > fy2.revenue &&
    fy0.netProfit > fy1.netProfit && fy1.netProfit > fy2.netProfit
  ) {
    flags.push({ icon: <CheckCircle className="h-4 w-4" />, text: "Tumbuh Konsisten Tahunan", type: "success" });
  }
  if (labaQoQ !== null && labaQoQ <= -20) flags.push({ icon: <AlertTriangle className="h-4 w-4" />, text: "Laba Turun >20% QoQ", type: "warning" });
  if (q0 && q1 && q0.netMargin !== null && q1.netMargin !== null && (q1.netMargin - q0.netMargin) > 5) {
    flags.push({ icon: <AlertTriangle className="h-4 w-4" />, text: "Margin Tertekan", type: "warning" });
  }

  // Add to WR Scanner logic
  const canAddToWr = (labaQoQ !== null && labaQoQ >= 50) || (labaYoY !== null && labaYoY >= 50);
  const today = new Date().toISOString().split("T")[0];
  const tickerClean = data?.header?.ticker?.replace(".JK", "") || tickerInput.toUpperCase();

  const handleAddToWrScanner = async () => {
    const alreadyExists = wrScannerData?.some(
      (item) => item.ticker === tickerClean && item.tanggal_import === today
    );

    if (alreadyExists) {
      const confirmed = window.confirm(`${tickerClean} sudah ada di WR Scanner hari ini. Tambah lagi?`);
      if (!confirmed) return;
    }

    try {
      await importMutation.mutateAsync([
        {
          ticker: tickerClean,
          screener_names: ["Laporan Keuangan +50%"],
          wl_kategori: "Laporan Keuangan +50%",
        },
      ]);
      toast({
        title: "Berhasil",
        description: `${tickerClean} berhasil ditambahkan ke WR Scanner dengan kategori Laporan Keuangan +50%`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const renderTable = (
    title: string,
    columns: { label: string; data: StatementRow | null }[]
  ) => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[140px]">Metrik</TableHead>
                {columns.map((col) => (
                  <TableHead key={col.label} className="text-right min-w-[120px]">{col.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dataRows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-medium text-muted-foreground">{row.label}</TableCell>
                  {columns.map((col) => (
                    <TableCell key={col.label} className="text-right font-mono text-sm">
                      {col.data ? formatCell(col.data, row.key, row.format) : "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileBarChart className="h-6 w-6 text-primary" />
          Analisis Laporan Keuangan
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Analisa fundamental kuartal & tahunan dari Yahoo Finance</p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Masukkan ticker (misal: BBCA)"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                className="pl-9"
              />
            </div>
            <Button onClick={handleAnalyze} disabled={loading || !tickerInput.trim()}>
              {loading ? (
                <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                "Analisa"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {/* Error */}
      {error && !data && (
        <Card>
          <CardContent className="py-8 text-center text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      {/* Results */}
      {data && (
        <div className="space-y-6">
          {/* Flags */}
          {flags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {flags.map((flag, i) => (
                <Badge
                  key={i}
                  variant={flag.type === "success" ? "default" : "destructive"}
                  className={`text-sm py-1.5 px-3 gap-1.5 ${flag.type === "success" ? "bg-green-600 hover:bg-green-700" : ""}`}
                >
                  {flag.icon}
                  {flag.text}
                </Badge>
              ))}
            </div>
          )}

          {/* Header */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-foreground">{data.header.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {data.header.ticker} • {data.header.sector || "—"} • {data.header.industry || "—"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold font-mono text-foreground">
                    Rp {formatNum(data.header.price, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    MCap: {formatBig(data.header.marketCap)}
                  </p>
                </div>
              </div>

              {/* Last Report Date */}
              {(data.lastReportDate || data.mostRecentQuarter) && (
                <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span>
                    Laporan terakhir: <span className="font-medium text-foreground">{data.mostRecentQuarter || data.lastReportDate}</span>
                    {data.lastFiscalYearEnd && (
                      <> • Akhir tahun fiskal: <span className="font-medium text-foreground">{data.lastFiscalYearEnd}</span></>
                    )}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Warning if limited data */}
          {data.error && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 text-sm text-yellow-600 dark:text-yellow-400">
              <Info className="h-4 w-4 shrink-0" />
              {data.error}
            </div>
          )}

          {/* No financial statements warning */}
          {data.quarterly.length === 0 && data.annual.length === 0 && !data.error && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 text-sm text-yellow-600 dark:text-yellow-400">
              <Info className="h-4 w-4 shrink-0" />
              Data laporan keuangan (income statement) tidak tersedia di Yahoo Finance untuk emiten ini.
            </div>
          )}

          {/* Quarterly Table */}
          {data.quarterly.length > 0 && (
            <>
              {renderTable("Tabel Kuartal", [
                { label: q0?.endDate ? `Q0 (${q0.endDate})` : "Q0", data: q0 },
                { label: q1?.endDate ? `Q-1 (${q1.endDate})` : "Q-1", data: q1 },
                { label: q4?.endDate ? `Q-4 (${q4.endDate})` : "Q-4", data: q4 },
              ])}

              {/* Quarterly Comparisons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <ComparisonCard label="Laba QoQ" value={labaQoQ} />
                <ComparisonCard label="Laba YoY" value={labaYoY} />
                <ComparisonCard label="Revenue QoQ" value={revQoQ} />
                <ComparisonCard label="Revenue YoY" value={revYoY} />
              </div>
            </>
          )}

          {/* Annual Table */}
          {data.annual.length > 0 && (
            <>
              {renderTable("Tabel Tahunan", [
                { label: fy0?.endDate ? `FY0 (${fy0.endDate})` : "FY0", data: fy0 },
                { label: fy1?.endDate ? `FY-1 (${fy1.endDate})` : "FY-1", data: fy1 },
                { label: fy2?.endDate ? `FY-2 (${fy2.endDate})` : "FY-2", data: fy2 },
              ])}

              {/* Annual Comparisons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <ComparisonCard label="Laba FY0 vs FY-1" value={labaFY01} />
                <ComparisonCard label="Laba FY-1 vs FY-2" value={labaFY12} />
                <ComparisonCard label="Revenue FY0 vs FY-1" value={revFY01} />
                <ComparisonCard label="Revenue FY-1 vs FY-2" value={revFY12} />
              </div>
            </>
          )}

          {/* Add to WR Scanner */}
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Tambahkan ke WR Scanner</p>
                <p className="text-xs text-muted-foreground">
                  {canAddToWr
                    ? "Emiten memenuhi kriteria Laba +50% QoQ/YoY"
                    : "Emiten belum memenuhi kriteria (Laba +50% QoQ atau YoY)"}
                </p>
              </div>
              <Button
                onClick={handleAddToWrScanner}
                disabled={!canAddToWr || importMutation.isPending}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Add to WR Scanner
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
