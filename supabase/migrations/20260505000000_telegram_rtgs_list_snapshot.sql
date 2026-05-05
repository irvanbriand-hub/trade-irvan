-- ============================================================
-- TABLE: telegram_rtgs_list_snapshot
-- Snapshot urutan ticket dari /rtgs-list per chat Telegram.
-- Dipakai untuk map nomor (#1, #2, ...) ke ticket_id pada
-- command edit: /rtgs-edit-kendala-2 <text>
--
-- Single row per chat_id — overwrite tiap kali /rtgs-list
-- dipanggil di chat tersebut.
-- ============================================================
create table telegram_rtgs_list_snapshot (
  chat_id text primary key,
  tickets jsonb not null,
  -- [{ idx: 1, ticket_id: 'AM...', site_id: 'AM...', site_name: '...', down_time: 12 }, ...]
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS — service role bypass, tidak perlu policy permissive.
-- Tabel ini cuma diakses dari webhook (api/telegram-webhook.ts) dengan SUPABASE_SERVICE_ROLE_KEY.
alter table telegram_rtgs_list_snapshot enable row level security;

-- Auto update updated_at
create trigger telegram_rtgs_list_snapshot_updated_at
before update on telegram_rtgs_list_snapshot
for each row execute function update_updated_at();
