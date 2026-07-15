import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, FileSpreadsheet, Save, Loader2, MapPin, CheckCircle2, Database, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SiteMasterTable } from '@/components/noc/SiteMasterTable';
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
import {
  parseSiteMasterExcel,
  upsertSiteMaster,
  countSiteMaster,
  resetSiteMaster,
  SITE_MASTER_LIST_QK,
  type ParseResult,
} from '@/lib/noc/siteMasterQueries';

const PREVIEW_LIMIT = 100;
const COUNT_QK = ['noc', 'site_master', 'count'] as const;

export default function SiteMasterPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: dbCount = 0 } = useQuery({
    queryKey: COUNT_QK,
    queryFn: countSiteMaster,
  });

  async function handleFile(file: File) {
    setParsing(true);
    setParsed(null);
    setFileName(file.name);
    try {
      const result = await parseSiteMasterExcel(file);
      setParsed(result);
      if (result.rows.length === 0) {
        toast({ title: 'Tidak ada baris valid', description: 'Semua baris tanpa SITE ID.', variant: 'destructive' });
      }
    } catch (err) {
      setFileName(null);
      toast({ title: 'Gagal baca Excel', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!parsed || parsed.rows.length === 0) return;
    setSaving(true);
    try {
      const saved = await upsertSiteMaster(parsed.rows);
      await Promise.all([
        qc.invalidateQueries({ queryKey: COUNT_QK }),
        qc.invalidateQueries({ queryKey: SITE_MASTER_LIST_QK }),
      ]);
      toast({ title: 'Tersimpan', description: `${saved} site berhasil disimpan / diperbarui.` });
      setParsed(null);
      setFileName(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      toast({ title: 'Gagal simpan', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    try {
      await resetSiteMaster();
      await Promise.all([
        qc.invalidateQueries({ queryKey: COUNT_QK }),
        qc.invalidateQueries({ queryKey: SITE_MASTER_LIST_QK }),
      ]);
      toast({ title: 'Data dihapus', description: 'Semua master site dihapus.' });
    } catch (err) {
      toast({ title: 'Gagal hapus', description: (err as Error).message, variant: 'destructive' });
    }
  }

  const rows = parsed?.rows ?? [];
  const preview = rows.slice(0, PREVIEW_LIMIT);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Master Site
          </h2>
          <p className="text-xs text-muted-foreground">
            Data referensi lokasi (koordinat, IP, cluster) — sumber upload Excel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium">
            <Database className="h-3.5 w-3.5 text-primary" />
            {dbCount.toLocaleString('id-ID')} site tersimpan
          </span>
          {dbCount > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Hapus semua</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Hapus semua master site?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Seluruh {dbCount.toLocaleString('id-ID')} baris master site akan dihapus. Aksi ini tidak bisa dibatalkan.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleReset}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Hapus Semua
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Uploader */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload Excel Master Site
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => fileRef.current?.click()} disabled={parsing} className="gap-2">
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              {parsing ? 'Membaca…' : 'Pilih File Excel'}
            </Button>
            {fileName && (
              <span className="text-xs text-muted-foreground truncate max-w-[240px]">{fileName}</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Kolom yang dibaca: <code className="text-foreground">SITE ID</code>, NAME, KATEGORI LOKASI, IP ADDRESS,
            GATEWAY, PROVINSI, KABUPATEN, KECAMATAN, CLUSTER, DESA, HUB, BEAM, LONGITUDE, LATITUDE. Baris tanpa SITE ID dilewati; site_id
            kembar di-merge. Simpan memakai <strong>upsert</strong> — site lama diperbarui, site baru ditambahkan.
          </p>
        </CardContent>
      </Card>

      {/* Preview + Save */}
      {parsed && rows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-green-500/10 text-green-700 dark:text-green-400 px-2 py-1 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {rows.length.toLocaleString('id-ID')} valid
                </span>
                {parsed.duplicates > 0 && (
                  <span className="rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-1 font-medium">
                    {parsed.duplicates} duplikat di-merge
                  </span>
                )}
                {parsed.skipped > 0 && (
                  <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground font-medium">
                    {parsed.skipped} dilewati (tanpa SITE ID)
                  </span>
                )}
              </div>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Menyimpan…' : `Simpan ${rows.length.toLocaleString('id-ID')} site`}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-auto max-h-[calc(100vh-22rem)]">
              <table className="w-full text-xs min-w-[1340px]">
                <thead className="bg-muted/60 sticky top-0 z-10">
                  <tr className="text-left [&>th]:px-2 [&>th]:py-2 [&>th]:font-semibold [&>th]:whitespace-nowrap">
                    <th className="w-10">#</th>
                    <th>Site ID</th>
                    <th>Name</th>
                    <th>Kategori</th>
                    <th>IP Address</th>
                    <th>Gateway</th>
                    <th>Provinsi</th>
                    <th>Kabupaten</th>
                    <th>Kecamatan</th>
                    <th>Cluster</th>
                    <th>Desa</th>
                    <th>HUB</th>
                    <th>Beam</th>
                    <th className="text-right">Longitude</th>
                    <th className="text-right">Latitude</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={r.site_id} className="border-t [&>td]:px-2 [&>td]:py-1.5 [&>td]:align-top hover:bg-accent/30">
                      <td className="text-muted-foreground tabular-nums">{i + 1}</td>
                      <td className="font-mono whitespace-nowrap">{r.site_id}</td>
                      <td>{r.name ?? '—'}</td>
                      <td>{r.kategori_lokasi ?? '—'}</td>
                      <td className="font-mono whitespace-nowrap">{r.ip_address ?? '—'}</td>
                      <td className="font-mono whitespace-nowrap">{r.gateway ?? '—'}</td>
                      <td>{r.provinsi ?? '—'}</td>
                      <td>{r.kabupaten ?? '—'}</td>
                      <td>{r.kecamatan ?? '—'}</td>
                      <td>{r.cluster ?? '—'}</td>
                      <td>{r.desa ?? '—'}</td>
                      <td>{r.hub ?? '—'}</td>
                      <td>{r.beam ?? '—'}</td>
                      <td className="text-right tabular-nums whitespace-nowrap">{r.longitude ?? '—'}</td>
                      <td className="text-right tabular-nums whitespace-nowrap">{r.latitude ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > PREVIEW_LIMIT && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Menampilkan {PREVIEW_LIMIT} dari {rows.length.toLocaleString('id-ID')} baris. Semua akan disimpan saat klik Simpan.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Data tersimpan */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Database className="h-4 w-4" />
            Data Tersimpan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SiteMasterTable />
        </CardContent>
      </Card>
    </div>
  );
}
