import { cn } from '@/lib/utils';
import type { DatasetRow, UbiquEdit, UbiquField } from '../lib/types';
import { CAPTURE_TOP_N } from '../lib/types';
import {
  findEdit,
  effPO,
  effProgress,
  effKendala,
  effMrqNumber,
  effResi,
  effEta,
  effStatusPengiriman,
} from '../lib/queries';
import { EditableCell } from './EditableCell';

export interface EditingCell {
  ticketId: string;
  field: UbiquField;
}

interface ResultTableProps {
  rows: DatasetRow[]; // NON-HTB, sorted dur_days desc
  edits: UbiquEdit[];
  editingCell: EditingCell | null;
  setEditingCell: (c: EditingCell | null) => void;
  onSave: (ticketId: string, field: UbiquField, value: string) => void;
  onReset: (ticketId: string, field: UbiquField) => void;
}

export function ResultTable({
  rows,
  edits,
  editingCell,
  setEditingCell,
  onSave,
  onReset,
}: ResultTableProps) {
  const isEditing = (ticketId: string, field: UbiquField) =>
    editingCell?.ticketId === ticketId && editingCell.field === field;

  return (
    <div className="hidden lg:block border rounded-md overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-yellow-400 text-black">
          <tr>
            <th className="px-2 py-2 w-12 text-center">No</th>
            <th className="px-2 py-2 w-44 text-left">No Tiket</th>
            <th className="px-2 py-2 w-24 text-left">Site ID</th>
            <th className="px-2 py-2 text-left">Nama Lokasi</th>
            <th className="px-2 py-2 w-32 text-left">Provinsi</th>
            <th className="px-2 py-2 w-16 text-center">Umur (hari)</th>
            <th className="px-2 py-2 w-40 text-left">Trouble Category</th>
            <th className="px-2 py-2 w-32 text-left">PO</th>
            <th className="px-2 py-2 text-left">Problem</th>
            <th className="px-2 py-2 text-left">Progress</th>
            <th className="px-2 py-2 w-32 text-left">MRQ Number</th>
            <th className="px-2 py-2 w-32 text-left">RESI</th>
            <th className="px-2 py-2 w-36 text-left">ETA</th>
            <th className="px-2 py-2 w-32 text-left">Status Pengiriman</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const edit = findEdit(edits, row.ticket_id);
            const isTopN = idx < CAPTURE_TOP_N;
            return (
              <tr
                key={row.ticket_id}
                className={cn(
                  'border-t hover:bg-accent/30',
                  isTopN && 'bg-yellow-400/[0.06]',
                )}
              >
                <td className="px-2 py-2 text-center align-top">
                  <div className="flex flex-col items-center gap-1">
                    <span>{idx + 1}</span>
                    {isTopN && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 font-semibold whitespace-nowrap"
                        title="Masuk capture PNG (top 10)"
                      >
                        Top {CAPTURE_TOP_N}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2 font-mono text-[11px] align-top break-all">
                  {row.ticket_number || '-'}
                </td>
                <td className="px-2 py-2 font-mono text-xs align-top whitespace-nowrap">
                  {row.site_id || '-'}
                </td>
                <td className="px-2 py-2 align-top">{row.site_name || '-'}</td>
                <td className="px-2 py-2 align-top">{row.province || '-'}</td>
                <td className="px-2 py-2 text-center font-semibold align-top">
                  {row.dur_days}
                </td>
                <td className="px-2 py-2 align-top text-xs">
                  {row.trouble_category || '-'}
                </td>

                <EditableCell
                  value={effPO(row, edit)}
                  isEdited={edit?.is_po_edited ?? false}
                  isEditing={isEditing(row.ticket_id, 'po')}
                  placeholder="(isi PO)"
                  onEditStart={() =>
                    setEditingCell({ ticketId: row.ticket_id, field: 'po' })
                  }
                  onSave={(v) => onSave(row.ticket_id, 'po', v)}
                  onCancel={() => setEditingCell(null)}
                  onReset={() => onReset(row.ticket_id, 'po')}
                />
                <EditableCell
                  value={effKendala(edit)}
                  isEdited={edit?.is_kendala_edited ?? false}
                  isEditing={isEditing(row.ticket_id, 'kendala')}
                  placeholder="(isi problem)"
                  onEditStart={() =>
                    setEditingCell({ ticketId: row.ticket_id, field: 'kendala' })
                  }
                  onSave={(v) => onSave(row.ticket_id, 'kendala', v)}
                  onCancel={() => setEditingCell(null)}
                  onReset={() => onReset(row.ticket_id, 'kendala')}
                />
                <EditableCell
                  value={effProgress(edit)}
                  isEdited={edit?.is_progress_edited ?? false}
                  isEditing={isEditing(row.ticket_id, 'progress')}
                  placeholder="(isi progress)"
                  onEditStart={() =>
                    setEditingCell({ ticketId: row.ticket_id, field: 'progress' })
                  }
                  onSave={(v) => onSave(row.ticket_id, 'progress', v)}
                  onCancel={() => setEditingCell(null)}
                  onReset={() => onReset(row.ticket_id, 'progress')}
                />
                <EditableCell
                  value={effMrqNumber(edit)}
                  isEdited={edit?.is_mrq_number_edited ?? false}
                  isEditing={isEditing(row.ticket_id, 'mrq_number')}
                  placeholder="(isi MRQ)"
                  onEditStart={() =>
                    setEditingCell({
                      ticketId: row.ticket_id,
                      field: 'mrq_number',
                    })
                  }
                  onSave={(v) => onSave(row.ticket_id, 'mrq_number', v)}
                  onCancel={() => setEditingCell(null)}
                  onReset={() => onReset(row.ticket_id, 'mrq_number')}
                />
                <EditableCell
                  value={effResi(edit)}
                  isEdited={edit?.is_resi_edited ?? false}
                  isEditing={isEditing(row.ticket_id, 'resi')}
                  placeholder="(isi RESI)"
                  onEditStart={() =>
                    setEditingCell({ ticketId: row.ticket_id, field: 'resi' })
                  }
                  onSave={(v) => onSave(row.ticket_id, 'resi', v)}
                  onCancel={() => setEditingCell(null)}
                  onReset={() => onReset(row.ticket_id, 'resi')}
                />
                <EditableCell
                  value={effEta(edit)}
                  isEdited={edit?.is_eta_edited ?? false}
                  isEditing={isEditing(row.ticket_id, 'eta')}
                  placeholder="(isi ETA)"
                  onEditStart={() =>
                    setEditingCell({ ticketId: row.ticket_id, field: 'eta' })
                  }
                  onSave={(v) => onSave(row.ticket_id, 'eta', v)}
                  onCancel={() => setEditingCell(null)}
                  onReset={() => onReset(row.ticket_id, 'eta')}
                />
                <EditableCell
                  value={effStatusPengiriman(edit)}
                  isEdited={edit?.is_status_pengiriman_edited ?? false}
                  isEditing={isEditing(row.ticket_id, 'status_pengiriman')}
                  placeholder="(isi status)"
                  onEditStart={() =>
                    setEditingCell({
                      ticketId: row.ticket_id,
                      field: 'status_pengiriman',
                    })
                  }
                  onSave={(v) => onSave(row.ticket_id, 'status_pengiriman', v)}
                  onCancel={() => setEditingCell(null)}
                  onReset={() => onReset(row.ticket_id, 'status_pengiriman')}
                />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
