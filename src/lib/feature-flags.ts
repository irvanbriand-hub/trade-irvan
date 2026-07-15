// Feature flags — saklar global untuk menyala/matikan modul besar.
//
// TRADING_ENABLED:
//   false → seluruh modul Trading Journal disembunyikan. Semua route trading
//           di-redirect ke /noc, tombol/navigasi Trade Journal hilang, dan
//           landing default (termasuk owner) diarahkan ke /noc.
//   true  → app kembali normal (trading + NOC) seperti semula.
//
// Mematikan trading TIDAK menghapus kode, Edge Functions, atau data Supabase —
// semuanya tetap utuh. Untuk mengaktifkan lagi cukup ubah baris di bawah ke true.
export const TRADING_ENABLED = false;
