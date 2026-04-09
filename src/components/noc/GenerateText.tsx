import { useMemo, useState } from 'react';
import { Copy, Check, Download } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { getPO } from '@/lib/noc/classifiers';
import type { TTRecordDB, PO } from '@/lib/noc/types';

interface GenerateTextProps {
  data: TTRecordDB[];
  poList: PO[];
}

function buildOutput(data: TTRecordDB[], poList: PO[]): string {
  const openOnly = data
    .filter((d) => d.status === 'OPEN')
    .sort((a, b) => b.down_time - a.down_time);

  if (openOnly.length === 0) return '';

  // down_time sudah dalam hari — group langsung
  const byDays: Record<number, TTRecordDB[]> = {};
  for (const d of openOnly) {
    const days = d.down_time;
    if (!byDays[days]) byDays[days] = [];
    byDays[days].push(d);
  }

  const sortedDays = Object.keys(byDays)
    .map(Number)
    .sort((a, b) => b - a);

  const today = format(new Date(), 'dd MMMM yyyy');
  let no = 1;
  const lines: string[] = [];
  lines.push(`Berikut TT Prioritas, tanggal ${today}:`);
  lines.push('');

  for (const days of sortedDays) {
    lines.push(`Aging ${days} Hari`);
    lines.push('=========================');
    for (const d of byDays[days]) {
      lines.push(`${no}. ${d.ticket_id} - ${d.site_name} ❌`);
      const po = getPO(d.provinsi ?? '', d.kabupaten ?? '', poList);
      const poName = po?.name ?? 'Unknown';
      lines.push(`> *PO*: ${poName} | ${d.provinsi ?? '—'}`);
      no++;
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

export function GenerateText({ data, poList }: GenerateTextProps) {
  const [copied, setCopied] = useState(false);

  const output = useMemo(() => buildOutput(data, poList), [data, poList]);

  const openCount = data.filter((d) => d.status === 'OPEN').length;
  const today = format(new Date(), 'dd/MM/yyyy');

  async function handleCopy() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    if (!output) return;
    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `noc-prioritas-${today.replace(/\//g, '-')}.txt`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Info + Actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{openCount}</span> TT Open ·
          tanggal <span className="font-medium text-foreground">{today}</span>
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownload}
            disabled={!output}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" />
            Download .txt
          </Button>
          <Button
            size="sm"
            onClick={handleCopy}
            disabled={!output}
            className="gap-1.5"
          >
            {copied ? (
              <><Check className="h-4 w-4" /> Tersalin!</>
            ) : (
              <><Copy className="h-4 w-4" /> Copy ke Clipboard</>
            )}
          </Button>
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-lg border border-border bg-muted/20 p-4 min-h-[300px]">
        {output ? (
          <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap text-foreground">
            {output}
          </pre>
        ) : (
          <p className="text-muted-foreground text-sm">Tidak ada TT Open untuk ditampilkan.</p>
        )}
      </div>
    </div>
  );
}
