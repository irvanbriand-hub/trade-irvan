-- Fix: trigger tt_records_updated_at salah pakai updated_at, harusnya last_updated

-- Drop trigger yang salah
drop trigger if exists tt_records_updated_at on tt_records;

-- Buat fungsi trigger khusus untuk tt_records yang pakai last_updated
create or replace function update_tt_records_last_updated()
returns trigger as $$
begin
  new.last_updated = now();
  return new;
end;
$$ language plpgsql;

-- Pasang trigger baru yang benar
create trigger tt_records_last_updated
before update on tt_records
for each row execute function update_tt_records_last_updated();
