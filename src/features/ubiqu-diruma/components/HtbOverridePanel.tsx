import { useMemo, useState } from 'react';
import { Plus, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DatasetRow } from '../lib/types';

interface HtbOverridePanelProps {
  overrideIds: string[]; // ticket_id ("TT ...") yang dipaksa HTB
  rows: DatasetRow[]; // dataset mentah (untuk lookup nama lokasi / presence)
  onAdd: (text: string) => void;
  onRemove: (ticketId: string) => void;
  busy: boolean;
}

/**
 * Panel kelola override HTB by Ticket ID.
 * Paste daftar Ticket ID → tiket tsb dipaksa pindah ke HTB (live, tanpa upload ulang).
 * Tiket yang sudah close (hilang dari upload harian) otomatis terhapus dari sini.
 */
export function HtbOverridePanel({
  overrideIds,
  rows,
  onAdd,
  onRemove,
  busy,
}: HtbOverridePanelProps) {
  const [text, setText] = useState('');

  const rowById = useMemo(() => {
    const m = new Map<string, DatasetRow>();
    for (const r of rows) m.set(r.ticket_id, r);
    return m;
  }, [rows]);

  const sorted = useMemo(
    () => [...overrideIds].sort((a, b) => a.localeCompare(b)),
    [overrideIds],
  );

  function submit() {
    if (!text.trim()) return;
    onAdd(text);
    setText('');
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Paste <strong>Ticket ID</strong> (mis. <code>TT 1038696</code>, satu per
        baris / pisah koma). Tiket itu dipaksa jadi <strong>HTB</strong> walau
        trouble category-nya bukan Converter. Berubah langsung — pindah dari
        NON-HTB ke HTB. Tiket yang sudah close (tak ada di upload berikutnya)
        otomatis hilang dari daftar ini.
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'TT 1038696\nTT 1038582, TT 997328'}
          rows={3}
          className="flex-1 text-sm p-2 border rounded bg-background font-mono min-h-[72px]"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button
          size="sm"
          className="gap-1.5 self-start"
          disabled={busy || !text.trim()}
          onClick={submit}
        >
          <Plus className="h-3.5 w-3.5" />
          Tambah ke HTB
        </Button>
      </div>

      <div className="border rounded-md">
        <div className="px-3 py-2 text-xs font-semibold bg-muted/50 border-b">
          Daftar override ({sorted.length})
        </div>
        {sorted.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            Belum ada override. Semua klasifikasi murni dari trouble category.
          </div>
        ) : (
          <ul className="divide-y">
            {sorted.map((id) => {
              const row = rowById.get(id);
              return (
                <li
                  key={id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-xs">{id}</span>
                    {row ? (
                      <span className="text-muted-foreground">
                        {' '}
                        — {row.site_name || '-'} · {row.province || '-'} ·{' '}
                        <span className="italic">{row.trouble_category || '-'}</span>
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-1 ml-1">
                        <AlertCircle className="h-3 w-3" />
                        tidak ada di tiket saat ini
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onRemove(id)}
                    disabled={busy}
                    className="p-1 rounded hover:bg-destructive/20 flex-shrink-0"
                    title="Hapus dari override"
                  >
                    <X className="h-3.5 w-3.5 text-red-600" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
