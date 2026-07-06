import { useEffect, useState } from 'react';
import { Pencil, RotateCcw, Check, X } from 'lucide-react';
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
import type { EditingCell } from './ResultTable';

interface FieldProps {
  label: string;
  value: string;
  isEdited: boolean;
  isEditing: boolean;
  placeholder?: string;
  onEditStart: () => void;
  onSave: (v: string) => void;
  onCancel: () => void;
  onReset: () => void;
}

function MobileField({
  label,
  value,
  isEdited,
  isEditing,
  placeholder,
  onEditStart,
  onSave,
  onCancel,
  onReset,
}: FieldProps) {
  const [val, setVal] = useState(value);
  useEffect(() => {
    if (isEditing) setVal(value);
  }, [isEditing, value]);

  return (
    <div className="px-3 py-2 border-t border-border/60">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isEdited && !isEditing && (
            <button
              onClick={onReset}
              className="p-1 rounded hover:bg-destructive/20"
              title="Reset"
            >
              <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
            </button>
          )}
          {!isEditing && (
            <button
              onClick={onEditStart}
              className="p-1 rounded hover:bg-accent"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>
      {isEditing ? (
        <div className="flex gap-1.5">
          <textarea
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="flex-1 min-h-[64px] text-sm p-2 border rounded bg-background"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSave(val);
              }
              if (e.key === 'Escape') onCancel();
            }}
          />
          <div className="flex flex-col gap-1">
            <button
              onClick={() => onSave(val)}
              className="p-1.5 hover:bg-green-500/20 rounded border border-border"
            >
              <Check className="h-4 w-4 text-green-600" />
            </button>
            <button
              onClick={onCancel}
              className="p-1.5 hover:bg-red-500/20 rounded border border-border"
            >
              <X className="h-4 w-4 text-red-600" />
            </button>
          </div>
        </div>
      ) : (
        <p
          onClick={onEditStart}
          className={cn(
            'whitespace-pre-wrap text-sm cursor-pointer break-words pl-2',
            isEdited && 'font-medium',
            !value && 'text-muted-foreground italic',
          )}
        >
          {value || placeholder || '—'}
        </p>
      )}
    </div>
  );
}

interface MobileCardsProps {
  rows: DatasetRow[];
  edits: UbiquEdit[];
  editingCell: EditingCell | null;
  setEditingCell: (c: EditingCell | null) => void;
  onSave: (ticketId: string, field: UbiquField, value: string) => void;
  onReset: (ticketId: string, field: UbiquField) => void;
}

export function MobileCards({
  rows,
  edits,
  editingCell,
  setEditingCell,
  onSave,
  onReset,
}: MobileCardsProps) {
  const isEditing = (id: string, f: UbiquField) =>
    editingCell?.ticketId === id && editingCell.field === f;

  return (
    <div className="lg:hidden space-y-3">
      {rows.map((row, idx) => {
        const edit = findEdit(edits, row.ticket_id);
        const isTopN = idx < CAPTURE_TOP_N;
        const fields: {
          label: string;
          field: UbiquField;
          value: string;
          isEdited: boolean;
          placeholder?: string;
        }[] = [
          {
            label: 'PO',
            field: 'po',
            value: effPO(row, edit),
            isEdited: edit?.is_po_edited ?? false,
            placeholder: '(isi PO)',
          },
          {
            label: 'Problem',
            field: 'kendala',
            value: effKendala(edit),
            isEdited: edit?.is_kendala_edited ?? false,
            placeholder: '(isi problem)',
          },
          {
            label: 'Progress',
            field: 'progress',
            value: effProgress(edit),
            isEdited: edit?.is_progress_edited ?? false,
            placeholder: '(isi progress)',
          },
          {
            label: 'MRQ Number',
            field: 'mrq_number',
            value: effMrqNumber(edit),
            isEdited: edit?.is_mrq_number_edited ?? false,
            placeholder: '(isi MRQ)',
          },
          {
            label: 'RESI',
            field: 'resi',
            value: effResi(edit),
            isEdited: edit?.is_resi_edited ?? false,
            placeholder: '(isi RESI)',
          },
          {
            label: 'ETA',
            field: 'eta',
            value: effEta(edit),
            isEdited: edit?.is_eta_edited ?? false,
            placeholder: '(isi ETA)',
          },
          {
            label: 'Status Pengiriman',
            field: 'status_pengiriman',
            value: effStatusPengiriman(edit),
            isEdited: edit?.is_status_pengiriman_edited ?? false,
            placeholder: '(isi status)',
          },
        ];
        return (
          <div
            key={row.ticket_id}
            className={cn(
              'rounded-lg overflow-hidden bg-card border border-border',
              isTopN && 'ring-1 ring-yellow-400/60',
            )}
          >
            <div className="px-3 py-2.5 flex items-start gap-2">
              <span className="text-sm font-semibold w-6 h-6 flex items-center justify-center rounded bg-yellow-400 text-black flex-shrink-0">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[11px] text-muted-foreground break-all">
                    {row.ticket_number || row.ticket_id}
                  </p>
                  {isTopN && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 font-semibold flex-shrink-0">
                      Top {CAPTURE_TOP_N}
                    </span>
                  )}
                </div>
                <p className="font-medium text-sm leading-tight break-words">
                  {row.site_name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  <span>ID: {row.site_id || '-'}</span>
                  <span>·</span>
                  <span>{row.province || '-'}</span>
                  <span>·</span>
                  <span>
                    Umur:{' '}
                    <strong className="text-foreground">{row.dur_days}</strong> hari
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {row.trouble_category || '-'}
                </p>
              </div>
            </div>
            {fields.map((f) => (
              <MobileField
                key={f.field}
                label={f.label}
                value={f.value}
                isEdited={f.isEdited}
                isEditing={isEditing(row.ticket_id, f.field)}
                placeholder={f.placeholder}
                onEditStart={() =>
                  setEditingCell({ ticketId: row.ticket_id, field: f.field })
                }
                onSave={(v) => onSave(row.ticket_id, f.field, v)}
                onCancel={() => setEditingCell(null)}
                onReset={() => onReset(row.ticket_id, f.field)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
