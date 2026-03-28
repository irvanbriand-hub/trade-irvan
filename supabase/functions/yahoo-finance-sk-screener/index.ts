import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
};

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
  "SHIP","CASA","DAYA","DPUM","IDPR","JGLE","KINO","MARI","MKNT","MTRA",
  "OASA","POWR","INCF","WSBP","PBSA","PRDA","BOGA",
  "BRIS","PORT","CARS","MINA","CLEO","TAMU","CSIS","TGRA","FIRE","TOPS",
  "KMTR","ARMY","MAPB","WOOD","HRTA","MABA","HOKI","MPOW","MARK","NASA",
  "MDKI","BELL","KIOS","GMFI","MTWI","ZINC","MCAS","PPRE","WEGE","PSSI",
  "MORA","DWGL","PBID","JMAS","CAMP","IPCM","PCAR",
  "LCKM","BOSS","HELI","JSKY","INPS","GHON","TDPM","DFAM","NICK","BTPS",
  "SPTO","PRIM","HEAL","TRUK","PZZA","TUGU","MSIN","SWAT","TNCA","MAPA",
  "TCPI","IPCC","RISE","BPTR","POLL","NFCX","MGRO","NUSA","FILM","ANDI",
  "LAND","MOLI","PANI","DIGI","CITY","SAPX","SURE","HKMU","MPRO","DUCK",
  "GOOD","SKRN","YELO","CAKK","SATU","SOSS","DEAL","POLA","DIVA","LUCK",
  "URBN","SOTS","ZONE","PEHA","KPAL","KPAS",
  "FOOD","BEEF","POLI","CLAY","NATO","JAYA","COCO","MTPS","CPRI","HRME",
  "POSA","JAST","FITT","BOLA","CCSI","SFAN","POLU","KJEN","KAYU","ITIC",
  "PAMG","IPTV","BLUE","ENVY","EAST","LIFE","FUJI","KOTA","INOV","ARKA",
  "SMKL","HDIT","KEEN","BAPI","TFAS","GGRP","OPMS","NZIA","SLIS","PURE",
  "IRRA","DMMX","SINI","WOWS","ESIP","TEBE","KEJU","PSGO","AGAR","IFSH",
  "REAL","IFII","PMJS","UCID","GLVA",
  "PGJO","AMAR","CSRA","INDO","AMOR","TRIN","DMND","PURA","PTPW","TAMA",
  "IKAN","SAMF","SBAT","KBAG","CBMF","RONY","CSMI","BBSS","BHAT","CASH",
  "TECH","EPAC","UANG","PGUN","SOFA","PPGL","TOYS","SGER","TRJA","PNGO",
  "SCNP","BBSI","KMDS","PURI","SOHO","HOMI","ROCK","ENZO","PLAN","PTDU",
  "ATAP","VICI","PMMP","BANK","WMUU","EDGE","UNIQ","BEBS","SNLK","ZYRX",
  "LFLO","FIMP","WIFI",
  "FAPA","DCII","KETR","DGNS","UFOE","TAPG","NPGF","LUCY","ADCP","HOPE",
  "MGLV","TRUE","LABA","ARCI","IPAC","MASB","BMHS","FLMC","NICL","UVCR",
  "BUKA","HAIS","OILS","GPSO","MCOL","RSGK","RUNS","SBMA","CMNT","GTSI",
  "IDEA","KUAS","BOBA","MTEL","DEPO","BINO","CMRY","WGSH","TAYS","WMPP",
  "RMKE","OBMD","AVIA","IPPE","NASI","BSML","DRMA",
  "ADMR","SEMA","ASLC","NETV","BAUT","ENAK","NTBK","SMKM","STAA","NANO",
  "BIKE","WIRG","SICO","GOTO","TLDN","MTMH","WINR","IBOS","OLIV","ASHA",
  "SWID","TRGU","ARKO","CHEM","DEWI","AXIO","KRYA","HATM","RCCC","GULA",
  "JARR","AMMS","RAFI","KKES","ELPI","EURO","KLIN","TOOL","BUAH","CRAB",
  "MEDS","COAL","PRAY","CBUT","BELI","MKTR","OMED","BSBK","PDPP","KDTN",
  "ZATA","NINE","MMIX","PADA","ISAP","VTNY",
  "SOUL","ELIT","BEER","CBPE","SUNI","CBRE","WINE","BMBL","PEVE","LAJU",
  "FWCT","NAYZ","IRSX","PACK","VAST","CHIP","HALO","KING","PGEO","FUTR",
  "HILL","BDKR","PTMP","SAGE","TRON","CUAN","NSSS","GTRA","HAJJ","JATI",
  "TYRE","MPXL","SMIL","KLAS","MAXI","VKTR","RELF","AMMN","CRSN","GRPM",
  "WIDI","TGUK","INET","MAHA","RMKO","CNMA","FOLK","HBAT","GRIA","PPRI",
  "ERAL","CYBR","MUTU","LMAX","HUMI","MSIE","RSCH","BABY","AEGS","IOTF",
  "KOCI","PTPS","BREN","STRK","KOKA","LOPI","UDNG","RGAS","MSTI","IKPM",
  "AYAM","SURI","PIPA","NCKL","MENN","AWAN","MBMA","RAAM","DOOH",
  "ASLI","GRPH","SMGA","UNTD","TOSK","MPIX","ALII","MKAP","MEJA","LIVE",
  "HYGN","BAIK","VISI","AREA","MHKI","ATLA","DATA","SOLA","BATR","SPRE",
  "PART","GOLF","ISEA","BLES","GUNA","LABS","DOSS","NEST","PTMR","VERN",
  "DAAZ","BOAT","NAIK","AADI","MDIY","KSIX","RATU","YOII","HGII","BRRC",
  "DGWG","CBDK","OBAT","MINE","ASPR","PSAT","COIN","CDIA","BLOG","MERI",
  "CHEK","PMUI","EMAS","PJHB","RLCO","SUPA","KAQI","YUPI","FORE","MDLA",
  "DKHH","CGAS","NICE","MSJA","SMLE","ACRO","MANG",
  "AYLS","DADA","ASPI","ESTA","BESS","AMAN","CARE","MFIN","ADMF","ADMG",
  "ADRO","AGII","AGRO","AGRS","AHAP","AIMS","PNSE","POLY","POOL","PPRO",
  "HDTX","FREN","MAMI","NIPS","KRAH",
];

