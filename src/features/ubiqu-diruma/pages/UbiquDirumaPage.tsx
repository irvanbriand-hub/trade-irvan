import { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import {
  Camera,
  Upload,
  FileSpreadsheet,
  FileDown,
  FileUp,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import type { DatasetRow, UbiquEdit, UbiquField } from '../lib/types';
import { CAPTURE_TOP_N, HTB_FILE_PREFIX } from '../lib/types';
import { parseTicketFile } from '../lib/parseTicket';
import { parseDatasheetFile } from '../lib/parseDatasheet';
import { transformTickets } from '../lib/transform';
import {
  loadDataset,
  loadEdits,
  loadReference,
  loadReferenceCounts,
  replaceDataset,
  replaceReference,
  upsertEdit,
  resetEdit,
  saveProgressTeknisiBulk,
  loadHtbOverride,
  addHtbOverride,
  removeHtbOverride,
  parseTicketIdList,
  resetUbiquData,
  type ReferenceCounts,
} from '../lib/queries';
import { buildHtbWorkbookBlob, readHtbProgressTeknisi } from '../lib/htbExcel';
import { ResultTable, type EditingCell } from '../components/ResultTable';
import { MobileCards } from '../components/MobileCards';
import { HtbTable } from '../components/HtbTable';
import { HtbOverridePanel } from '../components/HtbOverridePanel';
import { UbiquCaptureView } from '../components/CaptureView';

// ─── WIB date helpers ────────────────────────────────────────────────────────
function wibNow(): Date {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}
function fmtDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(
    d.getUTCMonth() + 1,
  ).padStart(2, '0')}/${d.getUTCFullYear()}`;
}
function fmtTime(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(
    d.getUTCMinutes(),
  ).padStart(2, '0')}`;
}

