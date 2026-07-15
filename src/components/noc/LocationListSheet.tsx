import { useMemo, useState } from 'react';
import { Search, Copy, Download, ChevronDown, MapPin, ExternalLink } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getPO } from '@/lib/noc/classifiers';
import type { SiteMaster } from '@/lib/noc/siteMasterQueries';
import type { TTRecordDB, PO } from '@/lib/noc/types';

interface LocationListSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  desc?: string;
  rows: TTRecordDB[];
  siteById: Map<string, SiteMaster>;
  poList: PO[];
  total: number;
}

interface EnrichedRow {
  r: TTRecordDB;
  kategori: string;
  kabupaten: string;
  gateway: string;
  hub: string;
  beam: string;
  lat: number | null;
  lon: number | null;
  po: string;
}

function agingColor(d: number): string {
  if (d >= 11) return 'text-red-600 dark:text-red-400';
  if (d > 7) return 'text-orange-600 dark:text-orange-400';
  if (d >= 3) return 'text-amber-600 dark:text-amber-400';
  return 'text-muted-foreground';
}

function csvCell(v: string | number | null | undefined): string {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function LocationListSheet({ open, onOpenChange, title, desc, rows, siteById, poList, total }: LocationListSheetProps) {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const enriched = useMemo<EnrichedRow[]>(() => {
    return rows
      .map((r) => {
        const s = r.site_id ? siteById.get(r.site_id) : undefined;
        return {
          r,
          kategori: s?.kategori_lokasi ?? '',
          kabupaten: r.kabupaten ?? s?.kabupaten ?? '',
          gateway: s?.gateway ?? '',
          hub: s?.hub ?? '',
          beam: s?.beam ?? '',
          lat: s?.latitude ?? null,
          lon: s?.longitude ?? null,
          po: getPO(r.provinsi ?? '', r.kabupaten ?? '', poList)?.name ?? '-',
        };
      })
      .sort((a, b) => b.r.down_time - a.r.down_time);
  }, [rows, siteById, poList]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return enriched;
    return enriched.filter((e) =>
      [e.r.site_name, e.r.site_id, e.r.provinsi, e.kabupaten, e.kategori, e.po]
        .some((v) => (v ?? '').toLowerCase().includes(term)),
    );
  }, [enriched, q]);

  function handleCopy() {
    const text = filtered
      .map((e) => `${e.r.site_name} — ${e.r.provinsi ?? '-'} — ${e.r.down_time}h`)
      .join('\n');
    navigator.clipboard.writeText(text).then(
      () => toast({ title: 'Disalin', description: `${filtered.length} lokasi disalin ke clipboard.` }),
      () => toast({ title: 'Gagal menyalin', variant: 'destructive' }),
    );
  }

  function handleExport() {
    const header = ['Site ID', 'Nama Lokasi', 'Provinsi', 'Kabupaten', 'Kategori', 'Umur (hari)', 'PO', 'Gateway', 'HUB', 'Beam', 'Latitude', 'Longitude'];
    const lines = [
      header.join(','),
      ...filtered.map((e) =>
        [e.r.site_id, e.r.site_name, e.r.provinsi, e.kabupaten, e.kategori, e.r.down_time, e.po, e.gateway, e.hub, e.beam, e.lat, e.lon]
          .map(csvCell)
          .join(','),
      ),
    ];
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `open-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const pct = total > 0 ? Math.round((rows.length / total) * 100) : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col gap-0">
        <SheetHeader className="px-5 pt-5 pb-3 space-y-1 border-b border-border">
          <SheetTitle className="text-base">
            {title}{' '}
            <span className="text-muted-foreground font-normal">
              — {rows.length} lokasi ({pct}%)
            </span>
          </SheetTitle>
          {desc && <SheetDescription className="text-xs">{desc}</SheetDescription>}
        </SheetHeader>

        {/* Toolbar */}
        <div className="px-5 py-3 flex items-center gap-2 border-b border-border">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama / site ID / provinsi / PO…"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleCopy} disabled={filtered.length === 0}>
            <Copy className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Copy</span>
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">CSV</span>
          </Button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Tidak ada lokasi.</div>
          ) : (
            filtered.map((e) => {
              const isOpen = expanded === e.r.id;
              const mapsUrl =
                e.lat != null && e.lon != null ? `https://www.google.com/maps?q=${e.lat},${e.lon}` : null;
              return (
                <div key={e.r.id} className="border-b border-border/60 last:border-0">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : e.r.id)}
                    className="w-full px-5 py-2.5 flex items-start gap-2 text-left hover:bg-accent/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-tight break-words">{e.r.site_name}</div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {e.r.site_id ?? '-'}
                        {e.r.provinsi ? ` · ${e.r.provinsi}` : ''}
                        {e.kabupaten ? ` · ${e.kabupaten}` : ''}
                        {e.kategori ? ` · ${e.kategori}` : ''}
                      </div>
                    </div>
                    <span className={cn('text-xs font-bold tabular-nums flex-shrink-0', agingColor(e.r.down_time))}>
                      {e.r.down_time}h
                    </span>
                    <ChevronDown className={cn('h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform', isOpen && 'rotate-180')} />
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-3 pt-1 text-xs space-y-1.5 bg-muted/20">
                      <Detail label="Ticket ID" value={e.r.ticket_id} mono />
                      <Detail label="Tiket Internal" value={e.r.tiket_internal} mono />
                      <Detail label="PO" value={e.po} />
                      <Detail label="Gateway" value={e.gateway} mono />
                      <Detail label="HUB" value={e.hub} />
                      <Detail label="Beam" value={e.beam} />
                      <Detail label="Problem" value={[e.r.prob_class, e.r.detail_prob].filter(Boolean).join(' — ')} />
                      <Detail label="Target Online" value={e.r.target_online_edited || e.r.target_online_original} />
                      <Detail label="Mulai (date start)" value={e.r.date_start} />
                      <Detail label="Teknis/Non" value={e.r.teknis_nt} />
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span className="text-muted-foreground">Koordinat</span>
                        {mapsUrl ? (
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                          >
                            <MapPin className="h-3 w-3" />
                            {e.lat}, {e.lon}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Detail({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground flex-shrink-0">{label}</span>
      <span className={cn('text-right break-words', mono && 'font-mono text-[11px]', !value && 'text-muted-foreground/60')}>
        {value || '—'}
      </span>
    </div>
  );
}
