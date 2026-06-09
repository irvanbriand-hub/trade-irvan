import type { DatasetRow, UbiquEdit } from '../lib/types';
import { findEdit, effProgressTeknisi } from '../lib/queries';

interface HtbTableProps {
  rows: DatasetRow[]; // HTB (sudah termasuk override), sorted dur_days desc
  edits: UbiquEdit[];
  overrideIds?: string[]; // ticket_id yang masuk HTB karena override (tampil chip)
}

/**
 * Tabel HTB read-only. Field Aset (Progress Spare, No MRQ, RESI, MOD, MOS)
 * TIDAK ditampilkan (tidak pernah disimpan — diisi offline di Excel).
 * Progress Teknisi read-only di sini; di-update via "Upload Excel Terisi".
 */
export function HtbTable({ rows, edits, overrideIds = [] }: HtbTableProps) {
  const overrideSet = new Set(overrideIds);
  if (rows.length === 0) {
    return (
      <div className="bg-muted/30 border border-dashed border-border rounded-lg p-8 text-center">
        <p className="text-sm font-medium">Belum ada tiket HTB.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Upload tiket harian dulu. Tiket dengan trouble category mengandung
          "Converter"/"HTB" akan muncul di sini.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {rows.length} tiket HTB. Download Excel → kirim ke OM (Progress Teknisi) &
        Aset (Spare/MRQ/RESI/MOD/MOS) → Upload Excel Terisi untuk simpan Progress
        Teknisi. Kolom Aset diisi di Excel, tidak disimpan di sini.
      </p>
      <div className="border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-yellow-400 text-black">
            <tr>
              <th className="px-2 py-2 w-12 text-center">No</th>
              <th className="px-2 py-2 w-44 text-left">No Tiket</th>
              <th className="px-2 py-2 w-24 text-left">Site ID</th>
              <th className="px-2 py-2 text-left">Nama Lokasi</th>
              <th className="px-2 py-2 w-32 text-left">Provinsi</th>
              <th className="px-2 py-2 w-16 text-center">Umur (hari)</th>
              <th className="px-2 py-2 text-left">Progress Teknisi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const edit = findEdit(edits, row.ticket_id);
              const pt = effProgressTeknisi(edit);
              return (
                <tr key={row.ticket_id} className="border-t hover:bg-accent/30">
                  <td className="px-2 py-2 text-center align-top">{idx + 1}</td>
                  <td className="px-2 py-2 font-mono text-[11px] align-top break-all">
                    {row.ticket_number || '-'}
                    {overrideSet.has(row.ticket_id) && (
                      <span
                        className="ml-1 text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-400 font-semibold align-middle"
                        title="Dipaksa HTB via Override"
                      >
                        override
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 font-mono text-xs align-top whitespace-nowrap">
                    {row.site_id || '-'}
                  </td>
                  <td className="px-2 py-2 align-top">{row.site_name || '-'}</td>
                  <td className="px-2 py-2 align-top">{row.province || '-'}</td>
                  <td className="px-2 py-2 text-center font-semibold align-top">
                    {row.dur_days}
                  </td>
                  <td className="px-2 py-2 align-top">
                    {pt ? (
                      <span className="whitespace-pre-wrap">{pt}</span>
                    ) : (
                      <span className="text-muted-foreground italic">
                        (belum diisi)
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
