import { Radio } from 'lucide-react';
import { useTTRecords } from '@/lib/noc/hooks/useTTRecords';
import { KpiCards } from '@/components/noc/KpiCards';
import { AreaCards } from '@/components/noc/AreaCards';
import { OpenTicketMindmap } from '@/components/noc/OpenTicketMindmap';
import { ClosedTicketMindmap } from '@/components/noc/ClosedTicketMindmap';
import { AreaTicketMindmap } from '@/components/noc/AreaTicketMindmap';
import { OpenByKategoriMindmap } from '@/components/noc/OpenByKategoriMindmap';
import { RadialOpenMindmap } from '@/components/noc/RadialOpenMindmap';
import { ProvinsiChart } from '@/components/noc/ProvinsiChart';
import { AgingChart } from '@/components/noc/AgingChart';
import { ProblemChart } from '@/components/noc/ProblemChart';

export default function NocDashboard() {
  const { data: records = [], isLoading } = useTTRecords();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
        Memuat data dari database...
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
          <Radio className="h-7 w-7" />
        </span>
        <p className="text-lg font-semibold">Belum ada data</p>
        <p className="text-sm text-muted-foreground mt-1">
          Paste TSV dari Google Sheet di atas untuk memulai.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <KpiCards data={records} />
      <AreaCards data={records} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <OpenTicketMindmap data={records} />
        <ClosedTicketMindmap data={records} />
      </div>

      <AreaTicketMindmap data={records} />

      <OpenByKategoriMindmap data={records} />

      <RadialOpenMindmap data={records} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProvinsiChart data={records} />
        <AgingChart data={records} />
      </div>

      <ProblemChart data={records} />
    </div>
  );
}
