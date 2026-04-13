import { useState } from 'react';
import { ChevronDown, ChevronUp, Download, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNOC } from '@/lib/noc/hooks/useNOC';
import { usePOList } from '@/lib/noc/hooks/usePOList';
import { AREA_MAP } from '@/lib/noc/constants';
import { getCloseType, getPO } from '@/lib/noc/classifiers';
import type { TTRecord, PO } from '@/lib/noc/types';

function normalizeDateFromSheet(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
}

function mapSheetJSON(rows: Record<string, string>[], poList: PO[]): TTRecord[] {
  return rows
    .map((row): TTRecord | null => {
      const tiketInternal = (row['TIKET INTERNAL'] ?? '').trim();
      const ticketId      = (row['TICKET ID'] ?? '').trim();
      const siteId        = (row['SITE ID'] ?? '').trim();
      const status        = (row['STATUS'] ?? '').trim().toUpperCase();
      const siteName      = (row['SITE NAME'] ?? '').trim();
      const provinsi      = (row['PROVINSI'] ?? '').trim().toUpperCase();
      const kabupaten     = (row['KABUPATEN'] ?? '').trim()
                              .toUpperCase()
                              .replace(/^(KAB\.|KAB\s+|KOTA\s+)/, '')
                              .trim();
      const dateStart     = normalizeDateFromSheet(row['DATE START TT'] ?? '');
      const downTime      = parseInt((row['DOWN TIME'] ?? '').replace(/[^0-9]/g, '')) || 0;
      const targetOnline  = normalizeDateFromSheet(row['TARGET ONLINE'] ?? '');
      const actualOnline  = normalizeDateFromSheet(row['ACTUAL ONLINE'] ?? '');
      const probClass     = (row['PROBLEM CLASSIFICATION'] ?? '').trim();
      const detailProb    = (row['DETAIL PROBLEM'] ?? '').trim();
      const teknisNT      = (row['TEKNIS/NON TEKNIS'] ?? '').trim().toUpperCase();

      if (status !== 'OPEN' && status !== 'CLOSED') return null;

      const areaRaw = AREA_MAP[provinsi];
      const area = (areaRaw === 1 || areaRaw === 2 || areaRaw === 3 ? areaRaw : 0) as 0 | 1 | 2 | 3;
      const closeType = getCloseType(tiketInternal, downTime, status);
      const po = getPO(provinsi, kabupaten, poList);
      const isVisit = tiketInternal.toUpperCase().includes('KUNJUNGAN');

      return {
        tiketInternal, ticketId, siteId, status, siteName,
        provinsi, kabupaten,
        layanan: '',
        dateStart, downTime, targetOnline, actualOnline,
        probClass, detailProb,
        note: '',
        teknisNT,
        area, po, closeType,
        isReschedule: false,
        isVisit,
      };
    })
    .filter((r): r is TTRecord => r !== null);
}

export function TsvUploader() {
  const { loadTSV, loadFromRecords, clearData, rawData, isLoading, mergeResult } = useNOC();
  const { data: poList = [] } = usePOList();

  const [tsv, setTsv] = useState('');
  const [date, setDate] = useState(() => new Date().toLocaleDateString('id-ID'));
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');

  async function handleParse() {
    setError('');
    if (!tsv.trim()) {
      setError('TSV tidak boleh kosong.');
      return;
    }
    try {
      await loadTSV(tsv, poList, date);
      setCollapsed(true);
    } catch (e) {
      setError('Gagal parse atau simpan TSV. Pastikan format kolom sudah benar (16 kolom, tab-separated).');
    }
  }

  async function handleSyncFromSheet() {
    if (isSyncing) return;
    setSyncError('');
    setIsSyncing(true);
    try {
      const url = import.meta.env.VITE_NOC_SHEETS_URL as string | undefined;
      const res = await fetch(url ?? '');
      if (!res.ok) throw new Error('network');
      const json: unknown = await res.json();
      if (!Array.isArray(json) || json.length === 0) {
        setSyncError('Tidak ada data dari Google Sheet.');
        return;
      }
      const records = mapSheetJSON(json as Record<string, string>[], poList);
      await loadFromRecords(records, date);
    } catch (e) {
      if (e instanceof SyntaxError) {
        setSyncError('Format data tidak valid.');
      } else {
        setSyncError('Gagal terhubung ke Google Sheet.');
      }
    } finally {
      setIsSyncing(false);
    }
  }

  function handleClear() {
    setTsv('');
    setDate(new Date().toLocaleDateString('id-ID'));
    setError('');
    clearData();
    setCollapsed(false);
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Import TSV Google Sheet</span>
          {rawData.length > 0 && (
            <span className="ml-2 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
              {rawData.length} TT loaded ✓
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {rawData.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClear} className="h-7 gap-1 text-xs text-muted-foreground">
              <X className="h-3 w-3" /> Reset
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Merge result banner */}
      {mergeResult && (
        <div className="mx-4 mb-3 rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm">
          <p className="font-medium text-green-400 mb-1">✅ Data berhasil diproses</p>
          <div className="text-muted-foreground space-y-0.5 text-xs">
            <p>Baru diinsert: <span className="font-medium text-foreground">{mergeResult.inserted}</span> TT</p>
            <p>
              Diupdate:{' '}
              <span className="font-medium text-foreground">{mergeResult.updated}</span> TT
              {mergeResult.statusChanged > 0 && (
                <span className="ml-1 text-yellow-400">({mergeResult.statusChanged} status berubah)</span>
              )}
            </p>
            {mergeResult.updatedProtected > 0 && (
              <p className="pl-2 text-muted-foreground/70">
                ↳ Edit manual dijaga:{' '}
                <span className="font-medium text-foreground">{mergeResult.updatedProtected}</span> TT
              </p>
            )}
            <p>Total aktif di database: <span className="font-medium text-foreground">{mergeResult.totalInDB}</span> TT</p>
          </div>
        </div>
      )}

      {/* Body — collapsible */}
      {!collapsed && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-44">
              <Label className="text-xs text-muted-foreground">Tanggal laporan</Label>
              <Input
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 text-sm mt-1"
                placeholder="08/04/2026"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">
              Paste TSV di sini (copy dari Google Sheet, semua baris termasuk header)
            </Label>
            <Textarea
              value={tsv}
              onChange={(e) => setTsv(e.target.value)}
              className="mt-1 h-32 font-mono text-xs resize-none"
              placeholder="TIKET INTERNAL&#9;TICKET ID&#9;SITE ID&#9;STATUS&#9;..."
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
          {syncError && <p className="text-xs text-destructive">{syncError}</p>}

          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={handleParse} disabled={isLoading || isSyncing} className="gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              {isLoading ? 'Menyimpan...' : 'Parse & Load'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSyncFromSheet}
              disabled={isSyncing}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              {isSyncing ? 'Mengambil data dari Google Sheet...' : 'Sync dari Google Sheet'}
            </Button>
            {tsv && (
              <Button size="sm" variant="outline" onClick={() => setTsv('')}>
                Clear
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