// ===== INDICATOR HELPERS =====

function smaAt(arr: number[], period: number, idx: number): number {
  if (idx < period - 1) return NaN;
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) sum += arr[i];
  return sum / period;
}

function emaArr(arr: number[], period: number): number[] {
  const r: number[] = new Array(arr.length);
  if (arr.length === 0) return r;
  const k = 2 / (period + 1);
  r[0] = arr[0];
  for (let i = 1; i < arr.length; i++) {
    r[i] = arr[i] * k + r[i - 1] * (1 - k);
  }
  return r;
}

function calcMACD(closes: number[]) {
  const ema12 = emaArr(closes, 12);
  const ema26 = emaArr(closes, 26);
  const macd: number[] = [];
  for (let i = 0; i < closes.length; i++) macd[i] = ema12[i] - ema26[i];
  const signal = emaArr(macd, 9);
  return { macd, signal };
}

function calcStoch(closes: number[], highs: number[], lows: number[], kPeriod: number, kSmooth: number, dSmooth: number) {
  const n = closes.length;
  const rawK: number[] = new Array(n).fill(NaN);
  for (let i = kPeriod - 1; i < n; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (highs[j] > hh) hh = highs[j];
      if (lows[j] < ll) ll = lows[j];
    }
    rawK[i] = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
  }
  // K = SMA(rawK, kSmooth)
  const kLine: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (i < kPeriod - 1 + kSmooth - 1) continue;
    let sum = 0, cnt = 0;
    for (let j = i - kSmooth + 1; j <= i; j++) {
      if (!isNaN(rawK[j])) { sum += rawK[j]; cnt++; }
    }
    if (cnt === kSmooth) kLine[i] = sum / cnt;
  }
  // D = SMA(K, dSmooth)
  const dLine: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let j = i - dSmooth + 1; j <= i; j++) {
      if (j >= 0 && !isNaN(kLine[j])) { sum += kLine[j]; cnt++; }
    }
    if (cnt === dSmooth) dLine[i] = sum / cnt;
  }
  return { k: kLine, d: dLine };
}

