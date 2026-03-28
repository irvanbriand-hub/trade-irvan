// Parser for Bandarmology: /topl50 (primary) + /top20 (optional enrichment)

export interface ParsedBandarData {
  ticker: string;
  rank_score: number;
  composite_pct: number;
  market_cap: string;
  streak: number | null;
  streak_direction: string | null;
  is_new_entry: boolean;
  kode_broker: string | null;
  pattern: string;
  top1_pct: number | null;
  top1_broker: string | null;
  value: number | null;
  daily_pct: number | null;
  weekly_pct: number | null;
  liquidity: string | null;
  is_topl: boolean;
  is_top20: boolean;
  data_tier: "FULL" | "PARTIAL";
  tier: string;
}

export interface ParseResult {
  tanggal: string;
  toplCount: number;
  top20Count: number;
  merged: ParsedBandarData[];
  fullCount: number;
  partialCount: number;
  tierS: number;
  tierA: number;
  tierB: number;
  tierC: number;
  newTop20: number; // previously rank 21-50, now in top20
}

// ---- Emoji helpers ----

const CAP_EMOJI_MAP: Record<string, string> = {
  "🔵": "Big",
  "🟢": "Mid",
  "🟡": "Small",
  "🔴": "Micro",
  "⚪": "Unknown",
};

function emojiToCap(emoji: string): string {
  return CAP_EMOJI_MAP[emoji] || "Unknown";
}

function extractTickerAndCap(raw: string): { ticker: string; cap: string } {
  // Handle tickers like PBSA🔵, ACRO-W🔴, etc.
  const m = raw.match(/^([A-Z][A-Z0-9-]{1,7})\s*(🔵|🟢|🟡|🔴|⚪)?/u);
  if (m) {
    return { ticker: m[1], cap: m[2] ? emojiToCap(m[2]) : "Unknown" };
  }
  return { ticker: raw.replace(/[^A-Z0-9-]/g, ""), cap: "Unknown" };
}

// ---- Date extraction ----

