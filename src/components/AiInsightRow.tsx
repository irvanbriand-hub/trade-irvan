import React, { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Bot, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface AiInsightButtonProps {
  ticker: string;
  price?: number;
  changePct?: number;
  volume?: number;
  technical?: Record<string, any>;
  bandarmology?: Record<string, any>;
  isExpanded: boolean;
  onToggle: () => void;
}

// Module-level cache
const insightCache: Record<string, { insight: any; cached: boolean; created_at: string }> = {};

export function AiInsightButton({ ticker, isExpanded, onToggle }: AiInsightButtonProps) {
  return (
    <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[9px] gap-0.5" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
      <Bot className="h-3 w-3" /> AI
    </Button>
  );
}

interface AiInsightPanelProps {
  ticker: string;
  price?: number;
  changePct?: number;
  volume?: number;
  technical?: Record<string, any>;
  bandarmology?: Record<string, any>;
  onClose?: () => void;
}

const SECTIONS = [
  { key: "section1_snapshot", icon: "📊", title: "Snapshot Data Terkini", highlight: true, defaultOpen: true },
  { key: "section2_bisnis", icon: "🏢", title: "Background Perusahaan & Model Bisnis", highlight: true, defaultOpen: false },
  { key: "section3_regulasi", icon: "⚖️", title: "Analisis Regulasi", highlight: false, defaultOpen: false },
  { key: "section4_keuangan", icon: "📈", title: "Tren Kinerja Keuangan 5 Tahun", highlight: false, defaultOpen: false },
  { key: "section5_konglomerat", icon: "🤝", title: "Konglomerat & Hubungan", highlight: false, defaultOpen: false },
  { key: "section6_rumor", icon: "🕵️", title: "Rumor Akuisisi", highlight: false, defaultOpen: false },
  { key: "section7_makro", icon: "🏭", title: "Makro Industri", highlight: false, defaultOpen: false },
  { key: "section8_skenario", icon: "🚀", title: "Skenario Upside (≥4 Skenario)", highlight: true, defaultOpen: true },
  { key: "section9_risiko", icon: "⚠️", title: "Risiko yang Sering Diabaikan", highlight: false, defaultOpen: false },
  { key: "section10_katalis", icon: "⏰", title: "Timeline Katalis", highlight: false, defaultOpen: false },
  { key: "section11_verdict", icon: "✅", title: "Verdict Akhir", highlight: true, defaultOpen: true },
];

const LOADING_MESSAGES = [
  "🔍 Menganalisa bisnis...",
  "📊 Menghitung skenario...",
  "⚖️ Menyusun verdict...",
];

export function AiInsightPanel({ ticker, price, changePct, volume, technical, bandarmology, onClose }: AiInsightPanelProps) {
  const [loading, setLoading] = useState(!insightCache[ticker]);
  const [error, setError] = useState<string | null>(null);
  const [insight, setInsight] = useState<any>(insightCache[ticker]?.insight || null);
  const [isCached, setIsCached] = useState(insightCache[ticker]?.cached || false);
  const [createdAt, setCreatedAt] = useState(insightCache[ticker]?.created_at || "");
  const [retryCount, setRetryCount] = useState(0);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(SECTIONS.filter(s => s.defaultOpen).map(s => s.key))
  );

  const toggleSection = (key: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const fetchInsight = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    setRetryCount(0);
    let msgIdx = 0;
    const msgInterval = setInterval(() => {
      msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[msgIdx]);
    }, 3000);

    const doFetch = async (attempt: number): Promise<void> => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("gemini-insight", {
          body: { ticker, price, changePct, volume, technical, bandarmology, forceRefresh },
        });
        if (fnError) {
          if (attempt < 3 && (fnError.message?.includes("429") || fnError.message?.includes("Rate limit"))) {
            setRetryCount(attempt + 1);
            await new Promise(r => setTimeout(r, 5000));
            return doFetch(attempt + 1);
          }
          throw new Error(fnError.message || "Function error");
        }
        if (data?.error) {
          if (data.retryable && attempt < 3) {
            setRetryCount(attempt + 1);
            await new Promise(r => setTimeout(r, Math.max(5, Number(data.retry_after_sec) || 5) * 1000));
            return doFetch(attempt + 1);
          }
          throw new Error(data.error);
        }
        insightCache[ticker] = { insight: data.insight, cached: data.cached, created_at: data.created_at };
        setInsight(data.insight);
        setIsCached(data.cached);
        setCreatedAt(data.created_at);
        setLoading(false);
      } catch (err: any) {
        if (attempt < 3 && err.message?.includes("Rate limit")) {
          setRetryCount(attempt + 1);
          await new Promise(r => setTimeout(r, 5000));
          return doFetch(attempt + 1);
        }
        setError(err.message || "Gagal mengambil insight");
        setLoading(false);
      }
    };

    await doFetch(0);
    clearInterval(msgInterval);
  }, [ticker, price, changePct, volume, technical, bandarmology]);

  React.useEffect(() => {
    if (!insightCache[ticker]) fetchInsight();
    else setLoading(false);
  }, [ticker]); // eslint-disable-line

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-xs">{loadingMsg}{retryCount > 0 ? ` (retry ${retryCount}/3)` : ""}</span>
        <span className="text-[10px]">Estimasi: 15-30 detik</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 space-y-2">
        <p className="text-xs text-destructive">❌ {error}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => fetchInsight()}>Coba Lagi</Button>
          {onClose && <Button variant="ghost" size="sm" className="text-xs h-7" onClick={onClose}>Close</Button>}
        </div>
      </div>
    );
  }

  if (!insight) return null;

  const header = insight.header || {};
  const verdict = insight.section11_verdict || {};

  return (
    <div className="p-3 sm:p-4 space-y-3 text-xs bg-card/50 border-t border-border">
      {/* Main Header */}
      <div className="space-y-1">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="font-bold text-sm">🤖 AI Stock Analysis: {ticker}</span>
          <div className="flex items-center gap-2">
            {isCached && <Badge variant="outline" className="text-[8px]">📦 Cache</Badge>}
            {createdAt && <span className="text-[9px] text-muted-foreground">{new Date(createdAt).toLocaleString("id-ID")}</span>}
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[9px]" onClick={() => fetchInsight(true)}>
              <RefreshCw className="h-3 w-3 mr-1" />Refresh
            </Button>
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground border-t border-b border-border py-1">
          🔍 ANALISIS SAHAM {ticker} ({header.nama_emiten || "—"} / {header.nama_lain || "—"}) — JUJUR, MENDALAM, TIDAK BIAS
        </div>
        <p className="text-[9px] text-yellow-500">⚠️ Disclaimer: Analisis ini bersifat edukatif dan bukan rekomendasi investasi.</p>
      </div>

      {/* 11 Collapsible Sections */}
      {SECTIONS.map((sec, idx) => {
        const isOpen = openSections.has(sec.key);
        const sectionData = insight[sec.key];
        if (!sectionData) return null;

        return (
          <div key={sec.key} className={cn("rounded-lg border", sec.highlight ? "border-primary/30 bg-primary/5" : "border-border bg-card/30")}>
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
              onClick={() => toggleSection(sec.key)}
            >
              {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
              <span className="font-semibold text-xs">{idx + 1}. {sec.icon} {sec.title}</span>
            </button>
            {isOpen && (
              <div className="px-3 pb-3 space-y-2">
                {sec.key === "section1_snapshot" && <Section1 data={sectionData} />}
                {sec.key === "section2_bisnis" && <Section2 data={sectionData} ticker={ticker} />}
                {sec.key === "section3_regulasi" && <Section3 data={sectionData} />}
                {sec.key === "section4_keuangan" && <Section4 data={sectionData} />}
                {sec.key === "section5_konglomerat" && <Section5 data={sectionData} />}
                {sec.key === "section6_rumor" && <Section6 data={sectionData} />}
                {sec.key === "section7_makro" && <Section7 data={sectionData} />}
                {sec.key === "section8_skenario" && <Section8 data={sectionData} />}
                {sec.key === "section9_risiko" && <Section9 data={sectionData} />}
                {sec.key === "section10_katalis" && <Section10 data={sectionData} />}
                {sec.key === "section11_verdict" && <Section11 data={sectionData} />}
              </div>
            )}
          </div>
        );
      })}

      {/* Footer */}
      <div className="space-y-1 pt-2 border-t border-border">
        <p className="text-[9px] text-muted-foreground">📝 Analisis berdasarkan data tersedia hingga {new Date().toLocaleDateString("id-ID")}</p>
        <p className="text-[9px] text-muted-foreground">⚠️ Bukan rekomendasi beli/jual. Selalu lakukan riset mandiri (DYOR).</p>
        <p className="text-[9px] text-muted-foreground">⚠️ Konten dihasilkan oleh AI. Verifikasi dari sumber resmi sebelum keputusan investasi.</p>
        {onClose && (
          <div className="flex justify-end pt-1">
            <Button variant="ghost" size="sm" className="text-xs h-7 px-3" onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* === SECTION COMPONENTS === */

function Section1({ data }: { data: any }) {
  const params = [
    ["Kode Saham", data.kode_saham], ["Nama Emiten", data.nama_emiten], ["Sektor", data.sektor],
    ["Bursa", data.bursa], ["Harga Terakhir", data.harga_terakhir], ["Market Cap", data.market_cap],
    ["Range 52W", data.range_52w], ["Volume Rata²", data.volume_rata2],
    ["P/E Ratio", data.pe_ratio], ["PBV", data.pbv], ["Free Float", data.free_float], ["IPO Tahun", data.ipo_tahun],
  ].filter(([, v]) => v);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {params.map(([label, val]) => (
          <div key={label as string} className="bg-muted/30 rounded p-1.5">
            <p className="text-[9px] text-muted-foreground">{label}</p>
            <p className="font-mono text-[10px] font-bold">{val}</p>
          </div>
        ))}
      </div>
      {data.catatan_krusial && (
        <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-[10px]">
          ⚠️ <span className="font-bold">CATATAN KRUSIAL:</span> {data.catatan_krusial}
        </div>
      )}
      {data.pergerakan_singkat && <p className="text-[10px] text-muted-foreground">• {data.pergerakan_singkat}</p>}
    </div>
  );
}

function Section2({ data, ticker }: { data: any; ticker: string }) {
  return (
    <div className="space-y-2">
      {data.profil_singkat && <p className="text-[10px] text-muted-foreground">{data.profil_singkat}</p>}
      {data.model_bisnis_detail && <p className="text-[10px]">{data.model_bisnis_detail}</p>}
      {data.revenue_streams?.length > 0 && (
        <div className="border border-border rounded p-2 space-y-1">
          <p className="font-bold text-[10px]">REVENUE STREAMS {ticker}:</p>
          {data.revenue_streams.map((r: any, i: number) => (
            <p key={i} className="text-[10px] text-muted-foreground">{i + 1}. {r.nama} ({r.porsi}) → {r.karakteristik}</p>
          ))}
        </div>
      )}
      {data.kelemahan_model?.length > 0 && (
        <div>
          <p className="font-semibold text-[10px] text-red-400">Kelemahan:</p>
          {data.kelemahan_model.map((k: string, i: number) => <p key={i} className="text-[10px] text-muted-foreground">• {k}</p>)}
        </div>
      )}
      {data.keunggulan_kompetitif?.length > 0 && (
        <div>
          <p className="font-semibold text-[10px] text-green-400">Keunggulan:</p>
          {data.keunggulan_kompetitif.map((k: string, i: number) => <p key={i} className="text-[10px] text-muted-foreground">• {k}</p>)}
        </div>
      )}
    </div>
  );
}

function Section3({ data }: { data: any }) {
  return (
    <div className="space-y-2">
      {data.overview && <p className="text-[10px] text-muted-foreground">{data.overview}</p>}
      {data.tabel_regulasi?.length > 0 && (
        <div className="overflow-x-auto rounded border border-border/50">
          <Table>
            <TableHeader><TableRow><TableHead className="text-[9px]">Regulasi</TableHead><TableHead className="text-[9px]">Dampak</TableHead><TableHead className="text-[9px]">Sentimen</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.tabel_regulasi.map((r: any, i: number) => (
                <TableRow key={i}><TableCell className="text-[10px]">{r.regulasi}</TableCell><TableCell className="text-[10px]">{r.dampak}</TableCell><TableCell className="text-[10px]">{r.sentimen}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {data.analisis_mendalam && <p className="text-[10px]">{data.analisis_mendalam}</p>}
      {data.risiko_regulasi?.length > 0 && (
        <div>{data.risiko_regulasi.map((r: string, i: number) => <p key={i} className="text-[10px] text-red-400">⚠️ {r}</p>)}</div>
      )}
    </div>
  );
}

function Section4({ data }: { data: any }) {
  return (
    <div className="space-y-2">
      {data.catatan && <p className="text-[10px] text-muted-foreground italic">{data.catatan}</p>}
      {data.tabel_kinerja?.length > 0 && (
        <div className="overflow-x-auto rounded border border-border/50">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-[9px]">Tahun</TableHead><TableHead className="text-[9px]">Pendapatan</TableHead>
              <TableHead className="text-[9px]">Laba Kotor</TableHead><TableHead className="text-[9px]">Laba Bersih</TableHead>
              <TableHead className="text-[9px]">GPM</TableHead><TableHead className="text-[9px]">NPM</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.tabel_kinerja.map((r: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="text-[10px] font-mono">{r.tahun}</TableCell>
                  <TableCell className="text-[10px]">{r.pendapatan}</TableCell>
                  <TableCell className="text-[10px]">{r.laba_kotor}</TableCell>
                  <TableCell className="text-[10px]">{r.laba_bersih}</TableCell>
                  <TableCell className="text-[10px]">{r.gpm}</TableCell>
                  <TableCell className="text-[10px]">{r.npm}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {data.red_flags?.length > 0 && data.red_flags.map((f: string, i: number) => <p key={i} className="text-[10px] text-red-400">🔴 {f}</p>)}
      {data.yellow_flags?.length > 0 && data.yellow_flags.map((f: string, i: number) => <p key={i} className="text-[10px] text-yellow-400">🟡 {f}</p>)}
      {data.analisis_cashflow && <p className="text-[10px]">{data.analisis_cashflow}</p>}
      {data.kesehatan_neraca?.length > 0 && (
        <div className="grid grid-cols-2 gap-1">
          {data.kesehatan_neraca.map((k: any, i: number) => (
            <div key={i} className="bg-muted/30 rounded p-1.5 text-[10px]"><span className="text-muted-foreground">{k.indikator}:</span> <span className="font-bold">{k.status}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

function Section5({ data }: { data: any }) {
  return (
    <div className="space-y-2">
      {data.struktur_pemegang_saham?.length > 0 && (
        <div className="overflow-x-auto rounded border border-border/50">
          <Table>
            <TableHeader><TableRow><TableHead className="text-[9px]">Pemegang</TableHead><TableHead className="text-[9px]">Kepemilikan</TableHead><TableHead className="text-[9px]">Catatan</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.struktur_pemegang_saham.map((s: any, i: number) => (
                <TableRow key={i}><TableCell className="text-[10px]">{s.pemegang}</TableCell><TableCell className="text-[10px] font-mono">{s.kepemilikan}</TableCell><TableCell className="text-[10px] text-muted-foreground">{s.catatan}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {data.afiliasi_konglomerat && <p className="text-[10px]">{data.afiliasi_konglomerat}</p>}
      {data.tidak_ada_afiliasi?.length > 0 && (
        <div className="p-2 bg-muted/30 rounded text-[10px]">
          <p className="font-bold mb-1">Tidak terafiliasi dengan:</p>
          {data.tidak_ada_afiliasi.map((k: string, i: number) => <p key={i}>❌ {k}</p>)}
        </div>
      )}
      {data.implikasi?.map((im: string, i: number) => <p key={i} className="text-[10px] text-muted-foreground">• {im}</p>)}
      {data.relasi_bisnis?.map((r: string, i: number) => <p key={i} className="text-[10px] text-muted-foreground">🔗 {r}</p>)}
    </div>
  );
}

function Section6({ data }: { data: any }) {
  return (
    <div className="space-y-2">
      {data.status_overview && <p className="text-[10px]">{data.status_overview}</p>}
      {data.tabel_rumor?.length > 0 && (
        <div className="overflow-x-auto rounded border border-border/50">
          <Table>
            <TableHeader><TableRow><TableHead className="text-[9px]">Rumor</TableHead><TableHead className="text-[9px]">Probabilitas</TableHead><TableHead className="text-[9px]">Analisis</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.tabel_rumor.map((r: any, i: number) => (
                <TableRow key={i}><TableCell className="text-[10px]">{r.rumor}</TableCell><TableCell className="text-[10px] font-mono">{r.probabilitas}</TableCell><TableCell className="text-[10px] text-muted-foreground">{r.analisis}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {data.mengapa_sulit?.length > 0 && (
        <div><p className="font-semibold text-[10px] text-red-400">Mengapa sulit:</p>{data.mengapa_sulit.map((m: string, i: number) => <p key={i} className="text-[10px] text-muted-foreground">• {m}</p>)}</div>
      )}
      {data.mengapa_bisa?.length > 0 && (
        <div><p className="font-semibold text-[10px] text-green-400">Mengapa bisa:</p>{data.mengapa_bisa.map((m: string, i: number) => <p key={i} className="text-[10px] text-muted-foreground">• {m}</p>)}</div>
      )}
      {data.peringatan && <p className="text-[10px] text-yellow-400">⚠️ {data.peringatan}</p>}
    </div>
  );
}

function Section7({ data }: { data: any }) {
  return (
    <div className="space-y-2">
      {data.market_size?.length > 0 && (
        <div className="overflow-x-auto rounded border border-border/50">
          <Table>
            <TableHeader><TableRow><TableHead className="text-[9px]">Segmen</TableHead><TableHead className="text-[9px]">Nilai</TableHead><TableHead className="text-[9px]">CAGR</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.market_size.map((m: any, i: number) => (
                <TableRow key={i}><TableCell className="text-[10px]">{m.segmen}</TableCell><TableCell className="text-[10px] font-mono">{m.nilai}</TableCell><TableCell className="text-[10px]">{m.cagr}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {data.faktor_positif?.map((f: string, i: number) => <p key={i} className="text-[10px] text-green-400">🟢 {f}</p>)}
      {data.faktor_negatif?.map((f: string, i: number) => <p key={i} className="text-[10px] text-red-400">🔴 {f}</p>)}
      {data.landscape_kompetitor && (
        <div className="p-2 bg-muted/30 rounded text-[10px] space-y-1">
          <p className="font-bold">Landscape Kompetitor:</p>
          {data.landscape_kompetitor.tier1?.length > 0 && <p>🥇 Tier 1: {data.landscape_kompetitor.tier1.join(", ")}</p>}
          {data.landscape_kompetitor.tier2?.length > 0 && <p>🥈 Tier 2: {data.landscape_kompetitor.tier2.join(", ")}</p>}
          {data.landscape_kompetitor.tier3 && <p>🥉 Tier 3: {data.landscape_kompetitor.tier3}</p>}
        </div>
      )}
      {data.posisi_di_industri && <p className="text-[10px] font-bold">{data.posisi_di_industri}</p>}
    </div>
  );
}

function Section8({ data }: { data: any }) {
  const scenarioColors: Record<string, string> = {
    "📗": "border-green-500/30 bg-green-500/5",
    "📘": "border-blue-500/30 bg-blue-500/5",
    "📙": "border-yellow-500/30 bg-yellow-500/5",
    "🚀": "border-purple-500/30 bg-purple-500/5",
  };

  return (
    <div className="space-y-2">
      {data.asumsi_dasar && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
          {Object.entries(data.asumsi_dasar).map(([k, v]) => (
            <div key={k} className="bg-muted/30 rounded p-1.5 text-[10px]">
              <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}:</span> <span className="font-bold">{v as string}</span>
            </div>
          ))}
        </div>
      )}
      {data.skenario?.map((s: any, i: number) => (
        <div key={i} className={cn("border rounded p-2 space-y-1", scenarioColors[s.icon] || "border-border")}>
          <p className="font-bold text-[11px]">{s.icon} {s.nama} ({s.probabilitas})</p>
          {s.asumsi?.map((a: string, j: number) => <p key={j} className="text-[10px] text-muted-foreground">• {a}</p>)}
          <div className="flex gap-3 text-[10px]">
            <span>🎯 Target: <span className="font-bold">{s.target_harga}</span></span>
            <span>📈 Return: <span className="font-bold">{s.return}</span></span>
          </div>
          {s.logika && <p className="text-[9px] text-muted-foreground italic">{s.logika}</p>}
        </div>
      ))}
      {data.matriks_ringkasan?.length > 0 && (
        <div className="overflow-x-auto rounded border border-border/50">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-[9px]">Skenario</TableHead><TableHead className="text-[9px]">Prob</TableHead>
              <TableHead className="text-[9px]">Target</TableHead><TableHead className="text-[9px]">Return</TableHead><TableHead className="text-[9px]">Risk</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.matriks_ringkasan.map((m: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="text-[10px]">{m.skenario}</TableCell><TableCell className="text-[10px]">{m.prob}</TableCell>
                  <TableCell className="text-[10px] font-mono">{m.target}</TableCell><TableCell className="text-[10px]">{m.return}</TableCell><TableCell className="text-[10px]">{m.risk}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {data.expected_value && <p className="text-[10px] font-bold">📊 Expected Value: {data.expected_value}</p>}
      {data.kesimpulan_ev && <p className="text-[10px] text-muted-foreground">{data.kesimpulan_ev}</p>}
    </div>
  );
}

function Section9({ data }: { data: any }) {
  return (
    <div className="space-y-2">
      {data.risiko_kritis?.length > 0 && (
        <div className="space-y-1">
          <p className="font-semibold text-[10px] text-red-400">🔴 Risiko Kritis:</p>
          {data.risiko_kritis.map((r: any) => (
            <div key={r.nomor} className="p-2 bg-red-500/5 border border-red-500/20 rounded text-[10px]">
              <p className="font-bold">{r.nomor}. {r.judul}</p>
              <p className="text-muted-foreground">{r.deskripsi}</p>
            </div>
          ))}
        </div>
      )}
      {data.risiko_signifikan?.length > 0 && (
        <div className="space-y-1">
          <p className="font-semibold text-[10px] text-yellow-400">🟡 Risiko Signifikan:</p>
          {data.risiko_signifikan.map((r: any) => (
            <div key={r.nomor} className="p-2 bg-yellow-500/5 border border-yellow-500/20 rounded text-[10px]">
              <p className="font-bold">{r.nomor}. {r.judul}</p>
              <p className="text-muted-foreground">{r.deskripsi}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Section10({ data }: { data: any }) {
  return (
    <div className="space-y-2">
      {data.kalender?.length > 0 && (
        <div className="space-y-1">
          {data.kalender.map((k: any, i: number) => (
            <div key={i} className="text-[10px]">
              <p className="font-bold">{k.periode}</p>
              {k.events?.map((e: string, j: number) => <p key={j} className="text-muted-foreground pl-2">• {e}</p>)}
            </div>
          ))}
        </div>
      )}
      {data.katalis_positif?.length > 0 && (
        <div className="overflow-x-auto rounded border border-border/50">
          <Table>
            <TableHeader><TableRow><TableHead className="text-[9px]">🚀 Katalis Positif</TableHead><TableHead className="text-[9px]">Trigger</TableHead><TableHead className="text-[9px]">Impact</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.katalis_positif.map((k: any, i: number) => (
                <TableRow key={i}><TableCell className="text-[10px] text-green-400">{k.katalis}</TableCell><TableCell className="text-[10px]">{k.trigger}</TableCell><TableCell className="text-[10px]">{k.impact}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {data.katalis_negatif?.length > 0 && (
        <div className="overflow-x-auto rounded border border-border/50">
          <Table>
            <TableHeader><TableRow><TableHead className="text-[9px]">📉 Katalis Negatif</TableHead><TableHead className="text-[9px]">Trigger</TableHead><TableHead className="text-[9px]">Impact</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.katalis_negatif.map((k: any, i: number) => (
                <TableRow key={i}><TableCell className="text-[10px] text-red-400">{k.katalis}</TableCell><TableCell className="text-[10px]">{k.trigger}</TableCell><TableCell className="text-[10px]">{k.impact}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function Section11({ data }: { data: any }) {
  return (
    <div className="space-y-2">
      {data.scorecard?.length > 0 && (
        <div className="overflow-x-auto rounded border border-border/50">
          <Table>
            <TableHeader><TableRow><TableHead className="text-[9px]">Dimensi</TableHead><TableHead className="text-[9px]">Score</TableHead><TableHead className="text-[9px]">Komentar</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.scorecard.map((s: any, i: number) => (
                <TableRow key={i}><TableCell className="text-[10px] font-bold">{s.dimensi}</TableCell><TableCell className="text-[10px] font-mono">{s.score}</TableCell><TableCell className="text-[10px] text-muted-foreground">{s.komentar}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {data.total_score && <p className="text-[11px] font-bold">Total Score: {data.total_score}</p>}
      {data.rating && (
        <div className="p-2 bg-primary/10 border border-primary/30 rounded text-center">
          <p className="font-bold text-sm">RATING: {data.rating}</p>
        </div>
      )}
      <div className="space-y-1">
        {data.verdict_konservatif && <p className="text-[10px]">🛡️ <span className="font-bold">Konservatif:</span> {data.verdict_konservatif}</p>}
        {data.verdict_moderat && <p className="text-[10px]">⚖️ <span className="font-bold">Moderat:</span> {data.verdict_moderat}</p>}
        {data.verdict_trader && <p className="text-[10px]">🎯 <span className="font-bold">Trader:</span> {data.verdict_trader}</p>}
      </div>
      {data.tiga_hal_sebelum_beli?.length > 0 && (
        <div className="p-2 bg-muted/30 rounded text-[10px] space-y-0.5">
          <p className="font-bold">3 Hal Sebelum Beli:</p>
          {data.tiga_hal_sebelum_beli.map((h: string, i: number) => <p key={i}>{i + 1}. {h}</p>)}
        </div>
      )}
      {data.bottom_line && (
        <div className="p-3 border-2 border-primary/40 rounded-lg text-center space-y-1">
          <p className="text-[11px] font-bold">{data.bottom_line}</p>
          {data.total_score && data.rating && (
            <p className="text-[10px]">⭐️ Rating: {data.total_score} — {data.rating}</p>
          )}
        </div>
      )}
    </div>
  );
}