function calcADX(closes: number[], highs: number[], lows: number[], period: number) {
  const n = closes.length;
  const tr: number[] = [0];
  const pDM: number[] = [0];
  const mDM: number[] = [0];
  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    const up = highs[i] - highs[i - 1];
    const dn = lows[i - 1] - lows[i];
    pDM[i] = up > dn && up > 0 ? up : 0;
    mDM[i] = dn > up && dn > 0 ? dn : 0;
  }
  const sTR: number[] = new Array(n).fill(0);
  const sPDM: number[] = new Array(n).fill(0);
  const sMDM: number[] = new Array(n).fill(0);
  if (n <= period) return { adx: new Array(n).fill(0) };
  let sumTR = 0, sumP = 0, sumM = 0;
  for (let i = 1; i <= period; i++) { sumTR += tr[i]; sumP += pDM[i]; sumM += mDM[i]; }
  sTR[period] = sumTR; sPDM[period] = sumP; sMDM[period] = sumM;
  for (let i = period + 1; i < n; i++) {
    sTR[i] = sTR[i - 1] - sTR[i - 1] / period + tr[i];
    sPDM[i] = sPDM[i - 1] - sPDM[i - 1] / period + pDM[i];
    sMDM[i] = sMDM[i - 1] - sMDM[i - 1] / period + mDM[i];
  }
  const dx: number[] = new Array(n).fill(0);
  for (let i = period; i < n; i++) {
    const pDI = sTR[i] > 0 ? (sPDM[i] / sTR[i]) * 100 : 0;
    const mDI = sTR[i] > 0 ? (sMDM[i] / sTR[i]) * 100 : 0;
    const s = pDI + mDI;
    dx[i] = s > 0 ? (Math.abs(pDI - mDI) / s) * 100 : 0;
  }
  const adx: number[] = new Array(n).fill(0);
  const adxStart = period * 2;
  if (adxStart < n) {
    let s = 0;
    for (let i = period; i < adxStart; i++) s += dx[i];
    adx[adxStart - 1] = s / period;
    for (let i = adxStart; i < n; i++) {
      adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
    }
  }
  return { adx };
}

function crossAbove(a: number[], b: number[], idx: number): boolean {
  if (idx < 1 || isNaN(a[idx]) || isNaN(b[idx]) || isNaN(a[idx - 1]) || isNaN(b[idx - 1])) return false;
  return a[idx] > b[idx] && a[idx - 1] <= b[idx - 1];
}

function calcIIScore(
  mGtS: boolean, mup: boolean, sup: boolean, msup: boolean,
  k5: number, d5: number, adxama: boolean, sdn: boolean,
  crossMS: boolean, crossSM: boolean, mdn: boolean, msdn: boolean, mLtS: boolean
): number {
  let ii = 0;
  ii += mGtS ? 1 : 0;
  ii += mup ? 1 : 0;
  ii += sup ? 1 : 0;
  ii += msup ? 2 : 0;
  // k5>d5 AND 20<k5<80 appears twice as +0.5, = +1.0 total
  if (!isNaN(k5) && !isNaN(d5) && k5 > d5 && k5 > 20 && k5 < 80) ii += 1;
  if (!isNaN(k5) && k5 > 80 && adxama && sup) ii += 2;
  if (crossMS) ii += 1;
  // k5<d5 AND 20<k5<80 appears twice as -0.5, = -1.0 total
  if (!isNaN(k5) && !isNaN(d5) && k5 < d5 && k5 > 20 && k5 < 80) ii -= 1;
  if (!isNaN(k5) && k5 < 20 && adxama && sdn) ii -= 2;
  ii -= mdn ? 1 : 0;
  ii -= sdn ? 1 : 0;
  ii -= mLtS ? 1 : 0;
  ii -= msdn ? 2 : 0;
  if (crossSM) ii -= 1;
  return ii;
}

