import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Complete IDX tickers - 956 emiten (source: idx.co.id)
const IDX_TICKERS = [
  "AALI","ABBA","ABDA","ABMM","ACES","ACST","ADES","ADHI","AISA","AKKU",
  "AKPI","AKRA","AKSI","ALDO","ALKA","ALMI","ALTO","AMAG","AMFG","AMIN",
  "AMRT","ANJT","ANTM","APEX","APIC","APII","APLI","APLN","ARGO","ARII",
  "ARNA","ARTA","ARTI","ARTO","ASBI","ASDM","ASGR","ASII","ASJT","ASMI",
  "ASRI","ASRM","ASSA","ATIC","AUTO","BABP","BACA","BAJA","BALI","BAPA",
  "BATA","BAYU","BBCA","BBHI","BBKP","BBLD","BBMD","BBNI","BBRI","BBRM",
  "BBTN","BBYB","BCAP","BCIC","BCIP","BDMN","BEKS","BEST","BFIN","BGTG",
  "BHIT","BIKA","BIMA","BINA","BIPI","BIPP","BIRD","BISI","BJBR","BJTM",
  "BKDP","BKSL","BKSW","BLTA","BLTZ","BMAS","BMRI","BMSR","BMTR","BNBA",
  "BNBR","BNGA","BNII","BNLI","BOLT","BPFI","BPII","BRAM","BRMS","BRNA",
  "BRPT","BSDE","BSIM","BSSR","BSWD","BTEK","BTEL","BTON","BTPN","BUDI",
  "BUKK","BULL","BUMI","BUVA","BVIC","BWPT","BYAN","CANI","CASS","CEKA",
  "CENT","CFIN","CINT","CITA","CLPI","CMNP","CMPP","CNKO","CNTX","COWL",
  "CPIN","CPRO","CSAP","CTBN","CTRA","CTTH","DART","DEFI","DEWA","DGIK",
  "DILD","DKFT","DLTA","DMAS","DNAR","DNET","DOID","DPNS","DSFI","DSNG",
  "DSSA","DUTI","DVLA","DYAN","ECII","EKAD","ELSA","ELTY","EMDE","EMTK",
  "ENRG","EPMT","ERAA","ERTX","ESSA","ESTI","ETWA","EXCL","FAST","FASW",
  "FISH","FMII","FORU","FPNI","GAMA","GDST","GDYR","GEMA","GEMS","GGRM",
  "GIAA","GJTL","GLOB","GMTD","GOLD","GOLL","GPRA","GSMF","GTBO","GWSA",
  "GZCO","HADE","HDFA","HERO","HEXA","HITS","HMSP","HOME","HOTL","HRUM",
  "IATA","IBFN","IBST","ICBP","ICON","IGAR","IIKP","IKAI","IKBI","IMAS",
  "IMJS","IMPC","INAF","INAI","INCI","INCO","INDF","INDR","INDS","INDX",
  "INDY","INKP","INPC","INPP","INRU","INTA","INTD","INTP","IPOL","ISAT",
  "ISSP","ITMA","ITMG","JAWA","JECC","JIHD","JKON","JPFA","JRPT","JSMR",
  "JSPT","JTPE","KAEF","KARW","KBLI","KBLM","KBLV","KBRI","KDSI","KIAS",
  "KICI","KIJA","KKGI","KLBF","KOBX","KOIN","KONI","KOPI","KPIG","KRAS",
  "KREN","LAPD","LCGP","LEAD","LINK","LION","LMAS","LMPI","LMSH","LPCK",
  "LPGI","LPIN","LPKR","LPLI","LPPF","LPPS","LRNA","LSIP","LTLS","MAGP",
  "MAIN","MAPI","MAYA","MBAP","MBSS","MBTO","MCOR","MDIA","MDKA","MDLN",
  "MDRN","MEDC","MEGA","MERK","META","MFMI","MGNA","MICE","MIDI","MIKA",
  "MIRA","MITI","MKPI","MLBI","MLIA","MLPL","MLPT","MMLP","MNCN","MPMX",
  "MPPA","MRAT","MREI","MSKY","MTDL","MTFN","MTLA","MTSM","MYOH","MYOR",
  "MYTX","NELY","NIKL","NIRO","NISP","NOBU","NRCA","OCAP","OKAS","OMRE",
  "PADI","PALM","PANR","PANS","PBRX","PDES","PEGE","PGAS","PGLI","PICO",
  "PJAA","PKPK","PLAS","PLIN","PNBN","PNBS","PNIN","PNLF","PSAB","PSDN",
  "PSKT","PTBA","PTIS","PTPP","PTRO","PTSN","PTSP","PUDP","PWON","PYFA",
  "RAJA","RALS","RANC","RBMS","RDTX","RELI","RICY","RIGS","RIMO","RODA",
  "ROTI","RUIS","SAFE","SAME","SCCO","SCMA","SCPI","SDMU","SDPC","SDRA",
  "SGRO","SHID","SIDO","SILO","SIMA","SIMP","SIPD","SKBM","SKLT","SKYB",
  "SMAR","SMBR","SMCB","SMDM","SMDR","SMGR","SMMA","SMMT","SMRA","SMRU",
  "SMSM","SOCI","SONA","SPMA","SQMI","SRAJ","SRIL","SRSN","SRTG","SSIA",
  "SSMS","SSTM","STAR","STTP","SUGI","SULI","SUPR","TALF","TARA","TAXI",
  "TBIG","TBLA","TBMS","TCID","TELE","TFCO","TGKA","TIFA","TINS","TIRA",
  "TIRT","TKIM","TLKM","TMAS","TMPO","TOBA","TOTL","TOTO","TOWR","TPIA",
  "TPMA","TRAM","TRIL","TRIM","TRIO","TRIS","TRST","TRUS","TSPC","ULTJ",
  "UNIC","UNIT","UNSP","UNTR","UNVR","VICO","VINS","VIVA","VOKS","VRNA",
  "WAPO","WEHA","WICO","WIIM","WIKA","WINS","WOMF","WSKT","WTON","YPAS",
  "YULE","ZBRA",
  // IPO 2015-2016
  "SHIP","CASA","DAYA","DPUM","IDPR","JGLE","KINO","MARI","MKNT","MTRA",
  "OASA","POWR","INCF","WSBP","PBSA","PRDA","BOGA",
  // IPO 2017
  "BRIS","PORT","CARS","MINA","CLEO","TAMU","CSIS","TGRA","FIRE","TOPS",
  "KMTR","ARMY","MAPB","WOOD","HRTA","MABA","HOKI","MPOW","MARK","NASA",
  "MDKI","BELL","KIOS","GMFI","MTWI","ZINC","MCAS","PPRE","WEGE","PSSI",
  "MORA","DWGL","PBID","JMAS","CAMP","IPCM","PCAR",
  // IPO 2018
  "LCKM","BOSS","HELI","JSKY","INPS","GHON","TDPM","DFAM","NICK","BTPS",
  "SPTO","PRIM","HEAL","TRUK","PZZA","TUGU","MSIN","SWAT","TNCA","MAPA",
  "TCPI","IPCC","RISE","BPTR","POLL","NFCX","MGRO","NUSA","FILM","ANDI",
  "LAND","MOLI","PANI","DIGI","CITY","SAPX","SURE","HKMU","MPRO","DUCK",
  "GOOD","SKRN","YELO","CAKK","SATU","SOSS","DEAL","POLA","DIVA","LUCK",
  "URBN","SOTS","ZONE","PEHA","KPAL","KPAS",
  // IPO 2019
  "FOOD","BEEF","POLI","CLAY","NATO","JAYA","COCO","MTPS","CPRI","HRME",
  "POSA","JAST","FITT","BOLA","CCSI","SFAN","POLU","KJEN","KAYU","ITIC",
  "PAMG","IPTV","BLUE","ENVY","EAST","LIFE","FUJI","KOTA","INOV","ARKA",
  "SMKL","HDIT","KEEN","BAPI","TFAS","GGRP","OPMS","NZIA","SLIS","PURE",
  "IRRA","DMMX","SINI","WOWS","ESIP","TEBE","KEJU","PSGO","AGAR","IFSH",
  "REAL","IFII","PMJS","UCID","GLVA",
  // IPO 2020
  "PGJO","AMAR","CSRA","INDO","AMOR","TRIN","DMND","PURA","PTPW","TAMA",
  "IKAN","SAMF","SBAT","KBAG","CBMF","RONY","CSMI","BBSS","BHAT","CASH",
  "TECH","EPAC","UANG","PGUN","SOFA","PPGL","TOYS","SGER","TRJA","PNGO",
  "SCNP","BBSI","KMDS","PURI","SOHO","HOMI","ROCK","ENZO","PLAN","PTDU",
  "ATAP","VICI","PMMP","BANK","WMUU","EDGE","UNIQ","BEBS","SNLK","ZYRX",
  "LFLO","FIMP","WIFI",
  // IPO 2021
  "FAPA","DCII","KETR","DGNS","UFOE","TAPG","NPGF","LUCY","ADCP","HOPE",
  "MGLV","TRUE","LABA","ARCI","IPAC","MASB","BMHS","FLMC","NICL","UVCR",
  "BUKA","HAIS","OILS","GPSO","MCOL","RSGK","RUNS","SBMA","CMNT","GTSI",
  "IDEA","KUAS","BOBA","MTEL","DEPO","BINO","CMRY","WGSH","TAYS","WMPP",
  "RMKE","OBMD","AVIA","IPPE","NASI","BSML","DRMA",
  // IPO 2022
  "ADMR","SEMA","ASLC","NETV","BAUT","ENAK","NTBK","SMKM","STAA","NANO",
  "BIKE","WIRG","SICO","GOTO","TLDN","MTMH","WINR","IBOS","OLIV","ASHA",
  "SWID","TRGU","ARKO","CHEM","DEWI","AXIO","KRYA","HATM","RCCC","GULA",
  "JARR","AMMS","RAFI","KKES","ELPI","EURO","KLIN","TOOL","BUAH","CRAB",
  "MEDS","COAL","PRAY","CBUT","BELI","MKTR","OMED","BSBK","PDPP","KDTN",
  "ZATA","NINE","MMIX","PADA","ISAP","VTNY",
  // IPO 2023
  "SOUL","ELIT","BEER","CBPE","SUNI","CBRE","WINE","BMBL","PEVE","LAJU",
  "FWCT","NAYZ","IRSX","PACK","VAST","CHIP","HALO","KING","PGEO","FUTR",
  "HILL","BDKR","PTMP","SAGE","TRON","CUAN","NSSS","GTRA","HAJJ","JATI",
  "TYRE","MPXL","SMIL","KLAS","MAXI","VKTR","RELF","AMMN","CRSN","GRPM",
  "WIDI","TGUK","INET","MAHA","RMKO","CNMA","FOLK","HBAT","GRIA","PPRI",
  "ERAL","CYBR","MUTU","LMAX","HUMI","MSIE","RSCH","BABY","AEGS","IOTF",
  "KOCI","PTPS","BREN","STRK","KOKA","LOPI","UDNG","RGAS","MSTI","IKPM",
  "AYAM","SURI","PIPA","NCKL","MENN","AWAN","MBMA","RAAM","DOOH",
  // IPO 2024
  "ASLI","GRPH","SMGA","UNTD","TOSK","MPIX","ALII","MKAP","MEJA","LIVE",
  "HYGN","BAIK","VISI","AREA","MHKI","ATLA","DATA","SOLA","BATR","SPRE",
  "PART","GOLF","ISEA","BLES","GUNA","LABS","DOSS","NEST","PTMR","VERN",
  "DAAZ","BOAT","NAIK","AADI","MDIY","KSIX","RATU","YOII","HGII","BRRC",
  "DGWG","CBDK","OBAT","MINE","ASPR","PSAT","COIN","CDIA","BLOG","MERI",
  "CHEK","PMUI","EMAS","PJHB","RLCO","SUPA","KAQI","YUPI","FORE","MDLA",
  "DKHH","CGAS","NICE","MSJA","SMLE","ACRO","MANG",
  // Remaining
  "AYLS","DADA","ASPI","ESTA","BESS","AMAN","CARE","MFIN","ADMF","ADMG",
  "ADRO","AGII","AGRO","AGRS","AHAP","AIMS","PNSE","POLY","POOL","PPRO",
  "HDTX","FREN","MAMI","NIPS","KRAH",
];

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
};

