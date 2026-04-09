import { useTTRecords } from '@/lib/noc/hooks/useTTRecords';
import { KpiCards } from '@/components/noc/KpiCards';
import { AreaCards } from '@/components/noc/AreaCards';
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
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <p className="text-4xl mb-4">📡</p>
        <p className="text-lg font-medium">Belum ada data</p>
        <p className="text-sm mt-1">Paste TSV dari Google Sheet di atas untuk memulai.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <KpiCards data={records} />
      <AreaCards data={records} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProvinsiChart data={records} />
        <AgingChart data={records} />
      </div>

      <ProblemChart data={records} />
    </div>
  );
}
