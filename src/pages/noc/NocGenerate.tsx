import { useTTRecords } from '@/lib/noc/hooks/useTTRecords';
import { usePOList } from '@/lib/noc/hooks/usePOList';
import { GenerateText } from '@/components/noc/GenerateText';

export default function NocGenerate() {
  const { data: records = [], isLoading } = useTTRecords();
  const { data: poList = [] } = usePOList();

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
        <p className="text-4xl mb-4">💬</p>
        <p className="text-lg font-medium">Belum ada data</p>
        <p className="text-sm mt-1">Paste TSV dari Google Sheet di atas untuk memulai.</p>
      </div>
    );
  }

  return <GenerateText data={records} poList={poList} />;
}
