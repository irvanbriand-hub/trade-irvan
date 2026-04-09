import { useState } from 'react';
import { ChevronDown, ChevronUp, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNOC } from '@/lib/noc/hooks/useNOC';
import { usePOList } from '@/lib/noc/hooks/usePOList';

export function TsvUploader() {
  const { loadTSV, clearData, rawData, isLoading, mergeResult } = useNOC();
  const { data: poList = [] } = usePOList();

  const [tsv, setTsv] = useState('');
  const [date, setDate] = useState(() => new Date().toLocaleDateString('id-ID'));
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState('');

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
            <p>Diupdate: <span className="font-medium text-foreground">{mergeResult.updated}</span> TT</p>
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

          <div className="flex gap-2">
            <Button size="sm" onClick={handleParse} disabled={isLoading} className="gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              {isLoading ? 'Menyimpan...' : 'Parse & Load'}
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