// ===== MAIN PROCESSING =====

interface SKResult {
  ticker: string;
  name: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  value: number;
  prevClose: number;
  changePct: number;
  // Volume debug
  vv1: number;
  vma60: number;
  v3ma60: number;
  v5ma60: number;
  v10ma60: number;
  v30ma90: number;
  vok: boolean;
  vokTipe: string;
  rp: number;
  // MA debug
  ma3: number;
  ma5: number;
  ma10: number;
  ma20: number;
  ma50: number;
  dma3: number;
  dma5: number;
  dma10: number;
  dma20: number;
  dma50: number;
  tma20: number;
  tma50: number;
  // Momentum debug
  ii: number;
  iiy: number;
  is_val: number;
  k5: number;
  d5: number;
  adx13: number;
  // Conditions
  safebull: boolean;
  safemsp: boolean;
  jalur: string;
  macdKondisi: string;
  stochKondisi: string;
  adxKondisi: string;
}

async function processStock(ticker: string): Promise<SKResult | null> {
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

    const closes: number[] = [], highs: number[] = [], lows: number[] = [], opens: number[] = [], volumes: number[] = [];
    const rawLen = (quote.close || []).length;
    for (let i = 0; i < rawLen; i++) {
      const c = quote.close?.[i], h = quote.high?.[i], l = quote.low?.[i], o = quote.open?.[i], v = quote.volume?.[i];
      if (c > 0 && h > 0 && l > 0 && o > 0 && v != null) {
        closes.push(c); highs.push(h); lows.push(l); opens.push(o); volumes.push(v);
      }
    }
    if (closes.length < 100) return null;

    const n = closes.length;
    const i = n - 1; // last index
    const C = closes[i], L = lows[i], V = volumes[i], H = highs[i], O = opens[i];

    // MAs
    const ma3 = smaAt(closes, 3, i);
    const ma5 = smaAt(closes, 5, i);
    const ma10 = smaAt(closes, 10, i);
    const ma20 = smaAt(closes, 20, i);
    const ma50 = smaAt(closes, 50, i);
    const ma3p = smaAt(closes, 3, i - 1);
    const ma5p = smaAt(closes, 5, i - 1);
    if (isNaN(ma20)) return null;

    // Volume ratios
    const Vp1 = volumes[i - 1] || 1, Vp2 = volumes[i - 2] || 1;
    const vv0 = V / Vp1;
    const vv1 = (V / Vp1) + (Vp1 / Vp2);
    const sV60 = smaAt(volumes, 60, i);
    const vm60 = sV60 > 0 ? V / sV60 : 0;
    const vma60 = sV60 > 0 ? (Vp1 + V) / sV60 : 0;
    const sV3 = smaAt(volumes, 3, i), sV5 = smaAt(volumes, 5, i);
    const sV10 = smaAt(volumes, 10, i), sV30 = smaAt(volumes, 30, i);
    const sV90 = smaAt(volumes, 90, i);
    const v3ma60 = sV60 > 0 && !isNaN(sV3) ? sV3 / sV60 : 0;
    const v5ma60 = sV60 > 0 && !isNaN(sV5) ? sV5 / sV60 : 0;
    const v10ma60 = sV60 > 0 && !isNaN(sV10) ? sV10 / sV60 : 0;
    const v30ma90 = !isNaN(sV90) && sV90 > 0 && !isNaN(sV30) ? sV30 / sV90 : 0;

    const rp = V * C / 1_000_000;
    const rpP = Vp1 * closes[i - 1] / 1_000_000;

    // Distance
    const dma3 = C > 0 ? (ma3 - C) / C * 100 : 0;
    const dma5 = C > 0 ? (ma5 - C) / C * 100 : 0;
    const dma10 = C > 0 ? (!isNaN(ma10) ? (ma10 - C) / C * 100 : 0) : 0;
    const dma20 = C > 0 ? (ma20 - C) / C * 100 : 0;
    const dma50 = C > 0 && !isNaN(ma50) ? (ma50 - C) / C * 100 : 0;
    const tma20 = (dma3 + dma5 + dma10 + dma20) / 4;
    const tma50 = (dma3 + dma5 + dma10 + dma20 + dma50) / 5;

    // MACD
    const { macd, signal } = calcMACD(closes);
    const m = macd[i], s = signal[i], ms = m - s;
    const mp = macd[i - 1], sp = signal[i - 1], msp_val = mp - sp;
    const mup = m > mp, mdn = m < mp;
    const msup = ms > msp_val, msdn = ms < msp_val;
    const sup = s > sp, sdn = s < sp;
    const crossMS = crossAbove(macd, signal, i);
    const crossSM = crossAbove(signal, macd, i);

    // Stochastic(15,3,3)
    const { k: kArr, d: dArr } = calcStoch(closes, highs, lows, 15, 3, 3);
    const k5 = kArr[i], d5 = dArr[i];
    const kup = !isNaN(k5) && !isNaN(kArr[i - 1]) && k5 > kArr[i - 1];
    const crossKD = crossAbove(kArr, dArr, i);
    const msp_cond = kup && crossKD && mup && crossMS;

    // ADX(13)
    const { adx } = calcADX(closes, highs, lows, 13);
    const adx13 = adx[i];
    const adxEma = emaArr(adx, 2);
    const adxama = adx13 > adxEma[i];

    // ii score
    const ii = calcIIScore(m > s, mup, sup, msup, k5, d5, adxama, sdn, crossMS, crossSM, mdn, msdn, m < s);
    // Previous day ii
    const mp2 = macd[i - 2], sp2 = signal[i - 2];
    const mupP = mp > mp2, mdnP = mp < mp2;
    const supP = sp > sp2, sdnP = sp < sp2;
    const msupP = msp_val > (mp2 - sp2), msdnP = msp_val < (mp2 - sp2);
    const crossMSP = crossAbove(macd, signal, i - 1);
    const crossSMP = crossAbove(signal, macd, i - 1);
    const adxamaP = adx[i - 1] > adxEma[i - 1];
    const k5p = kArr[i - 1], d5p = dArr[i - 1];
    const iiy = calcIIScore(mp > sp, mupP, supP, msupP, k5p, d5p, adxamaP, sdnP, crossMSP, crossSMP, mdnP, msdnP, mp < sp);
    const is_val = ii - iiy;

    // === CRITERIA ===
    // VOK
    const vok = (vv1 > 2 || vma60 > 2 || v3ma60 > 2 || v5ma60 > 2 || v10ma60 > 2 || v30ma90 > 2)
      && (rp + rpP) > 1000;

    let vokTipe = "";
    if (vok) {
      const t: string[] = [];
      if (vv1 > 2) t.push("vv1");
      if (vma60 > 2) t.push("Vma60");
      if (v3ma60 > 2) t.push("V3MA60");
      if (v5ma60 > 2) t.push("V5MA60");
      if (v10ma60 > 2) t.push("V10MA60");
      if (v30ma90 > 2) t.push("V30MA90");
      vokTipe = t.join(",");
    }

    // KONDISI A
    const kondisiA = C > L
      && (C > ma3 || (!isNaN(ma3p) && ma3 > ma3p))
      && (C > ma5 || (!isNaN(ma5p) && ma5 > ma5p))
      && C > ma10 && C > ma20
      && (C < 1.05 * ma3 || C < 1.05 * ma5 || C < 1.05 * ma10 || C < 1.05 * ma20);

    // BULLISH
    const bullish = rp > 50 && (ii > 0 || is_val >= -1) && kondisiA;

    // SAFEBULL
    const safebull = bullish && (
      (tma20 > -3 && C > ma3 && C > ma5 && C > ma10 && C > ma20)
      || (!isNaN(ma50) && tma50 > -3 && C > ma3 && C > ma5 && C > ma10 && C > ma20 && C > ma50)
    );

    // SAFEMSP
    const safemsp = msp_cond && dma3 > -3 && dma3 < 0;

    // SUPERKETAT
    if (!vok || !(safebull || safemsp)) return null;

    let jalur = "";
    if (safebull && safemsp) jalur = "KEDUANYA";
    else if (safebull) jalur = "SAFEBULL";
    else jalur = "SAFEMSP";

    // Condition labels
    let macdKondisi = "Bearish";
    if (crossMS) macdKondisi = "Bullish Cross";
    else if (m > s && mup) macdKondisi = "Bullish";
    else if (m > s && mdn) macdKondisi = "Weakening";

    let stochKondisi = "Bearish";
    if (crossKD) stochKondisi = "Golden Cross";
    else if (!isNaN(k5) && k5 > 80) stochKondisi = "Overbought";
    else if (!isNaN(k5) && k5 < 20) stochKondisi = "Oversold";
    else if (!isNaN(k5) && !isNaN(d5) && k5 > d5 && k5 >= 20 && k5 <= 80) stochKondisi = "Bullish";

    let adxKondisi = "Fading";
    if (adx13 > 25 && adxama) adxKondisi = "Strong Trend";
    else if (adx13 < 25 && adxama) adxKondisi = "Building";
    else if (adx13 < 20) adxKondisi = "Weak Trend";

    const prevClose = closes[i - 1];
    const changePct = prevClose > 0 ? ((C - prevClose) / prevClose) * 100 : 0;
    const name = result.meta?.longName || result.meta?.shortName || ticker;

    // VV0VV1 Confluence
    const isConfluence = (vv0 > 2 || vv1 > 2) && vm60 > 2 && rp > 0.1;

    return {
      ticker, name, close: C, open: O, high: H, low: L,
      volume: V, value: V * C, prevClose, changePct,
      vv1, vv0, vm60, vma60, v3ma60, v5ma60, v10ma60, v30ma90, vok, vokTipe, rp,
      ma3: isNaN(ma3) ? 0 : ma3, ma5: isNaN(ma5) ? 0 : ma5,
      ma10: isNaN(ma10) ? 0 : ma10, ma20: isNaN(ma20) ? 0 : ma20,
      ma50: isNaN(ma50) ? 0 : ma50,
      dma3, dma5, dma10, dma20, dma50, tma20, tma50,
      ii, iiy, is_val, k5: isNaN(k5) ? 0 : k5, d5: isNaN(d5) ? 0 : d5,
      adx13: isNaN(adx13) ? 0 : adx13,
      safebull, safemsp, jalur, macdKondisi, stochKondisi, adxKondisi,
      isConfluence,
    };
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    let batchIndex = 0, batchSize = 100;
    try { const b = await req.json(); batchIndex = b?.batchIndex ?? 0; if (b?.batchSize) batchSize = b.batchSize; } catch {}

    const start = batchIndex * batchSize;
    const tickers = IDX_TICKERS.slice(start, start + batchSize);
    const totalBatches = Math.ceil(IDX_TICKERS.length / batchSize);

    if (tickers.length === 0) {
      return new Response(JSON.stringify({ stocks: [], totalBatches, totalTickers: IDX_TICKERS.length, batchIndex }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: SKResult[] = [];
    for (let j = 0; j < tickers.length; j += 25) {
      const batch = tickers.slice(j, j + 25);
      const batchRes = await Promise.all(batch.map(t => processStock(t)));
      for (const r of batchRes) { if (r) results.push(r); }
    }

    return new Response(JSON.stringify({
      stocks: results,
      totalBatches,
      batchIndex,
      totalTickers: IDX_TICKERS.length,
      processedInBatch: tickers.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, stocks: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
