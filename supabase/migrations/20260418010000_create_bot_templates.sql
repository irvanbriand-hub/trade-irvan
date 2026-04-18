create table bot_templates (
  id uuid default gen_random_uuid() primary key,
  template_key text not null unique,
  template_text text not null,
  description text,
  updated_at timestamptz default now()
);

alter table bot_templates enable row level security;
create policy "Public read write" on bot_templates
  for all using (true) with check (true);

-- Insert default template rekap pagi
insert into bot_templates (template_key, template_text, description)
values (
  'rekap_pagi',
  '📢 REKAP PAGI – {HARI}, {TANGGAL}
Assalamu''alaikum Warahmatullahi Wabarakatuh
🌞 Selamat Pagi, Semangat Pagi!💪

📌 STATUS TIKET NMT:
🔢 Total Tiket Aktif: {TOTAL_TT} TT
⏳ Tiket < 30 Hari: {OPEN_LT30} TT
⛔ Tiket ≥ 30 Hari: {OPEN_GT30} TT
❌ Tiket ≥ 60 Hari: {OPEN_GT60} TT

📍 AKTIVITAS HARIAN:
📈 TT Open Hari Ini: {NEW_OPEN} Lokasi
✅ TT Closed Kemarin: {CLOSED_KEMARIN} Lokasi

🎯 TARGET BERSAMA:
- Menjaga total TT tetap di bawah 100 TT
- Mengejar target menuju < 30 TT
- Meningkatkan kecepatan penyelesaian/close tiket < 8 Hari

🤝 SEMANGAT KOLABORASI:
Apresiasi tinggi untuk semua Tim NOC, O&M, PA, dan Asset atas sinergi yang solid
Dengan penuh semangat kebersamaan, komunikasi efektif, dan komitmen bersama. InsyaAllah semua target bisa kita capai lebih cepat dan lebih baik.

💥 Bismillah Yuk Bisa Yuk!
💪 Tetap semangat, tetap solid!',
  'Template rekap pagi harian'
);