function extractDate(text: string): string | null {
  const m = text.match(/📅?\s*(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const m2 = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return m2[0];
  return null;
}

// ---- Parse /topl50 ----

interface ToplEntry {
  rank: number;
  ticker: string;
  market_cap: string;
  composite_pct: number;
  streak: number | null;
  streak_direction: string | null;
  is_new_entry: boolean;
  kode_broker: string | null;
  pattern: string;
}

function parseTopl50(text: string): { date: string | null; entries: ToplEntry[] } {
  const date = extractDate(text);
  const entries: ToplEntry[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    // Skip header/separator/footer lines
    if (/^[─━═\s#]+$/.test(line) || /^\s*#\s+Ticker/i.test(line) || /^NEW=/i.test(line) || /^Cache:/i.test(line)) continue;

    // Match: " 1  PBSA🔵    76.6%   4d  ZP   Acc"
    // Ticker can contain A-Z, digits, dash (e.g. ACRO-W), followed by cap emoji
    const m = line.match(/^\s*(\d+)\s+([A-Z][A-Z0-9-]*(?:🔵|🟢|🟡|🔴|⚪))\s+([\d.]+)%\s+(.+)/u);
    if (!m) continue;

    const rank = parseInt(m[1]);
    const { ticker, cap } = extractTickerAndCap(m[2]);
    const compositePct = parseFloat(m[3]);
    const rest = m[4].trim();
    const parts = rest.split(/\s+/);

    let streak: number | null = null;
    let streakDir: string | null = null;
    let isNew = false;
    let broker: string | null = null;
    let pattern = "";

    for (const p of parts) {
      if (p === "NEW") {
        streak = 0;
        streakDir = "new";
        isNew = true;
      } else if (/^\d+d$/i.test(p)) {
        streak = parseInt(p);
        streakDir = "↑";
      } else if (/^[A-Z]{2,3}$/.test(p) && !broker && !/^(Acc|Dis|Neu)/i.test(p)) {
        broker = p;
      } else if (/^(Acc|Dis|Neu)/i.test(p)) {
        pattern = p;
      }
    }

    entries.push({
      rank,
      ticker,
      market_cap: cap,
      composite_pct: compositePct,
      streak,
      streak_direction: streakDir,
      is_new_entry: isNew,
      kode_broker: broker,
      pattern,
    });
  }

  return { date, entries };
}

// ---- Parse /top20 (verbose) ----

interface Top20Entry {
  rank: number;
  ticker: string;
  market_cap: string;
  composite_pct: number;
  top1_pct: number | null;
  top1_broker: string | null;
  value: number | null;
  daily_pct: number | null;
  weekly_pct: number | null;
  liquidity: string | null;
  pattern: string;
}

function parseTop20(text: string): { date: string | null; entries: Top20Entry[] } {
  const date = extractDate(text);
  const entries: Top20Entry[] = [];

  // Split by ticker blocks
  const blocks = text.split(/(?=\d+[.)]\s+[A-Z]{3,5})/);

  for (const block of blocks) {
    const tickerM = block.match(/^(\d+)[.)]\s+([A-Z]{3,5})\s*([🔵🟢🟡🔴⚪]?)/);
    if (!tickerM) continue;

    const rank = parseInt(tickerM[1]);
    const ticker = tickerM[2];
    const cap = tickerM[3] ? emojiToCap(tickerM[3]) : "Unknown";

    let composite = 0;
    let top1Pct: number | null = null;
    let top1Broker: string | null = null;
    let value: number | null = null;
    let dailyPct: number | null = null;
    let weeklyPct: number | null = null;
    let liquidity: string | null = null;
    let pattern = "";

    // Liquidity from first line
    const liqFirstLine = block.match(/(?:High|Mid|Low|Very\s*Low)\s*Liq/i);
    if (liqFirstLine) liquidity = liqFirstLine[0].replace(/\s*Liq$/i, "").trim();

    // Composite
    const compM = block.match(/Composite[:\s]+([\d.]+)%/i);
    if (compM) composite = parseFloat(compM[1]);

    // Top1
    const top1M = block.match(/Top1[:\s]+([\d.]+)%\s*\((\w+)\)/i);
    if (top1M) { top1Pct = parseFloat(top1M[1]); top1Broker = top1M[2]; }

    // Value
    const valM = block.match(/Value[:\s]+Rp\s*([\d.,]+)\s*([BMK])?/i);
    if (valM) {
      let v = parseFloat(valM[1].replace(/,/g, ""));
      if (valM[2]?.toUpperCase() === "B") v *= 1e9;
      else if (valM[2]?.toUpperCase() === "M") v *= 1e6;
      else if (valM[2]?.toUpperCase() === "K") v *= 1e3;
      value = v;
    }

    // Daily/Weekly
    const dailyM = block.match(/Daily[:\s]+([-\d.]+)%/i);
    if (dailyM) dailyPct = parseFloat(dailyM[1]);
    const weeklyM = block.match(/Weekly[:\s]+([-\d.]+)%/i);
    if (weeklyM) weeklyPct = parseFloat(weeklyM[1]);

    // Pattern
    const patM = block.match(/Pattern[:\s]+(\w+)/i);
    if (patM) pattern = patM[1];
    if (!pattern) {
      const accM = block.match(/(Accumulation|Distribution|Acc|Dis|Neutral)/i);
      if (accM) pattern = accM[1];
    }

    // Liquidity from dedicated line
    if (!liquidity) {
      const liqM = block.match(/Liq(?:uidity)?[:\s]+([\w\s]+?)(?:\n|$|,|\|)/i);
      if (liqM) liquidity = liqM[1].trim();
    }

    entries.push({
      rank,
      ticker,
      market_cap: cap,
      composite_pct: composite,
      top1_pct: top1Pct,
      top1_broker: top1Broker,
      value,
      daily_pct: dailyPct,
      weekly_pct: weeklyPct,
      liquidity,
      pattern,
    });
  }

  return { date, entries };
}

// ---- Tiering ----

function calculateTier(data: ParsedBandarData): string {
  const { rank_score, is_top20, market_cap, streak, composite_pct, liquidity } = data;
  const isBigMid = market_cap === "Big" || market_cap === "Mid";
  const isBigMidSmall = isBigMid || market_cap === "Small";

  // Tier C exclusions first
  if (market_cap === "Micro") return "C";
  if (liquidity?.toLowerCase().includes("very low")) return "C";
  if (composite_pct < 35) return "C";

  // Tier S
  if (rank_score <= 20 && is_top20 && isBigMid && (streak ?? 0) >= 2) return "S";

  // Tier A
  if (rank_score <= 20 && isBigMid && composite_pct >= 50) return "A";

  // Tier B
  if (rank_score <= 50 && isBigMidSmall && composite_pct >= 35) return "B";

  return "C";
}

// ---- Main parser ----

export function parseBandarmologyInput(topl50Text: string, top20Text?: string): ParseResult {
  const topl = parseTopl50(topl50Text);
  const top20 = top20Text?.trim() ? parseTop20(top20Text) : null;

  const tanggal = topl.date || top20?.date || new Date().toISOString().split("T")[0];

  // Build merged map from topl50
  const mergedMap = new Map<string, ParsedBandarData>();

  for (const e of topl.entries) {
    mergedMap.set(e.ticker, {
      ticker: e.ticker,
      rank_score: e.rank,
      composite_pct: e.composite_pct,
      market_cap: e.market_cap,
      streak: e.streak,
      streak_direction: e.streak_direction,
      is_new_entry: e.is_new_entry,
      kode_broker: e.kode_broker,
      pattern: e.pattern,
      top1_pct: null,
      top1_broker: null,
      value: null,
      daily_pct: null,
      weekly_pct: null,
      liquidity: null,
      is_topl: true,
      is_top20: false,
      data_tier: e.rank <= 20 ? "FULL" : "PARTIAL",
      tier: "C",
    });
  }

  // Merge top20 data
  let newTop20 = 0;
  if (top20) {
    for (const e of top20.entries) {
      const existing = mergedMap.get(e.ticker);
      if (existing) {
        existing.is_top20 = true;
        existing.data_tier = "FULL";
        existing.top1_pct = e.top1_pct;
        existing.top1_broker = e.top1_broker;
        existing.value = e.value;
        existing.daily_pct = e.daily_pct;
        existing.weekly_pct = e.weekly_pct;
        existing.liquidity = e.liquidity;
        if (e.pattern && !existing.pattern) existing.pattern = e.pattern;
        if (e.market_cap !== "Unknown" && existing.market_cap === "Unknown") {
          existing.market_cap = e.market_cap;
        }
        // If composite from top20 is higher, use it
        if (e.composite_pct > existing.composite_pct) {
          existing.composite_pct = e.composite_pct;
        }
        // Track if this was previously rank 21-50 but now in top20
        if (existing.rank_score > 20) {
          newTop20++;
        }
      } else {
        // ticker only in top20, not in topl50 (unusual but handle)
        mergedMap.set(e.ticker, {
          ticker: e.ticker,
          rank_score: e.rank,
          composite_pct: e.composite_pct,
          market_cap: e.market_cap,
          streak: null,
          streak_direction: null,
          is_new_entry: false,
          kode_broker: null,
          pattern: e.pattern,
          top1_pct: e.top1_pct,
          top1_broker: e.top1_broker,
          value: e.value,
          daily_pct: e.daily_pct,
          weekly_pct: e.weekly_pct,
          liquidity: e.liquidity,
          is_topl: false,
          is_top20: true,
          data_tier: "FULL",
          tier: "C",
        });
      }
    }
  }

  // Calculate tiers
  const merged: ParsedBandarData[] = [];
  for (const [, data] of mergedMap) {
    data.tier = calculateTier(data);
    merged.push(data);
  }

  // Sort by rank
  merged.sort((a, b) => a.rank_score - b.rank_score);

  const tierS = merged.filter(m => m.tier === "S").length;
  const tierA = merged.filter(m => m.tier === "A").length;
  const tierB = merged.filter(m => m.tier === "B").length;
  const tierC = merged.filter(m => m.tier === "C").length;

  return {
    tanggal,
    toplCount: topl.entries.length,
    top20Count: top20?.entries.length || 0,
    merged,
    fullCount: merged.filter(m => m.data_tier === "FULL").length,
    partialCount: merged.filter(m => m.data_tier === "PARTIAL").length,
    tierS,
    tierA,
    tierB,
    tierC,
    newTop20,
  };
}
