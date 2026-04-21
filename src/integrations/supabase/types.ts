export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      accum_watch_history: {
        Row: {
          composite_saat_confirm: number | null
          created_at: string
          hari_tunggu: number | null
          id: string
          status: string
          streak_saat_confirm: number | null
          tanggal_masuk_superketat: string | null
          tanggal_pertama_accum: string
          ticker: string
          tier_saat_masuk: string
          user_id: string
        }
        Insert: {
          composite_saat_confirm?: number | null
          created_at?: string
          hari_tunggu?: number | null
          id?: string
          status?: string
          streak_saat_confirm?: number | null
          tanggal_masuk_superketat?: string | null
          tanggal_pertama_accum: string
          ticker: string
          tier_saat_masuk?: string
          user_id: string
        }
        Update: {
          composite_saat_confirm?: number | null
          created_at?: string
          hari_tunggu?: number | null
          id?: string
          status?: string
          streak_saat_confirm?: number | null
          tanggal_masuk_superketat?: string | null
          tanggal_pertama_accum?: string
          ticker?: string
          tier_saat_masuk?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_insights: {
        Row: {
          confidence: string | null
          created_at: string
          id: string
          insight_data: Json
          rating: string | null
          tanggal: string
          ticker: string
          user_id: string
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          id?: string
          insight_data?: Json
          rating?: string | null
          tanggal?: string
          ticker: string
          user_id: string
        }
        Update: {
          confidence?: string | null
          created_at?: string
          id?: string
          insight_data?: Json
          rating?: string | null
          tanggal?: string
          ticker?: string
          user_id?: string
        }
        Relationships: []
      }
      ak_broker_data: {
        Row: {
          broker_code: string
          buy_avg: number | null
          buy_lot: number | null
          buy_value: number | null
          created_at: string
          id: string
          net_value: number
          sell_avg: number | null
          sell_lot: number | null
          sell_value: number | null
          tanggal: string
          ticker: string
          user_id: string
        }
        Insert: {
          broker_code?: string
          buy_avg?: number | null
          buy_lot?: number | null
          buy_value?: number | null
          created_at?: string
          id?: string
          net_value?: number
          sell_avg?: number | null
          sell_lot?: number | null
          sell_value?: number | null
          tanggal: string
          ticker: string
          user_id: string
        }
        Update: {
          broker_code?: string
          buy_avg?: number | null
          buy_lot?: number | null
          buy_value?: number | null
          created_at?: string
          id?: string
          net_value?: number
          sell_avg?: number | null
          sell_lot?: number | null
          sell_value?: number | null
          tanggal?: string
          ticker?: string
          user_id?: string
        }
        Relationships: []
      }
      ak_broker_scores: {
        Row: {
          avg_buy_rolling: number | null
          broker_code: string
          buy_vs_avg_ratio: number | null
          created_at: string
          cumulative_net_10d: number | null
          cumulative_net_20d: number | null
          cumulative_net_5d: number | null
          id: string
          is_reversal_buy: boolean
          is_reversal_sell: boolean
          pct_of_market: number | null
          score_total: number
          streak_beli: number
          streak_jual: number
          tag: string
          tag_vs_ak: string
          tag_vs_saham: string
          tanggal: string
          ticker: string
          total_value_saham: number | null
          user_id: string
          value_source: string | null
        }
        Insert: {
          avg_buy_rolling?: number | null
          broker_code?: string
          buy_vs_avg_ratio?: number | null
          created_at?: string
          cumulative_net_10d?: number | null
          cumulative_net_20d?: number | null
          cumulative_net_5d?: number | null
          id?: string
          is_reversal_buy?: boolean
          is_reversal_sell?: boolean
          pct_of_market?: number | null
          score_total?: number
          streak_beli?: number
          streak_jual?: number
          tag?: string
          tag_vs_ak?: string
          tag_vs_saham?: string
          tanggal: string
          ticker: string
          total_value_saham?: number | null
          user_id: string
          value_source?: string | null
        }
        Update: {
          avg_buy_rolling?: number | null
          broker_code?: string
          buy_vs_avg_ratio?: number | null
          created_at?: string
          cumulative_net_10d?: number | null
          cumulative_net_20d?: number | null
          cumulative_net_5d?: number | null
          id?: string
          is_reversal_buy?: boolean
          is_reversal_sell?: boolean
          pct_of_market?: number | null
          score_total?: number
          streak_beli?: number
          streak_jual?: number
          tag?: string
          tag_vs_ak?: string
          tag_vs_saham?: string
          tanggal?: string
          ticker?: string
          total_value_saham?: number | null
          user_id?: string
          value_source?: string | null
        }
        Relationships: []
      }
      ara_events: {
        Row: {
          batas_ara: number
          created_at: string
          fraksi_harga: string
          harga_close: number
          harga_high: number
          harga_low: number
          harga_open: number
          id: string
          pct_change: number
          tanggal_ara: string
          ticker: string
          value: number
          volume: number
        }
        Insert: {
          batas_ara?: number
          created_at?: string
          fraksi_harga?: string
          harga_close: number
          harga_high: number
          harga_low: number
          harga_open: number
          id?: string
          pct_change: number
          tanggal_ara: string
          ticker: string
          value?: number
          volume?: number
        }
        Update: {
          batas_ara?: number
          created_at?: string
          fraksi_harga?: string
          harga_close?: number
          harga_high?: number
          harga_low?: number
          harga_open?: number
          id?: string
          pct_change?: number
          tanggal_ara?: string
          ticker?: string
          value?: number
          volume?: number
        }
        Relationships: []
      }
      ara_pre_pattern: {
        Row: {
          ara_event_id: string
          bb_position: string | null
          candle_color: string | null
          close: number | null
          close_vs_sma20: string | null
          close_vs_sma5: string | null
          close_vs_sma50: string | null
          created_at: string
          gap_type: string | null
          hari: number
          high: number | null
          id: string
          low: number | null
          macd_histogram: number | null
          macd_line: number | null
          macd_signal: number | null
          macd_status: string | null
          open: number | null
          pct_change: number | null
          rsi: number | null
          rsi_zone: string | null
          sma20: number | null
          sma5: number | null
          sma50: number | null
          tanggal_ara: string
          ticker: string
          value: number | null
          volume: number | null
          volume_spike: boolean | null
          volume_vs_ma20: number | null
          volume_vs_ma5: number | null
        }
        Insert: {
          ara_event_id: string
          bb_position?: string | null
          candle_color?: string | null
          close?: number | null
          close_vs_sma20?: string | null
          close_vs_sma5?: string | null
          close_vs_sma50?: string | null
          created_at?: string
          gap_type?: string | null
          hari: number
          high?: number | null
          id?: string
          low?: number | null
          macd_histogram?: number | null
          macd_line?: number | null
          macd_signal?: number | null
          macd_status?: string | null
          open?: number | null
          pct_change?: number | null
          rsi?: number | null
          rsi_zone?: string | null
          sma20?: number | null
          sma5?: number | null
          sma50?: number | null
          tanggal_ara: string
          ticker: string
          value?: number | null
          volume?: number | null
          volume_spike?: boolean | null
          volume_vs_ma20?: number | null
          volume_vs_ma5?: number | null
        }
        Update: {
          ara_event_id?: string
          bb_position?: string | null
          candle_color?: string | null
          close?: number | null
          close_vs_sma20?: string | null
          close_vs_sma5?: string | null
          close_vs_sma50?: string | null
          created_at?: string
          gap_type?: string | null
          hari?: number
          high?: number | null
          id?: string
          low?: number | null
          macd_histogram?: number | null
          macd_line?: number | null
          macd_signal?: number | null
          macd_status?: string | null
          open?: number | null
          pct_change?: number | null
          rsi?: number | null
          rsi_zone?: string | null
          sma20?: number | null
          sma5?: number | null
          sma50?: number | null
          tanggal_ara?: string
          ticker?: string
          value?: number | null
          volume?: number | null
          volume_spike?: boolean | null
          volume_vs_ma20?: number | null
          volume_vs_ma5?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ara_pre_pattern_ara_event_id_fkey"
            columns: ["ara_event_id"]
            isOneToOne: false
            referencedRelation: "ara_events"
            referencedColumns: ["id"]
          },
        ]
      }
      ara_watchlist: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          last_score: number | null
          last_score_date: string | null
          pct_ara_terakhir: number | null
          tanggal_ara_terakhir: string | null
          ticker: string
          total_ara_count: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_score?: number | null
          last_score_date?: string | null
          pct_ara_terakhir?: number | null
          tanggal_ara_terakhir?: string | null
          ticker: string
          total_ara_count?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_score?: number | null
          last_score_date?: string | null
          pct_ara_terakhir?: number | null
          tanggal_ara_terakhir?: string | null
          ticker?: string
          total_ara_count?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      ara_watchlist_scores: {
        Row: {
          created_at: string
          d1_bb_position: string | null
          d1_candle: boolean | null
          d1_close_vs_sma20: string | null
          d1_close_vs_sma5: string | null
          d1_close_vs_sma50: string | null
          d1_gap_type: string | null
          d1_macd_status: string | null
          d1_rsi_zone: string | null
          d1_value_ok: boolean | null
          d1_volume_spike: boolean | null
          d2_bb_position: string | null
          d2_candle: boolean | null
          d2_close_vs_sma20: string | null
          d2_close_vs_sma5: string | null
          d2_close_vs_sma50: string | null
          d2_gap_type: string | null
          d2_macd_status: string | null
          d2_rsi_zone: string | null
          d2_value_ok: boolean | null
          d2_volume_spike: boolean | null
          d3_bb_position: string | null
          d3_candle: boolean | null
          d3_close_vs_sma20: string | null
          d3_close_vs_sma5: string | null
          d3_close_vs_sma50: string | null
          d3_gap_type: string | null
          d3_macd_status: string | null
          d3_rsi_zone: string | null
          d3_value_ok: boolean | null
          d3_volume_spike: boolean | null
          d4_bb_position: string | null
          d4_candle: boolean | null
          d4_close_vs_sma20: string | null
          d4_close_vs_sma5: string | null
          d4_close_vs_sma50: string | null
          d4_gap_type: string | null
          d4_macd_status: string | null
          d4_rsi_zone: string | null
          d4_value_ok: boolean | null
          d4_volume_spike: boolean | null
          d5_bb_position: string | null
          d5_candle: boolean | null
          d5_close_vs_sma20: string | null
          d5_close_vs_sma5: string | null
          d5_close_vs_sma50: string | null
          d5_gap_type: string | null
          d5_macd_status: string | null
          d5_rsi_zone: string | null
          d5_value_ok: boolean | null
          d5_volume_spike: boolean | null
          d6_bb_position: string | null
          d6_candle: boolean | null
          d6_close_vs_sma20: string | null
          d6_close_vs_sma5: string | null
          d6_close_vs_sma50: string | null
          d6_gap_type: string | null
          d6_macd_status: string | null
          d6_rsi_zone: string | null
          d6_value_ok: boolean | null
          d6_volume_spike: boolean | null
          d7_bb_position: string | null
          d7_candle: boolean | null
          d7_close_vs_sma20: string | null
          d7_close_vs_sma5: string | null
          d7_close_vs_sma50: string | null
          d7_gap_type: string | null
          d7_macd_status: string | null
          d7_rsi_zone: string | null
          d7_value_ok: boolean | null
          d7_volume_spike: boolean | null
          id: string
          score_d1: number | null
          score_d2: number | null
          score_d3: number | null
          score_d4: number | null
          score_d5: number | null
          score_d6: number | null
          score_d7: number | null
          score_total: number | null
          tanggal_score: string
          ticker: string
        }
        Insert: {
          created_at?: string
          d1_bb_position?: string | null
          d1_candle?: boolean | null
          d1_close_vs_sma20?: string | null
          d1_close_vs_sma5?: string | null
          d1_close_vs_sma50?: string | null
          d1_gap_type?: string | null
          d1_macd_status?: string | null
          d1_rsi_zone?: string | null
          d1_value_ok?: boolean | null
          d1_volume_spike?: boolean | null
          d2_bb_position?: string | null
          d2_candle?: boolean | null
          d2_close_vs_sma20?: string | null
          d2_close_vs_sma5?: string | null
          d2_close_vs_sma50?: string | null
          d2_gap_type?: string | null
          d2_macd_status?: string | null
          d2_rsi_zone?: string | null
          d2_value_ok?: boolean | null
          d2_volume_spike?: boolean | null
          d3_bb_position?: string | null
          d3_candle?: boolean | null
          d3_close_vs_sma20?: string | null
          d3_close_vs_sma5?: string | null
          d3_close_vs_sma50?: string | null
          d3_gap_type?: string | null
          d3_macd_status?: string | null
          d3_rsi_zone?: string | null
          d3_value_ok?: boolean | null
          d3_volume_spike?: boolean | null
          d4_bb_position?: string | null
          d4_candle?: boolean | null
          d4_close_vs_sma20?: string | null
          d4_close_vs_sma5?: string | null
          d4_close_vs_sma50?: string | null
          d4_gap_type?: string | null
          d4_macd_status?: string | null
          d4_rsi_zone?: string | null
          d4_value_ok?: boolean | null
          d4_volume_spike?: boolean | null
          d5_bb_position?: string | null
          d5_candle?: boolean | null
          d5_close_vs_sma20?: string | null
          d5_close_vs_sma5?: string | null
          d5_close_vs_sma50?: string | null
          d5_gap_type?: string | null
          d5_macd_status?: string | null
          d5_rsi_zone?: string | null
          d5_value_ok?: boolean | null
          d5_volume_spike?: boolean | null
          d6_bb_position?: string | null
          d6_candle?: boolean | null
          d6_close_vs_sma20?: string | null
          d6_close_vs_sma5?: string | null
          d6_close_vs_sma50?: string | null
          d6_gap_type?: string | null
          d6_macd_status?: string | null
          d6_rsi_zone?: string | null
          d6_value_ok?: boolean | null
          d6_volume_spike?: boolean | null
          d7_bb_position?: string | null
          d7_candle?: boolean | null
          d7_close_vs_sma20?: string | null
          d7_close_vs_sma5?: string | null
          d7_close_vs_sma50?: string | null
          d7_gap_type?: string | null
          d7_macd_status?: string | null
          d7_rsi_zone?: string | null
          d7_value_ok?: boolean | null
          d7_volume_spike?: boolean | null
          id?: string
          score_d1?: number | null
          score_d2?: number | null
          score_d3?: number | null
          score_d4?: number | null
          score_d5?: number | null
          score_d6?: number | null
          score_d7?: number | null
          score_total?: number | null
          tanggal_score?: string
          ticker: string
        }
        Update: {
          created_at?: string
          d1_bb_position?: string | null
          d1_candle?: boolean | null
          d1_close_vs_sma20?: string | null
          d1_close_vs_sma5?: string | null
          d1_close_vs_sma50?: string | null
          d1_gap_type?: string | null
          d1_macd_status?: string | null
          d1_rsi_zone?: string | null
          d1_value_ok?: boolean | null
          d1_volume_spike?: boolean | null
          d2_bb_position?: string | null
          d2_candle?: boolean | null
          d2_close_vs_sma20?: string | null
          d2_close_vs_sma5?: string | null
          d2_close_vs_sma50?: string | null
          d2_gap_type?: string | null
          d2_macd_status?: string | null
          d2_rsi_zone?: string | null
          d2_value_ok?: boolean | null
          d2_volume_spike?: boolean | null
          d3_bb_position?: string | null
          d3_candle?: boolean | null
          d3_close_vs_sma20?: string | null
          d3_close_vs_sma5?: string | null
          d3_close_vs_sma50?: string | null
          d3_gap_type?: string | null
          d3_macd_status?: string | null
          d3_rsi_zone?: string | null
          d3_value_ok?: boolean | null
          d3_volume_spike?: boolean | null
          d4_bb_position?: string | null
          d4_candle?: boolean | null
          d4_close_vs_sma20?: string | null
          d4_close_vs_sma5?: string | null
          d4_close_vs_sma50?: string | null
          d4_gap_type?: string | null
          d4_macd_status?: string | null
          d4_rsi_zone?: string | null
          d4_value_ok?: boolean | null
          d4_volume_spike?: boolean | null
          d5_bb_position?: string | null
          d5_candle?: boolean | null
          d5_close_vs_sma20?: string | null
          d5_close_vs_sma5?: string | null
          d5_close_vs_sma50?: string | null
          d5_gap_type?: string | null
          d5_macd_status?: string | null
          d5_rsi_zone?: string | null
          d5_value_ok?: boolean | null
          d5_volume_spike?: boolean | null
          d6_bb_position?: string | null
          d6_candle?: boolean | null
          d6_close_vs_sma20?: string | null
          d6_close_vs_sma5?: string | null
          d6_close_vs_sma50?: string | null
          d6_gap_type?: string | null
          d6_macd_status?: string | null
          d6_rsi_zone?: string | null
          d6_value_ok?: boolean | null
          d6_volume_spike?: boolean | null
          d7_bb_position?: string | null
          d7_candle?: boolean | null
          d7_close_vs_sma20?: string | null
          d7_close_vs_sma5?: string | null
          d7_close_vs_sma50?: string | null
          d7_gap_type?: string | null
          d7_macd_status?: string | null
          d7_rsi_zone?: string | null
          d7_value_ok?: boolean | null
          d7_volume_spike?: boolean | null
          id?: string
          score_d1?: number | null
          score_d2?: number | null
          score_d3?: number | null
          score_d4?: number | null
          score_d5?: number | null
          score_d6?: number | null
          score_d7?: number | null
          score_total?: number | null
          tanggal_score?: string
          ticker?: string
        }
        Relationships: []
      }
      backtest_sessions: {
        Row: {
          created_at: string
          formula: string
          formula_id: string | null
          hasil_summary: Json | null
          id: string
          metode: Json
          nama: string
          notes: string | null
          parameter_dipilih: Json | null
          periode_historis: string | null
          tanggal_run: string
          threshold_bsjp: number | null
          threshold_swing: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          formula: string
          formula_id?: string | null
          hasil_summary?: Json | null
          id?: string
          metode?: Json
          nama: string
          notes?: string | null
          parameter_dipilih?: Json | null
          periode_historis?: string | null
          tanggal_run?: string
          threshold_bsjp?: number | null
          threshold_swing?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          formula?: string
          formula_id?: string | null
          hasil_summary?: Json | null
          id?: string
          metode?: Json
          nama?: string
          notes?: string | null
          parameter_dipilih?: Json | null
          periode_historis?: string | null
          tanggal_run?: string
          threshold_bsjp?: number | null
          threshold_swing?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backtest_sessions_formula_id_fkey"
            columns: ["formula_id"]
            isOneToOne: false
            referencedRelation: "custom_formulas"
            referencedColumns: ["id"]
          },
        ]
      }
      bandarmology_data: {
        Row: {
          composite_pct: number | null
          created_at: string
          daily_pct: number | null
          data_tier: string
          id: string
          input_time: string
          is_new_entry: boolean
          is_top20: boolean
          is_topl: boolean | null
          is_topv: boolean
          kode_broker: string | null
          liquidity: string | null
          market_cap: string | null
          muncul_di_top: boolean
          muncul_di_topl: boolean
          muncul_di_topv: boolean
          pattern: string | null
          rank_score: number | null
          source_count: number
          streak: number | null
          streak_direction: string | null
          tanggal_data: string
          ticker: string
          tier: string
          top1_broker: string | null
          top1_pct: number | null
          user_id: string
          value: number | null
          weekly_pct: number | null
        }
        Insert: {
          composite_pct?: number | null
          created_at?: string
          daily_pct?: number | null
          data_tier?: string
          id?: string
          input_time?: string
          is_new_entry?: boolean
          is_top20?: boolean
          is_topl?: boolean | null
          is_topv?: boolean
          kode_broker?: string | null
          liquidity?: string | null
          market_cap?: string | null
          muncul_di_top?: boolean
          muncul_di_topl?: boolean
          muncul_di_topv?: boolean
          pattern?: string | null
          rank_score?: number | null
          source_count?: number
          streak?: number | null
          streak_direction?: string | null
          tanggal_data: string
          ticker: string
          tier?: string
          top1_broker?: string | null
          top1_pct?: number | null
          user_id: string
          value?: number | null
          weekly_pct?: number | null
        }
        Update: {
          composite_pct?: number | null
          created_at?: string
          daily_pct?: number | null
          data_tier?: string
          id?: string
          input_time?: string
          is_new_entry?: boolean
          is_top20?: boolean
          is_topl?: boolean | null
          is_topv?: boolean
          kode_broker?: string | null
          liquidity?: string | null
          market_cap?: string | null
          muncul_di_top?: boolean
          muncul_di_topl?: boolean
          muncul_di_topv?: boolean
          pattern?: string | null
          rank_score?: number | null
          source_count?: number
          streak?: number | null
          streak_direction?: string | null
          tanggal_data?: string
          ticker?: string
          tier?: string
          top1_broker?: string | null
          top1_pct?: number | null
          user_id?: string
          value?: number | null
          weekly_pct?: number | null
        }
        Relationships: []
      }
      bot_templates: {
        Row: {
          description: string | null
          id: string
          template_key: string
          template_text: string
          updated_at: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          template_key: string
          template_text: string
          updated_at?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          template_key?: string
          template_text?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      broker_profiles: {
        Row: {
          broker_code: string
          broker_name: string
          color: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          user_id: string
        }
        Insert: {
          broker_code: string
          broker_name: string
          color?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          user_id: string
        }
        Update: {
          broker_code?: string
          broker_name?: string
          color?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      custom_formulas: {
        Row: {
          created_at: string
          deskripsi: string | null
          formula: string
          id: string
          last_used: string | null
          nama: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deskripsi?: string | null
          formula: string
          id?: string
          last_used?: string | null
          nama: string
          user_id: string
        }
        Update: {
          created_at?: string
          deskripsi?: string | null
          formula?: string
          id?: string
          last_used?: string | null
          nama?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_snapshots: {
        Row: {
          close_noc: number | null
          close_om: number | null
          close_visit: number | null
          created_at: string | null
          id: string
          new_open_today: number | null
          open_gt30: number | null
          open_gt60: number | null
          open_lt30: number | null
          overdue_gte30: number | null
          overdue_gte8: number | null
          snapshot_date: string
          total_closed: number | null
          total_open: number | null
          total_tt: number | null
        }
        Insert: {
          close_noc?: number | null
          close_om?: number | null
          close_visit?: number | null
          created_at?: string | null
          id?: string
          new_open_today?: number | null
          open_gt30?: number | null
          open_gt60?: number | null
          open_lt30?: number | null
          overdue_gte30?: number | null
          overdue_gte8?: number | null
          snapshot_date: string
          total_closed?: number | null
          total_open?: number | null
          total_tt?: number | null
        }
        Update: {
          close_noc?: number | null
          close_om?: number | null
          close_visit?: number | null
          created_at?: string | null
          id?: string
          new_open_today?: number | null
          open_gt30?: number | null
          open_gt60?: number | null
          open_lt30?: number | null
          overdue_gte30?: number | null
          overdue_gte8?: number | null
          snapshot_date?: string
          total_closed?: number | null
          total_open?: number | null
          total_tt?: number | null
        }
        Relationships: []
      }
      modal_transactions: {
        Row: {
          created_at: string
          id: string
          jumlah: number
          notes: string | null
          tanggal: string
          tipe: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          jumlah: number
          notes?: string | null
          tanggal?: string
          tipe: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          jumlah?: number
          notes?: string | null
          tanggal?: string
          tipe?: string
          user_id?: string
        }
        Relationships: []
      }
      po_list: {
        Row: {
          area: number
          created_at: string | null
          id: string
          kabupaten_coverage: string[] | null
          name: string
          notes: string | null
          provinsi_coverage: string[] | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          area: number
          created_at?: string | null
          id?: string
          kabupaten_coverage?: string[] | null
          name: string
          notes?: string | null
          provinsi_coverage?: string[] | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          area?: number
          created_at?: string | null
          id?: string
          kabupaten_coverage?: string[] | null
          name?: string
          notes?: string | null
          provinsi_coverage?: string[] | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      s_curve_baselines: {
        Row: {
          baseline_date: string
          completed_at: string | null
          created_at: string | null
          end_date: string
          id: string
          label: string
          status: string | null
          total_target: number | null
        }
        Insert: {
          baseline_date: string
          completed_at?: string | null
          created_at?: string | null
          end_date: string
          id?: string
          label: string
          status?: string | null
          total_target?: number | null
        }
        Update: {
          baseline_date?: string
          completed_at?: string | null
          created_at?: string | null
          end_date?: string
          id?: string
          label?: string
          status?: string | null
          total_target?: number | null
        }
        Relationships: []
      }
      s_curve_targets: {
        Row: {
          actual_online: string | null
          area: number | null
          baseline_id: string
          created_at: string | null
          id: string
          is_online: boolean | null
          kabupaten: string | null
          online_detected_at: string | null
          po_name: string | null
          provinsi: string | null
          site_id: string
          site_name: string | null
          target_online: string | null
          ticket_id: string
        }
        Insert: {
          actual_online?: string | null
          area?: number | null
          baseline_id: string
          created_at?: string | null
          id?: string
          is_online?: boolean | null
          kabupaten?: string | null
          online_detected_at?: string | null
          po_name?: string | null
          provinsi?: string | null
          site_id: string
          site_name?: string | null
          target_online?: string | null
          ticket_id: string
        }
        Update: {
          actual_online?: string | null
          area?: number | null
          baseline_id?: string
          created_at?: string | null
          id?: string
          is_online?: boolean | null
          kabupaten?: string | null
          online_detected_at?: string | null
          po_name?: string | null
          provinsi?: string | null
          site_id?: string
          site_name?: string | null
          target_online?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "s_curve_targets_baseline_id_fkey"
            columns: ["baseline_id"]
            isOneToOne: false
            referencedRelation: "s_curve_baselines"
            referencedColumns: ["id"]
          },
        ]
      }
      site_notes: {
        Row: {
          created_at: string | null
          id: string
          note: string
          site_id: string
          site_name: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          note: string
          site_id: string
          site_name?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          note?: string
          site_id?: string
          site_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sk_monitoring: {
        Row: {
          adx_kondisi: string | null
          close_day0: number
          created_at: string
          id: string
          ii_score: number | null
          is_confluence: boolean | null
          jalur_masuk: string | null
          macd_kondisi: string | null
          status: string
          stoch_kondisi: string | null
          tanggal_masuk: string
          ticker: string
          tma20: number | null
          user_id: string
          vm60_saat_masuk: number | null
          vok_tipe: string | null
          vv0_saat_masuk: number | null
          vv1_saat_masuk: number | null
        }
        Insert: {
          adx_kondisi?: string | null
          close_day0: number
          created_at?: string
          id?: string
          ii_score?: number | null
          is_confluence?: boolean | null
          jalur_masuk?: string | null
          macd_kondisi?: string | null
          status?: string
          stoch_kondisi?: string | null
          tanggal_masuk?: string
          ticker: string
          tma20?: number | null
          user_id: string
          vm60_saat_masuk?: number | null
          vok_tipe?: string | null
          vv0_saat_masuk?: number | null
          vv1_saat_masuk?: number | null
        }
        Update: {
          adx_kondisi?: string | null
          close_day0?: number
          created_at?: string
          id?: string
          ii_score?: number | null
          is_confluence?: boolean | null
          jalur_masuk?: string | null
          macd_kondisi?: string | null
          status?: string
          stoch_kondisi?: string | null
          tanggal_masuk?: string
          ticker?: string
          tma20?: number | null
          user_id?: string
          vm60_saat_masuk?: number | null
          vok_tipe?: string | null
          vv0_saat_masuk?: number | null
          vv1_saat_masuk?: number | null
        }
        Relationships: []
      }
      stamp_duty: {
        Row: {
          amount: number
          auto: boolean
          created_at: string
          id: string
          notes: string | null
          trade_date: string
          user_id: string
        }
        Insert: {
          amount?: number
          auto?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          trade_date: string
          user_id: string
        }
        Update: {
          amount?: number
          auto?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          trade_date?: string
          user_id?: string
        }
        Relationships: []
      }
      swing_analysis_cache: {
        Row: {
          action_score: number | null
          alt_day: Json | null
          avg_pct_per_day: Json | null
          best_day: Json | null
          created_at: string
          entry_day_rekom: number | null
          gap_up_rate: Json | null
          id: string
          ranking: Json | null
          screener_name: string
          tanggal_cache: string
          ticker: string
          total_events: number | null
          win_pct_per_day: Json | null
        }
        Insert: {
          action_score?: number | null
          alt_day?: Json | null
          avg_pct_per_day?: Json | null
          best_day?: Json | null
          created_at?: string
          entry_day_rekom?: number | null
          gap_up_rate?: Json | null
          id?: string
          ranking?: Json | null
          screener_name: string
          tanggal_cache?: string
          ticker: string
          total_events?: number | null
          win_pct_per_day?: Json | null
        }
        Update: {
          action_score?: number | null
          alt_day?: Json | null
          avg_pct_per_day?: Json | null
          best_day?: Json | null
          created_at?: string
          entry_day_rekom?: number | null
          gap_up_rate?: Json | null
          id?: string
          ranking?: Json | null
          screener_name?: string
          tanggal_cache?: string
          ticker?: string
          total_events?: number | null
          win_pct_per_day?: Json | null
        }
        Relationships: []
      }
      swing_monitoring: {
        Row: {
          adx_kondisi: string | null
          avg_pct_day_rekom: number | null
          close_day0: number
          created_at: string
          entry_day_rekomendasi: number | null
          entry_notes: string | null
          id: string
          ii_score: number | null
          macd_kondisi: string | null
          parameter_khusus: Json | null
          screener_name: string
          status: string
          stoch_kondisi: string | null
          tanggal_masuk: string
          ticker: string
          tma20: number | null
          user_id: string
          vok_tipe: string | null
          win_pct_day_rekom: number | null
        }
        Insert: {
          adx_kondisi?: string | null
          avg_pct_day_rekom?: number | null
          close_day0: number
          created_at?: string
          entry_day_rekomendasi?: number | null
          entry_notes?: string | null
          id?: string
          ii_score?: number | null
          macd_kondisi?: string | null
          parameter_khusus?: Json | null
          screener_name: string
          status?: string
          stoch_kondisi?: string | null
          tanggal_masuk?: string
          ticker: string
          tma20?: number | null
          user_id: string
          vok_tipe?: string | null
          win_pct_day_rekom?: number | null
        }
        Update: {
          adx_kondisi?: string | null
          avg_pct_day_rekom?: number | null
          close_day0?: number
          created_at?: string
          entry_day_rekomendasi?: number | null
          entry_notes?: string | null
          id?: string
          ii_score?: number | null
          macd_kondisi?: string | null
          parameter_khusus?: Json | null
          screener_name?: string
          status?: string
          stoch_kondisi?: string | null
          tanggal_masuk?: string
          ticker?: string
          tma20?: number | null
          user_id?: string
          vok_tipe?: string | null
          win_pct_day_rekom?: number | null
        }
        Relationships: []
      }
      trades: {
        Row: {
          category_id: string | null
          created_at: string
          fee: number | null
          id: string
          lots: number
          notes: string | null
          price: number
          ticker: string
          total_amount: number | null
          total_value: number | null
          trade_date: string
          trade_type: string
          user_id: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          fee?: number | null
          id?: string
          lots: number
          notes?: string | null
          price: number
          ticker: string
          total_amount?: number | null
          total_value?: number | null
          trade_date?: string
          trade_type: string
          user_id?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          fee?: number | null
          id?: string
          lots?: number
          notes?: string | null
          price?: number
          ticker?: string
          total_amount?: number | null
          total_value?: number | null
          trade_date?: string
          trade_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trades_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "trading_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      trading_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      tt_records: {
        Row: {
          actual_online: string | null
          created_at: string | null
          date_start: string | null
          detail_prob: string | null
          down_time: number | null
          id: string
          is_manually_edited: boolean | null
          kabupaten: string | null
          last_updated: string | null
          note_original: string | null
          prob_class: string | null
          provinsi: string | null
          reschedule_note: string | null
          site_id: string | null
          site_name: string
          status: string | null
          target_online_edited: string | null
          target_online_original: string | null
          teknis_nt: string | null
          ticket_id: string
          tiket_internal: string | null
          upload_date: string | null
        }
        Insert: {
          actual_online?: string | null
          created_at?: string | null
          date_start?: string | null
          detail_prob?: string | null
          down_time?: number | null
          id?: string
          is_manually_edited?: boolean | null
          kabupaten?: string | null
          last_updated?: string | null
          note_original?: string | null
          prob_class?: string | null
          provinsi?: string | null
          reschedule_note?: string | null
          site_id?: string | null
          site_name: string
          status?: string | null
          target_online_edited?: string | null
          target_online_original?: string | null
          teknis_nt?: string | null
          ticket_id: string
          tiket_internal?: string | null
          upload_date?: string | null
        }
        Update: {
          actual_online?: string | null
          created_at?: string | null
          date_start?: string | null
          detail_prob?: string | null
          down_time?: number | null
          id?: string
          is_manually_edited?: boolean | null
          kabupaten?: string | null
          last_updated?: string | null
          note_original?: string | null
          prob_class?: string | null
          provinsi?: string | null
          reschedule_note?: string | null
          site_id?: string | null
          site_name?: string
          status?: string | null
          target_online_edited?: string | null
          target_online_original?: string | null
          teknis_nt?: string | null
          ticket_id?: string
          tiket_internal?: string | null
          upload_date?: string | null
        }
        Relationships: []
      }
      tt_uploads: {
        Row: {
          close_noc: number | null
          close_om: number | null
          close_visit: number | null
          created_at: string | null
          id: string
          summary: Json | null
          total_closed: number | null
          total_open: number | null
          total_tt: number | null
          upload_date: string
        }
        Insert: {
          close_noc?: number | null
          close_om?: number | null
          close_visit?: number | null
          created_at?: string | null
          id?: string
          summary?: Json | null
          total_closed?: number | null
          total_open?: number | null
          total_tt?: number | null
          upload_date: string
        }
        Update: {
          close_noc?: number | null
          close_om?: number | null
          close_visit?: number | null
          created_at?: string | null
          id?: string
          summary?: Json | null
          total_closed?: number | null
          total_open?: number | null
          total_tt?: number | null
          upload_date?: string
        }
        Relationships: []
      }
      watchlist: {
        Row: {
          created_at: string
          id: string
          ticker: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ticker: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ticker?: string
          user_id?: string | null
        }
        Relationships: []
      }
      watchlist_rekomendasi: {
        Row: {
          category_id: string | null
          created_at: string
          entry_date: string
          id: string
          notes: string | null
          ticker: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          entry_date?: string
          id?: string
          notes?: string | null
          ticker: string
          user_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          entry_date?: string
          id?: string
          notes?: string | null
          ticker?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_rekomendasi_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "trading_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      wr_scanner: {
        Row: {
          close_import: number | null
          created_at: string
          high_price: number | null
          id: string
          notes: string | null
          param_c_vwap: boolean | null
          param_count: number | null
          param_h_ph: boolean | null
          param_l_pl: boolean | null
          param_ma_plus: boolean | null
          param_ol_hc: boolean | null
          param_pr: boolean | null
          param_v_ma20: boolean | null
          param_v_ma5: boolean | null
          pct_open_to_high: number | null
          result: string | null
          screener_names: Json
          status: string
          tanggal_backtest: string | null
          tanggal_import: string
          ticker: string
          user_id: string
          wl_kategori: string | null
        }
        Insert: {
          close_import?: number | null
          created_at?: string
          high_price?: number | null
          id?: string
          notes?: string | null
          param_c_vwap?: boolean | null
          param_count?: number | null
          param_h_ph?: boolean | null
          param_l_pl?: boolean | null
          param_ma_plus?: boolean | null
          param_ol_hc?: boolean | null
          param_pr?: boolean | null
          param_v_ma20?: boolean | null
          param_v_ma5?: boolean | null
          pct_open_to_high?: number | null
          result?: string | null
          screener_names?: Json
          status?: string
          tanggal_backtest?: string | null
          tanggal_import?: string
          ticker: string
          user_id: string
          wl_kategori?: string | null
        }
        Update: {
          close_import?: number | null
          created_at?: string
          high_price?: number | null
          id?: string
          notes?: string | null
          param_c_vwap?: boolean | null
          param_count?: number | null
          param_h_ph?: boolean | null
          param_l_pl?: boolean | null
          param_ma_plus?: boolean | null
          param_ol_hc?: boolean | null
          param_pr?: boolean | null
          param_v_ma20?: boolean | null
          param_v_ma5?: boolean | null
          pct_open_to_high?: number | null
          result?: string | null
          screener_names?: Json
          status?: string
          tanggal_backtest?: string | null
          tanggal_import?: string
          ticker?: string
          user_id?: string
          wl_kategori?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