export default function UbiquDirumaPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [edits, setEdits] = useState<UbiquEdit[]>([]);
  const [htbOverride, setHtbOverride] = useState<string[]>([]);
  const [refCounts, setRefCounts] = useState<ReferenceCounts>({
    product: 0,
    po: 0,
    htbSites: 0,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | string>(null);
  const [unmapped, setUnmapped] = useState(0);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  // Sertakan kolom spare (MRQ/RESI/ETA/Status Pengiriman) di capture PNG.
  const [includeSpareCapture, setIncludeSpareCapture] = useState(false);

  const ticketInputRef = useRef<HTMLInputElement>(null);
  const datasheetInputRef = useRef<HTMLInputElement>(null);
  const filledInputRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  // Override live: tiket di daftar override dipaksa HTB walau htb_label-nya NON HTB.
  const overrideSet = useMemo(() => new Set(htbOverride), [htbOverride]);
  const effLabel = (r: DatasetRow): 'HTB' | 'NON HTB' =>
    overrideSet.has(r.ticket_id) ? 'HTB' : r.htb_label;

  const htbRows = useMemo(
    () => rows.filter((r) => effLabel(r) === 'HTB'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, overrideSet],
  );
  const nonHtbRows = useMemo(
    () => rows.filter((r) => effLabel(r) === 'NON HTB'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, overrideSet],
  );
  const topNonHtb = nonHtbRows.slice(0, CAPTURE_TOP_N);

  async function reload() {
    const [d, e, c, o] = await Promise.all([
      loadDataset(),
      loadEdits(),
      loadReferenceCounts(),
      loadHtbOverride(),
    ]);
    setRows(d);
    setEdits(e);
    setRefCounts(c);
    setHtbOverride(o);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await reload();
      } catch (err) {
        toast({
          title: 'Gagal load data',
          description: (err as Error).message,
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDatasheetFile(file: File) {
    setBusy('datasheet');
    try {
      const parsed = await parseDatasheetFile(file);
      if (parsed.product.length === 0 && parsed.po.length === 0) {
        throw new Error(
          'Datasheet tidak punya sheet PRODUCT/PO yang terbaca. Cek nama sheet.',
        );
      }
      await replaceReference(parsed);
      await reload();
      toast({
        title: 'Datasheet tersimpan',
        description: `PRODUCT: ${parsed.product.length} · PO: ${parsed.po.length} · HTB sites: ${parsed.htbSites.length}`,
      });
    } catch (err) {
      toast({
        title: 'Gagal proses datasheet',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleTicketFile(file: File) {
    setBusy('ticket');
    try {
      const ref = await loadReference();
      if (ref.product.length === 0) {
        throw new Error(
          'Datasheet PRODUCT kosong. Upload datasheet referensi dulu sebelum upload tiket.',
        );
      }
      const tickets = await parseTicketFile(file);
      const result = transformTickets(tickets, ref);
      await replaceDataset(result.rows);
      await reload();
      setUnmapped(result.unmappedPackages);
      toast({
        title: 'Tiket diproses',
        description: `${result.rows.length} UBIQU DIRUMA dari ${result.totalTickets} tiket · HTB ${result.htbCount} / NON-HTB ${result.nonHtbCount}`,
      });
    } catch (err) {
      toast({
        title: 'Gagal proses tiket',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleDownloadExcel() {
    if (htbRows.length === 0) return;
    setBusy('download');
    try {
      const now = wibNow();
      const blob = await buildHtbWorkbookBlob(
        htbRows,
        edits,
        fmtDate(now),
        fmtTime(now),
      );
      const stamp = `${String(now.getUTCDate()).padStart(2, '0')}${String(
        now.getUTCMonth() + 1,
      ).padStart(2, '0')}${now.getUTCFullYear()}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `${HTB_FILE_PREFIX}_${stamp}.xlsx`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      toast({
        title: 'Excel HTB di-download',
        description: `${htbRows.length} tiket. Progress Teknisi pre-filled, kolom Aset kosong.`,
      });
    } catch (err) {
      toast({
        title: 'Gagal generate Excel',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleUploadFilled(file: File) {
    setBusy('filled');
    try {
      const { entries, skippedNoTT } = await readHtbProgressTeknisi(file);
      const saved = await saveProgressTeknisiBulk(entries);
      setEdits(await loadEdits());
      toast({
        title: 'Progress Teknisi tersimpan',
        description:
          `${saved} baris disimpan` +
          (skippedNoTT > 0
            ? ` · ${skippedNoTT} dilewati (No Tiket tanpa nomor TT)`
            : ''),
      });
    } catch (err) {
      toast({
        title: 'Gagal proses Excel terisi',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleSave(ticketId: string, field: UbiquField, value: string) {
    try {
      await upsertEdit(ticketId, field, value);
      setEdits(await loadEdits());
      setEditingCell(null);
    } catch (err) {
      toast({
        title: 'Gagal simpan',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  }

  async function handleReset(ticketId: string, field: UbiquField) {
    try {
      await resetEdit(ticketId, field);
      setEdits(await loadEdits());
    } catch (err) {
      toast({
        title: 'Gagal reset',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  }

  async function handleAddOverride(text: string) {
    setBusy('override');
    try {
      const ids = parseTicketIdList(text);
      if (ids.length === 0) {
        throw new Error('Tidak ada Ticket ID valid terbaca dari teks.');
      }
      await addHtbOverride(ids);
      setHtbOverride(await loadHtbOverride());
      const matched = ids.filter((id) =>
        rows.some((r) => r.ticket_id === id),
      ).length;
      toast({
        title: 'Override HTB ditambah',
        description: `${ids.length} Ticket ID · ${matched} cocok dengan tiket saat ini → pindah ke HTB.`,
      });
    } catch (err) {
      toast({
        title: 'Gagal tambah override',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleRemoveOverride(ticketId: string) {
    try {
      await removeHtbOverride(ticketId);
      setHtbOverride(await loadHtbOverride());
    } catch (err) {
      toast({
        title: 'Gagal hapus override',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  }

  async function handleResetData() {
    setBusy('reset');
    try {
      await resetUbiquData();
      await reload();
      setUnmapped(0);
      toast({
        title: 'Data UBIQU direset',
        description:
          'Tiket, edit manual, & override HTB dihapus. Datasheet referensi tetap.',
      });
    } catch (err) {
      toast({
        title: 'Gagal reset data',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleCapture() {
    const el = captureRef.current;
    if (!el) return;
    setBusy('capture');
    el.style.left = '0';
    el.style.position = 'fixed';
    el.style.zIndex = '-1';
    try {
      const canvas = await html2canvas(el, {
        backgroundColor: '#ffffff',
        scale: 3,
        useCORS: true,
        allowTaint: true,
        width: el.scrollWidth,
        height: el.scrollHeight,
        windowWidth: 1700,
        logging: false,
        imageTimeout: 0,
      });
      const d = wibNow();
      const stamp = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}`;
      const link = document.createElement('a');
      link.download = `ubiqu-diruma-nonhtb-${stamp}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
    } catch (err) {
      toast({
        title: 'Gagal capture',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      el.style.left = '-9999px';
      el.style.position = 'absolute';
      el.style.zIndex = 'auto';
      setBusy(null);
    }
  }

  const now = wibNow();

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto px-3 sm:px-4">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:justify-between lg:items-start">
        <div>
          <h2 className="text-lg font-semibold">Tiket UBIQU DIRUMA</h2>
          <p className="text-xs text-muted-foreground">
            Upload tiket harian → dibelah HTB (Excel) & NON-HTB (capture top{' '}
            {CAPTURE_TOP_N})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={datasheetInputRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleDatasheetFile(f);
              e.target.value = '';
            }}
          />
          <input
            ref={ticketInputRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleTicketFile(f);
              e.target.value = '';
            }}
          />
          <input
            ref={filledInputRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUploadFilled(f);
              e.target.value = '';
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={busy !== null}
            onClick={() => datasheetInputRef.current?.click()}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            {busy === 'datasheet' ? 'Memproses...' : 'Upload Datasheet'}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={busy !== null}
            onClick={() => ticketInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            {busy === 'ticket' ? 'Memproses...' : 'Upload Tiket'}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5"
                disabled={busy !== null}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {busy === 'reset' ? 'Menghapus...' : 'Reset Data'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset semua data UBIQU?</AlertDialogTitle>
                <AlertDialogDescription>
                  Menghapus seluruh tiket, edit manual (Kendala/MRQ/RESI/ETA/Status
                  & Progress Teknisi), serta daftar override HTB. Datasheet
                  referensi (PRODUCT/PO/HTB) <strong>tidak</strong> dihapus. Aksi
                  ini tidak bisa dibatalkan.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleResetData}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Hapus Semua
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Stats bar */}
      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
        <span>
          UBIQU DIRUMA: <strong className="text-foreground">{rows.length} TT</strong>
        </span>
        <span className="text-red-600 dark:text-red-400">
          HTB: <strong>{htbRows.length}</strong>
        </span>
        <span>
          NON-HTB: <strong className="text-foreground">{nonHtbRows.length}</strong>
        </span>
        <span>
          Datasheet → PRODUCT: {refCounts.product} · PO: {refCounts.po} · HTB
          sites: {refCounts.htbSites}
        </span>
      </div>

      {/* Reference empty warning */}
      {refCounts.product === 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-md p-3 text-xs flex gap-2">
          <FileSpreadsheet className="h-4 w-4 flex-shrink-0 text-blue-500" />
          <div>
            Datasheet referensi belum ada. Upload dulu file{' '}
            <strong>example sheet.xlsx</strong> (sheet PRODUCT, PO, HTB) lewat
            tombol <strong>Upload Datasheet</strong> sebelum upload tiket.
          </div>
        </div>
      )}

      {/* Unmapped package warning */}
      {unmapped > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md p-3 text-xs flex gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-500" />
          <div>
            <strong>{unmapped}</strong> paket tidak terklasifikasi di datasheet
            PRODUCT (produk unknown) — tiket dengan paket tsb tidak ikut terfilter.
            Lengkapi datasheet PRODUCT bila ada yang seharusnya UBIQU DIRUMA.
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
          Memuat data...
        </div>
      ) : (
        <Tabs defaultValue="nonhtb" className="w-full">
          <TabsList>
            <TabsTrigger value="nonhtb">
              NON-HTB (web) · {nonHtbRows.length}
            </TabsTrigger>
            <TabsTrigger value="htb">HTB (Excel) · {htbRows.length}</TabsTrigger>
            <TabsTrigger value="override">
              Override HTB · {htbOverride.length}
            </TabsTrigger>
          </TabsList>

          {/* ─── NON-HTB: tabel web editable + capture PNG ─── */}
          <TabsContent value="nonhtb" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Isi Progress/Problem/MRQ/RESI/ETA/Status langsung di tabel. Tersimpan
                & nempel ke tiket (kunci No Tiket). Top {CAPTURE_TOP_N} teratas masuk
                capture.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <Checkbox
                    checked={includeSpareCapture}
                    onCheckedChange={(v) => setIncludeSpareCapture(v === true)}
                    disabled={busy !== null}
                  />
                  Sertakan kolom spare (MRQ/RESI/ETA/Status)
                </label>
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1.5"
                  disabled={busy !== null || topNonHtb.length === 0}
                  onClick={handleCapture}
                >
                  <Camera className="h-3.5 w-3.5" />
                  {busy === 'capture' ? 'Capturing...' : 'Capture PNG'}
                </Button>
              </div>
            </div>
            {nonHtbRows.length === 0 ? (
              <div className="bg-muted/30 border border-dashed border-border rounded-lg p-8 text-center">
                <p className="text-sm font-medium">Belum ada data NON-HTB.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Upload datasheet lalu file tiket untuk mulai.
                </p>
              </div>
            ) : (
              <>
                <MobileCards
                  rows={nonHtbRows}
                  edits={edits}
                  editingCell={editingCell}
                  setEditingCell={setEditingCell}
                  onSave={handleSave}
                  onReset={handleReset}
                />
                <ResultTable
                  rows={nonHtbRows}
                  edits={edits}
                  editingCell={editingCell}
                  setEditingCell={setEditingCell}
                  onSave={handleSave}
                  onReset={handleReset}
                />
              </>
            )}
          </TabsContent>

          {/* ─── HTB: roundtrip Excel ─── */}
          <TabsContent value="htb" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5"
                disabled={busy !== null || htbRows.length === 0}
                onClick={handleDownloadExcel}
              >
                <FileDown className="h-3.5 w-3.5" />
                {busy === 'download' ? 'Menyiapkan...' : 'Download Excel HTB'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={busy !== null}
                onClick={() => filledInputRef.current?.click()}
              >
                <FileUp className="h-3.5 w-3.5" />
                {busy === 'filled' ? 'Memproses...' : 'Upload Excel Terisi'}
              </Button>
            </div>
            <HtbTable rows={htbRows} edits={edits} overrideIds={htbOverride} />
          </TabsContent>

          {/* ─── Override HTB by Ticket ID ─── */}
          <TabsContent value="override" className="space-y-3">
            <HtbOverridePanel
              overrideIds={htbOverride}
              rows={rows}
              onAdd={handleAddOverride}
              onRemove={handleRemoveOverride}
              busy={busy !== null}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* Hidden capture target (NON-HTB top N) */}
      <div
        ref={captureRef}
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 0,
          backgroundColor: '#ffffff',
        }}
      >
        <UbiquCaptureView
          rows={topNonHtb}
          edits={edits}
          dateLabel={fmtDate(now)}
          timeLabel={fmtTime(now)}
          includeSpare={includeSpareCapture}
        />
      </div>
    </div>
  );
}
