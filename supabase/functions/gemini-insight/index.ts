import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { ticker, price, changePct, volume, technical, bandarmology, forceRefresh } = await req.json();
    if (!ticker) throw new Error("ticker is required");

    // Check cache (24h)
    if (!forceRefresh) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: cached } = await supabase
        .from("ai_insights")
        .select("*")
        .eq("ticker", ticker)
        .eq("tanggal", today)
        .eq("user_id", user.id)
        .maybeSingle();

      if (cached) {
        return new Response(JSON.stringify({ insight: cached.insight_data, rating: cached.rating, confidence: cached.confidence, cached: true, created_at: cached.created_at }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const technicalStr = technical
      ? `MA5=${technical.ma5}, MA20=${technical.ma20}, MA50=${technical.ma50}, RSI=${technical.rsi || "N/A"}, MACD=${technical.macd || "N/A"}, Stochastic K/D=${technical.stoch_k || "N/A"}/${technical.stoch_d || "N/A"}, ADX=${technical.adx || "N/A"}, BB Position=${technical.bb_position || "N/A"}`
      : "Tidak tersedia";

    const bandarStr = bandarmology
      ? `Tier=${bandarmology.tier} Rank=#${bandarmology.rank} Streak=${bandarmology.streak}d Composite=${bandarmology.composite}%`
      : "Tidak tersedia";

    const systemPrompt = `Kamu adalah analis saham Indonesia independen yang berpengalaman, jujur, dan tidak bias. Kamu memiliki keahlian dalam analisa fundamental, teknikal, regulasi, dan market microstructure saham IDX. Berikan analisa mendalam, kritis, dan actionable.

Gunakan bahasa Indonesia yang jelas.
Format response dalam JSON sesuai struktur yang diberikan.
PENTING: Response HANYA berupa JSON valid, tanpa markdown code block.`;

    const userPrompt = `Buat analisa lengkap saham ${ticker}.JK

Data teknikal tersedia:
- Harga: ${price || "N/A"}
- % Change: ${changePct || "N/A"}%
- Volume: ${volume || "N/A"}
- Teknikal: ${technicalStr}
- Bandarmology: ${bandarStr}

Berikan analisa dalam format JSON:

{
  "header": {
    "ticker": "string",
    "nama_emiten": "string",
    "nama_lain": "string (nama lain/brand)",
    "tagline": "string (1 kalimat deskripsi)"
  },
  "section1_snapshot": {
    "kode_saham": "string",
    "nama_emiten": "string",
    "sektor": "string",
    "bursa": "IDX",
    "harga_terakhir": "string",
    "market_cap": "string",
    "range_52w": "string",
    "volume_rata2": "string",
    "pe_ratio": "string",
    "pbv": "string",
    "free_float": "string",
    "ipo_tahun": "string",
    "catatan_krusial": "string",
    "pergerakan_singkat": "string"
  },
  "section2_bisnis": {
    "profil_singkat": "string",
    "model_bisnis_detail": "string",
    "revenue_streams": [
      { "nama": "string", "porsi": "string", "karakteristik": "string" }
    ],
    "kelemahan_model": ["string"],
    "keunggulan_kompetitif": ["string"]
  },
  "section3_regulasi": {
    "overview": "string",
    "tabel_regulasi": [
      { "regulasi": "string", "dampak": "string", "sentimen": "string" }
    ],
    "analisis_mendalam": "string",
    "risiko_regulasi": ["string"]
  },
  "section4_keuangan": {
    "catatan": "string",
    "tabel_kinerja": [
      { "tahun": "string", "pendapatan": "string", "laba_kotor": "string", "laba_bersih": "string", "gpm": "string", "npm": "string" }
    ],
    "red_flags": ["string"],
    "yellow_flags": ["string"],
    "analisis_cashflow": "string",
    "kesehatan_neraca": [
      { "indikator": "string", "status": "string" }
    ]
  },
  "section5_konglomerat": {
    "struktur_pemegang_saham": [
      { "pemegang": "string", "kepemilikan": "string", "catatan": "string" }
    ],
    "afiliasi_konglomerat": "string",
    "tidak_ada_afiliasi": ["string"],
    "implikasi": ["string"],
    "relasi_bisnis": ["string"]
  },
  "section6_rumor": {
    "status_overview": "string",
    "tabel_rumor": [
      { "rumor": "string", "probabilitas": "string", "analisis": "string" }
    ],
    "mengapa_sulit": ["string"],
    "mengapa_bisa": ["string"],
    "peringatan": "string"
  },
  "section7_makro": {
    "market_size": [
      { "segmen": "string", "nilai": "string", "cagr": "string" }
    ],
    "faktor_positif": ["string"],
    "faktor_negatif": ["string"],
    "landscape_kompetitor": {
      "tier1": ["string"],
      "tier2": ["string"],
      "tier3": "string"
    },
    "posisi_di_industri": "string"
  },
  "section8_skenario": {
    "asumsi_dasar": {
      "revenue": "string",
      "shares": "string",
      "harga_saat_ini": "string",
      "market_cap": "string",
      "ev_revenue": "string"
    },
    "skenario": [
      {
        "nama": "string",
        "icon": "string",
        "probabilitas": "string",
        "asumsi": ["string"],
        "target_harga": "string",
        "return": "string",
        "logika": "string"
      }
    ],
    "matriks_ringkasan": [
      { "skenario": "string", "prob": "string", "target": "string", "return": "string", "risk": "string" }
    ],
    "expected_value": "string",
    "kesimpulan_ev": "string"
  },
  "section9_risiko": {
    "risiko_kritis": [
      { "nomor": 1, "judul": "string", "deskripsi": "string" }
    ],
    "risiko_signifikan": [
      { "nomor": 1, "judul": "string", "deskripsi": "string" }
    ]
  },
  "section10_katalis": {
    "kalender": [
      { "periode": "string", "events": ["string"] }
    ],
    "katalis_positif": [
      { "katalis": "string", "trigger": "string", "impact": "string" }
    ],
    "katalis_negatif": [
      { "katalis": "string", "trigger": "string", "impact": "string" }
    ]
  },
  "section11_verdict": {
    "scorecard": [
      { "dimensi": "string", "score": "string", "komentar": "string" }
    ],
    "total_score": "string",
    "rating": "string",
    "verdict_konservatif": "string",
    "verdict_moderat": "string",
    "verdict_trader": "string",
    "tiga_hal_sebelum_beli": ["string"],
    "bottom_line": "string"
  }
}

Pastikan minimal 4 skenario di section8 (Konservatif, Base Case, Bull Case, Super Bull).
Pastikan data lengkap dan mendalam untuk setiap section.`;

    const aiResp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("Gemini API error:", aiResp.status, errText);

      if (aiResp.status === 429) {
        return new Response(JSON.stringify({
          error: "Rate limit exceeded. Coba lagi dalam beberapa detik.",
          retryable: true,
          retry_after_sec: 5,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (aiResp.status === 402) {
        return new Response(JSON.stringify({
          error: "Kuota Gemini API habis. Cek billing di Google AI Studio.",
          retryable: false,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`AI gateway error: ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const textContent = aiData.choices?.[0]?.message?.content;
    if (!textContent) throw new Error("Empty response from AI");

    let insight;
    try {
      const cleaned = textContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      insight = JSON.parse(cleaned);
    } catch {
      throw new Error("Failed to parse AI response as JSON");
    }

    const rating = insight.section11_verdict?.rating || "NEUTRAL";
    const confidence = insight.section11_verdict?.total_score || "N/A";

    // Save to cache
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("ai_insights").upsert({
      user_id: user.id,
      ticker,
      tanggal: today,
      insight_data: insight,
      rating,
      confidence,
    }, { onConflict: "user_id,ticker,tanggal" });

    return new Response(JSON.stringify({ insight, rating, confidence, cached: false, created_at: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gemini-insight error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
