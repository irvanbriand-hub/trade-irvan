import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileSpreadsheet } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import {
  parseSCurveUploadFile,
  parseSCurveUploadText,
  type ParsedSCurveUpload,
  type SCurveUploadRow,
} from '@/lib/noc/scurveUploadParser';
import {
  getOpenSiteIds,
  type SCurveBaseline,
} from '@/lib/noc/scurveQueries';

interface SCurveUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBaseline: SCurveBaseline | null;
  onConfirm: (rows: SCurveUploadRow[], baselineDateISO: string) => void;
  isPending: boolean;
}

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function formatLong(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${parseInt(m[3], 10)} ${BULAN_ID[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

type TabKey = 'paste' | 'file';

export function SCurveUploadDialog({
  open,
  onOpenChange,
  currentBaseline,
  onConfirm,
  isPending,
}: SCurveUploadDialogProps) {
  const [tab, setTab] = useState<TabKey>('paste');
  const [pasteText, setPasteText] = useState('');
  const [parsed, setParsed] = useState<ParsedSCurveUpload | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [baselineDate, setBaselineDate] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: openSiteIds } = useQuery({
    queryKey: ['noc', 'open_site_ids'],
    queryFn: getOpenSiteIds,
    enabled: open,
    staleTime: 30_000,
  });

  const openSiteSet = useMemo(
    () => new Set(openSiteIds ?? []),
    [openSiteIds],
  );

  useEffect(() => {
    if (!open) {
      setPasteText('');
      setParsed(null);
      setParseError(null);
      setFileName(null);
      setBaselineDate('');
      setTab('paste');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open]);

  const crossCheck = useMemo(() => {
    if (!parsed) return { outstanding: 0, autoClose: 0, manualActual: 0 };
    let outstanding = 0;
    let autoClose = 0;
    let manualActual = 0;
    for (const r of parsed.validRows) {
      if (r.actual_online) {
        manualActual++;
      } else if (openSiteSet.has(r.site_id)) {
        outstanding++;
      } else {
        autoClose++;
      }
    }
    return { outstanding, autoClose, manualActual };
  }, [parsed, openSiteSet]);

  const periodEnd = useMemo(() => {
    if (!parsed || parsed.validRows.length === 0) return null;
    let max = parsed.validRows[0].target_online;
    for (const r of parsed.validRows) {
      if (r.target_online > max) max = r.target_online;
    }
    return max;
  }, [parsed]);

  const effectiveEnd = useMemo(() => {
    if (!periodEnd) return null;
    if (!baselineDate) return periodEnd;
    return periodEnd > baselineDate ? periodEnd : baselineDate;
  }, [periodEnd, baselineDate]);

  async function handleParsePaste() {
    setParseError(null);
    if (!pasteText.trim()) {
      setParseError('Paste data dulu sebelum parse.');
      return;
    }
    setIsParsing(true);
    try {
      const result = parseSCurveUploadText(pasteText);
      setParsed(result);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Gagal parse');
    } finally {
      setIsParsing(false);
    }
  }

  async function handleFileSelect(file: File) {
    setParseError(null);
    setFileName(file.name);
    setIsParsing(true);
    try {
      const result = await parseSCurveUploadFile(file);
      setParsed(result);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Gagal parse file');
    } finally {
      setIsParsing(false);
    }
  }

  function handleConfirm() {
    if (parsed && parsed.validRows.length > 0 && baselineDate) {
      onConfirm(parsed.validRows, baselineDate);
    }
  }

  function handleClearPaste() {
    setPasteText('');
    setParsed(null);
    setParseError(null);
  }

  const sampleRows = parsed?.validRows.slice(0, 5) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Baseline S-Curve</DialogTitle>
          <DialogDescription>
            Upload list site + target online. Site yang tidak ada di TT OPEN
            akan dianggap close on-time (actual = target).
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="paste">Paste TSV/CSV</TabsTrigger>
            <TabsTrigger value="file">Upload File</TabsTrigger>
          </TabsList>

          <TabsContent value="paste" className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">
                Header wajib:{' '}
                <code className="text-foreground">site_id</code> +{' '}
                <code className="text-foreground">target_online</code>.
                Optional:{' '}
                <code className="text-foreground">actual_online</code> untuk
                site yang sudah online (override). Pemisah otomatis (tab/koma/titik
                koma).
              </p>
              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                className="h-32 font-mono text-xs resize-none"
                placeholder={'site_id\ttarget_online\tactual_online\nLAR0001\t30/04/2026\t29/04/2026\nLAR0002\t02/05/2026\t'}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleParsePaste}
                disabled={isParsing || !pasteText.trim()}
              >
                {isParsing ? 'Memproses...' : 'Parse'}
              </Button>
              {pasteText && (
                <Button size="sm" variant="ghost" onClick={handleClearPaste}>
                  Clear
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="file" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Upload file <code className="text-foreground">.csv</code>,{' '}
              <code className="text-foreground">.xlsx</code>, atau{' '}
              <code className="text-foreground">.xls</code>. Header wajib:{' '}
              <code className="text-foreground">site_id</code> +{' '}
              <code className="text-foreground">target_online</code>. Optional:{' '}
              <code className="text-foreground">actual_online</code>.
            </p>
            <div className="flex items-center gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
                className="text-sm"
                disabled={isParsing}
              />
              {fileName && (
                <Badge variant="secondary" className="gap-1 shrink-0">
                  <FileSpreadsheet className="h-3 w-3" />
                  {fileName}
                </Badge>
              )}
            </div>
            {isParsing && (
              <p className="text-xs text-muted-foreground">Memproses file...</p>
            )}
          </TabsContent>
        </Tabs>

        {parseError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{parseError}</AlertDescription>
          </Alert>
        )}

        {parsed && (
          <div className="space-y-3 border-t pt-3">
            {/* Baseline date picker */}
            <div className="rounded-md border bg-muted/20 p-3 space-y-1.5">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="space-y-1 flex-1 min-w-[180px]">
                  <label
                    htmlFor="baseline-date"
                    className="text-xs font-medium text-foreground"
                  >
                    Tanggal Mulai (WM) <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="baseline-date"
                    type="date"
                    value={baselineDate}
                    onChange={(e) => setBaselineDate(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5 pt-4">
                  <div>
                    Tanggal selesai (auto):{' '}
                    <span className="font-medium text-foreground">
                      {effectiveEnd ? formatLong(effectiveEnd) : '-'}
                    </span>
                  </div>
                  <div className="opacity-70">
                    = max(target_online) dari data upload
                  </div>
                </div>
              </div>
              {!baselineDate && (
                <p className="text-xs text-destructive">
                  Pilih tanggal mulai WM dulu sebelum Confirm.
                </p>
              )}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-md bg-muted/30 p-2">
                <div className="text-2xl font-bold">{parsed.validRows.length}</div>
                <div className="text-xs text-muted-foreground">Total valid</div>
              </div>
              <div className="rounded-md bg-blue-500/10 p-2">
                <div className="text-2xl font-bold text-blue-500">
                  {crossCheck.outstanding}
                </div>
                <div className="text-xs text-muted-foreground">
                  Outstanding
                </div>
              </div>
              <div className="rounded-md bg-emerald-500/10 p-2">
                <div className="text-2xl font-bold text-emerald-500">
                  {crossCheck.manualActual}
                </div>
                <div className="text-xs text-muted-foreground">
                  Online (actual diisi)
                </div>
              </div>
              <div className="rounded-md bg-green-500/10 p-2">
                <div className="text-2xl font-bold text-green-500">
                  {crossCheck.autoClose}
                </div>
                <div className="text-xs text-muted-foreground">
                  Auto-close (tidak di TT)
                </div>
              </div>
            </div>

            {/* Errors / duplicates info */}
            {(parsed.errorRows.length > 0 || parsed.duplicates > 0) && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {parsed.errorRows.length > 0 && (
                    <div>{parsed.errorRows.length} baris error (di-skip).</div>
                  )}
                  {parsed.duplicates > 0 && (
                    <div>
                      {parsed.duplicates} site_id duplikat (di-dedup, ambil
                      first).
                    </div>
                  )}
                  {parsed.errorRows.length > 0 && (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer">
                        Lihat detail error
                      </summary>
                      <ul className="mt-1 space-y-0.5 ml-4 list-disc">
                        {parsed.errorRows.slice(0, 10).map((e) => (
                          <li key={e.rowIndex}>
                            Baris {e.rowIndex}: {e.reason}
                          </li>
                        ))}
                        {parsed.errorRows.length > 10 && (
                          <li>… ({parsed.errorRows.length - 10} lagi)</li>
                        )}
                      </ul>
                    </details>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Sample preview */}
            {sampleRows.length > 0 && (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site ID</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Actual</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sampleRows.map((r) => {
                      const inTT = openSiteSet.has(r.site_id);
                      let badge;
                      if (r.actual_online) {
                        badge = (
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20">
                            Online (actual)
                          </Badge>
                        );
                      } else if (inTT) {
                        badge = <Badge variant="secondary">Outstanding</Badge>;
                      } else {
                        badge = (
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/30 hover:bg-green-500/20">
                            Auto-close
                          </Badge>
                        );
                      }
                      return (
                        <TableRow key={r.site_id}>
                          <TableCell className="font-mono text-xs">
                            {r.site_id}
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.target_online}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.actual_online ?? '-'}
                          </TableCell>
                          <TableCell>{badge}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {parsed.validRows.length > 5 && (
                  <div className="text-xs text-muted-foreground p-2 text-center bg-muted/20">
                    … {parsed.validRows.length - 5} baris lagi
                  </div>
                )}
              </div>
            )}

            {/* Replace warning */}
            {currentBaseline && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Baseline aktif akan diganti</AlertTitle>
                <AlertDescription className="text-xs mt-1 space-y-0.5">
                  <div>Label: {currentBaseline.label}</div>
                  <div>Total target: {currentBaseline.total_target} TT</div>
                  <div className="font-medium mt-1">
                    Progress yang sudah tercatat akan hilang.
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Batal
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              isPending ||
              !parsed ||
              parsed.validRows.length === 0 ||
              !baselineDate
            }
          >
            {isPending
              ? 'Memproses...'
              : parsed
                ? `Confirm & Snapshot (${parsed.validRows.length})`
                : 'Confirm & Snapshot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