interface StockData {
  ticker: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  value: number;
  prevClose: number;
  prevHigh: number;
  prevLow: number;
  prevOpen: number;
  prevVolume: number;
  prev2Close: number;
  prev2High: number;
  prev3Close: number;
  sma3: number;
  sma5: number;
  sma10: number;
  sma20: number;
  sma50: number;
  sma200: number;
  ema10: number;
  ema20: number;
  ema50: number;
  bbMean: number;
  bbTop: number;
  bbBottom: number;
  bbWidth: number;
  prevBbBottom: number;
  prevCloseBelowBbBottom: boolean;
  prevLlvLow5: number;
  smaVol20: number;
  smaVol5: number;
  prevSma5: number;
  name: string;
}

function calcSMA(closes: number[], period: number): number {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcEMA(closes: number[], period: number): number {
  if (closes.length < period) return 0;
  const k = 2 / (period + 1);
  let ema = closes[0];
  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcBB(closes: number[], period = 20, mult = 2) {
  if (closes.length < period) return { mean: 0, top: 0, bottom: 0, width: 0 };
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  const top = mean + mult * std;
  const bottom = mean - mult * std;
  const width = mean > 0 ? (top - bottom) / mean : 0;
  return { mean: +mean.toFixed(2), top: +top.toFixed(2), bottom: +bottom.toFixed(2), width: +width.toFixed(4) };
}

function calcLLV(lows: number[], period: number): number {
  if (lows.length < period) return 0;
  return Math.min(...lows.slice(-period));
}

async function fetchChartData(ticker: string): Promise<{
  closes: number[]; highs: number[]; lows: number[]; opens: number[]; volumes: number[];
  meta: { shortName?: string; longName?: string; regularMarketTime?: number };
} | null> {
  try {
    const symbol = `${ticker}.JK`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
    const resp = await fetch(url, { headers: YAHOO_HEADERS });
    if (!resp.ok) return null;
    const data = await resp.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;
    const quote = result.indicators?.quote?.[0];
    if (!quote) return null;
    const rawCloses = quote.close || [];
    const rawHighs = quote.high || [];
    const rawLows = quote.low || [];
    const rawOpens = quote.open || [];
    const rawVolumes = quote.volume || [];
    const len = rawCloses.length;
    
    // Filter rows where ALL OHLC values are valid to keep arrays aligned
    const closes: number[] = [];
    const highs: number[] = [];
    const lows: number[] = [];
    const opens: number[] = [];
    const volumes: number[] = [];
    for (let i = 0; i < len; i++) {
      const c = rawCloses[i] ?? 0;
      const h = rawHighs[i] ?? 0;
      const l = rawLows[i] ?? 0;
      const o = rawOpens[i] ?? 0;
      const v = rawVolumes[i] ?? 0;
      if (c > 0 && h > 0 && l > 0 && o > 0) {
        closes.push(c);
        highs.push(h);
        lows.push(l);
        opens.push(o);
        volumes.push(v);
      }
    }
    if (closes.length < 20) return null;
    const meta = result.meta || {};
    return { closes, highs, lows, opens, volumes, meta };
  } catch {
    return null;
  }
}

function buildStockData(ticker: string, chart: NonNullable<Awaited<ReturnType<typeof fetchChartData>>>): StockData {
  const { closes, highs, lows, opens, volumes, meta } = chart;
  const n = closes.length;
  const lastClose = closes[n - 1];
  const lastHigh = highs[highs.length - 1] || lastClose;
  const lastLow = lows[lows.length - 1] || lastClose;
  const lastOpen = opens[opens.length - 1] || lastClose;
  const lastVolume = volumes[volumes.length - 1] || 0;
  const prevClose = n >= 2 ? closes[n - 2] : lastClose;
  const prevHigh = highs.length >= 2 ? highs[highs.length - 2] : prevClose;
  const prevLow = lows.length >= 2 ? lows[lows.length - 2] : prevClose;
  const prevOpen = opens.length >= 2 ? opens[opens.length - 2] : prevClose;
  const prevVolume = volumes.length >= 2 ? volumes[volumes.length - 2] : 0;
  const prev2Close = n >= 3 ? closes[n - 3] : prevClose;
  const prev2High = highs.length >= 3 ? highs[highs.length - 3] : prev2Close;
  const prev3Close = n >= 4 ? closes[n - 4] : prev2Close;
  const bb = calcBB(closes);
  const prevCloses = closes.slice(0, -1);
  const prevBb = calcBB(prevCloses);
  const prevLows = lows.slice(0, -1);

  return {
    ticker,
    close: lastClose,
    open: lastOpen,
    high: lastHigh,
    low: lastLow,
    volume: lastVolume,
    value: lastVolume * lastClose,
    prevClose, prevHigh, prevLow, prevOpen, prevVolume,
    prev2Close, prev2High, prev3Close,
    sma3: calcSMA(closes, 3),
    sma5: calcSMA(closes, 5),
    sma10: calcSMA(closes, 10),
    sma20: calcSMA(closes, 20),
    sma50: calcSMA(closes, 50),
    sma200: calcSMA(closes, 200),
    ema10: calcEMA(closes, 10),
    ema20: calcEMA(closes, 20),
    ema50: calcEMA(closes, 50),
    bbMean: bb.mean, bbTop: bb.top, bbBottom: bb.bottom, bbWidth: bb.width,
    prevBbBottom: prevBb.bottom,
    prevCloseBelowBbBottom: prevBb.bottom > 0 && prevClose < prevBb.bottom,
    prevLlvLow5: calcLLV(prevLows, 5),
    smaVol20: calcSMA(volumes.map(v => v), 20),
    smaVol5: calcSMA(volumes.map(v => v), 5),
    prevSma5: calcSMA(closes.slice(0, -1), 5),
    name: meta.longName || meta.shortName || ticker,
  };
}

async function fetchBatchWithMarketTime(tickers: string[], batchSize = 25): Promise<{ stocks: StockData[]; latestMarketTime: number }> {
  const results: StockData[] = [];
  let latestMarketTime = 0;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(async (t) => {
      const chart = await fetchChartData(t);
      if (!chart) return null;
      if (chart.meta.regularMarketTime && chart.meta.regularMarketTime > latestMarketTime) {
        latestMarketTime = chart.meta.regularMarketTime;
      }
      return buildStockData(t, chart);
    }));
    for (const r of batchResults) {
      if (r) results.push(r);
    }
  }
  return { stocks: results, latestMarketTime };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let batchIndex: number | undefined;
    let batchSize = 100;
    try {
      const body = await req.json();
      batchIndex = body?.batchIndex;
      if (body?.batchSize) batchSize = body.batchSize;
    } catch {}

    const allTickers = IDX_TICKERS;
    let tickersToProcess: string[];
    if (batchIndex !== undefined) {
      const start = batchIndex * batchSize;
      tickersToProcess = allTickers.slice(start, start + batchSize);
    } else {
      tickersToProcess = allTickers;
    }

    const totalBatches = Math.ceil(allTickers.length / batchSize);
    console.log(`Scanning batch ${batchIndex ?? 'all'}: ${tickersToProcess.length} of ${allTickers.length} tickers (total batches: ${totalBatches})`);

    if (tickersToProcess.length === 0) {
      return new Response(JSON.stringify({ stocks: [], total: allTickers.length, fetched: 0, totalBatches, batchIndex }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { stocks, latestMarketTime } = await fetchBatchWithMarketTime(tickersToProcess, 25);
    console.log(`Got data for ${stocks.length} stocks, latestMarketTime: ${latestMarketTime}`);

    return new Response(JSON.stringify({
      stocks,
      total: allTickers.length,
      fetched: stocks.length,
      totalBatches,
      batchIndex: batchIndex ?? -1,
      totalTickers: allTickers.length,
      latestMarketTime,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Screener error:', error);
    return new Response(JSON.stringify({ error: error.message, stocks: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
