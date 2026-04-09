import { POTable } from '@/components/noc/POTable';

export default function NocPO() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">PO Management</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Kelola daftar PO (Field Operation Officer) beserta provinsi coverage.
        </p>
      </div>
      <POTable />
    </div>
  );
}
