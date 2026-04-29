import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Camera, Pencil, RotateCcw, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  getRTGSAnnotations,
  getRTGSTickets,
  upsertAnnotation,
  resetAnnotationField,
  getEffectiveProblem,
  getEffectiveAction,
  getEffectiveKendala,
  getEffectivePlanTargetOnline,
  type RTGSAnnotation,
  type RTGSField,
} from '@/lib/noc/rtgsQueries';
import type { TTRecordDB } from '@/lib/noc/types';
import { RTGSCaptureView } from '@/components/noc/RTGSCaptureView';
import { useNOC } from '@/lib/noc/hooks/useNOC';

// ─── Date helpers (WIB) ──────────────────────────────────────────────────────

function getWIBNow(): Date {
  // Geser epoch ke WIB lalu pakai getter UTC* supaya tidak terpengaruh TZ host.
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

function formatWIBDate(): string {
  const d = getWIBNow();
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = d.getUTCFullYear();
  return `${dd}/${mm}/${yy}`;
}

function formatWIBTime(): string {
  const d = getWIBNow();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatTargetDateInline(raw: string | null | undefined): string {
  if (!raw) return '-';
  const trimmed = raw.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${d}/${m}/${y}`;
  }
  return trimmed;
}

function pickTargetOnline(record: TTRecordDB): string {
  if (record.is_manually_edited && record.target_online_edited) {
    return record.target_online_edited;
  }
  return record.target_online_original ?? '';
}

// ─── Editable Cell ───────────────────────────────────────────────────────────

interface EditableCellProps {
  value: string;
  isEdited: boolean;
  isEditing: boolean;
  onEditStart: () => void;
  onSave: (val: string) => void;
  onCancel: () => void;
  onReset: () => void;
}

function EditableCell({
  value,
  isEdited,
  isEditing,
  onEditStart,
  onSave,
  onCancel,
  onReset,
}: EditableCellProps) {
  const [editValue, setEditValue] = useState(value);

  useEffect(() => {
    if (isEditing) setEditValue(value);
  }, [isEditing, value]);

  if (isEditing) {
    return (
      <td
        className="px-2 py-2 align-top"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-1">
          <textarea
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="flex-1 min-h-[60px] text-sm p-1 border rounded
                       bg-background"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSave(editValue);
              }
              if (e.key === 'Escape') onCancel();
            }}
          />
          <div className="flex flex-col gap-1">
            <button
              onClick={() => onSave(editValue)}
              className="p-1 hover:bg-green-500/20 rounded"
              title="Save (Enter)"
            >
              <Check className="h-3.5 w-3.5 text-green-600" />
            </button>
            <button
              onClick={onCancel}
              className="p-1 hover:bg-red-500/20 rounded"
              title="Cancel (Esc)"
            >
              <X className="h-3.5 w-3.5 text-red-600" />
            </button>
          </div>
        </div>
      </td>
    );
  }

  return (
    <td
      className="px-2 py-2 cursor-pointer relative align-top group/cell"
      onClick={onEditStart}
    >
      {isEdited && (
        <div
          className="absolute top-1 left-0 w-1 h-[calc(100%-8px)]
                     bg-amber-400 rounded-r"
          title="Sudah diedit manual"
        />
      )}
      <div className="flex items-start gap-2 pl-1">
        <span className={cn('flex-1 whitespace-pre-wrap', isEdited && 'font-medium')}>
          {value}
        </span>
        <div
          className="opacity-0 group-hover/cell:opacity-100 transition-opacity
                     flex gap-1 flex-shrink-0 mt-0.5"
        >
          {isEdited && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
              className="p-0.5 rounded hover:bg-destructive/20"
              title="Reset ke default"
            >
              <RotateCcw className="h-3 w-3 text-amber-500" />
            </button>
          )}
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </div>
      </div>
    </td>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function NOCRtgs() {
  const { toast } = useToast();
  const { getSiteNote } = useNOC();
  const [records, setRecords] = useState<TTRecordDB[]>([]);
  const [annotations, setAnnotations] = useState<RTGSAnnotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<{
    ticketId: string;
    field: RTGSField;
  } | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [tts, anns] = await Promise.all([
        getRTGSTickets(5),
        getRTGSAnnotations(),
      ]);
      setRecords(tts);
      setAnnotations(anns);
    } catch (err) {
      toast({
        title: 'Gagal load data',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSave(ticketId: string, field: RTGSField, value: string) {
    try {
      await upsertAnnotation(ticketId, field, value);
      await loadData();
      setEditingCell(null);
    } catch (err) {
      toast({
        title: 'Gagal simpan',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  }

  async function handleReset(ticketId: string, field: RTGSField) {
    try {
      await resetAnnotationField(ticketId, field);
      await loadData();
    } catch (err) {
      toast({
        title: 'Gagal reset',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  }

  async function handleCapture() {
    const el = captureRef.current;
    if (!el) return;

    setIsCapturing(true);
    el.style.left = '0';
    el.style.position = 'fixed';
    el.style.zIndex = '-1';

    try {
      const canvas = await html2canvas(el, {
        backgroundColor: '#ffffff',
        scale: 3,
        useCORS: true,
        allowTaint: true,
        width: el.scrollWidth,
        height: el.scrollHeight,
        windowWidth: 1400,
        logging: false,
        imageTimeout: 0,
      });

      const d = getWIBNow();
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = d.getUTCFullYear();
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mi = String(d.getUTCMinutes()).padStart(2, '0');

      const filename = `rtgs-mahaga-${yyyy}-${mm}-${dd}-${hh}${mi}.png`;
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
    } catch (err) {
      toast({
        title: 'Gagal capture',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      el.style.left = '-9999px';
      el.style.position = 'absolute';
      el.style.zIndex = 'auto';
      setIsCapturing(false);
    }
  }

  const dateLabel = formatWIBDate();
  const timeLabel = formatWIBTime();

  const isPreviewRow = (r: TTRecordDB) => r.down_time < 7;
  const captureCount = records.filter((r) => !isPreviewRow(r)).length;
  const previewCount = records.filter((r) => isPreviewRow(r)).length;

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto px-4">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h2 className="text-lg font-semibold">Tiket RTGS Mahaga</h2>
          <p className="text-xs text-muted-foreground">
            TT open dengan aging ≥ 5 hari
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="text-xs text-muted-foreground mr-2 flex gap-3">
            <span>
              Akan capture:{' '}
              <strong className="text-foreground">{captureCount} TT</strong>
            </span>
            <span className="text-blue-500 dark:text-blue-400">
              Preview: <strong>{previewCount} TT</strong>
            </span>
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={handleCapture}
            disabled={isCapturing || captureCount === 0}
          >
            <Camera className="h-3.5 w-3.5" />
            {isCapturing ? 'Capturing...' : 'Capture PNG'}
          </Button>
        </div>
      </div>

      {/* Info bar */}
      <div
        className="bg-amber-50 dark:bg-amber-950/20
                   border border-amber-200 dark:border-amber-900
                   rounded-md p-3 text-xs"
      >
        💡 Klik kolom <strong>Problem Hasil Analisa</strong>,{' '}
        <strong>Action</strong>, <strong>Kendala</strong>, atau{' '}
        <strong>Plan Target Online</strong> untuk edit manual. Row dengan badge{' '}
        <strong className="text-blue-500 dark:text-blue-400">Preview</strong>{' '}
        (aging 5-6) belum masuk capture PNG, tapi annotation-nya akan muncul
        saat aging naik ke 7+. Bisa di-prep dari sekarang.
      </div>

      {/* Tabel */}
      {loading ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
          Memuat data...
        </div>
      ) : records.length === 0 ? (
        <div className="bg-muted/30 border border-dashed border-border rounded-lg p-8 text-center">
          <p className="text-sm font-medium">
            Tidak ada TT dengan aging ≥ 5 hari.
          </p>
        </div>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-yellow-400 text-black">
              <tr>
                <th className="px-2 py-2 w-12 text-center">No</th>
                <th className="px-2 py-2 w-36 text-left">SiteID</th>
                <th className="px-2 py-2 text-left">Nama Lokasi</th>
                <th className="px-2 py-2 w-40 text-left">Provinsi</th>
                <th className="px-2 py-2 w-24 text-center">Umur Tiket (hari)</th>
                <th className="px-2 py-2 text-left">Problem Hasil Analisa</th>
                <th className="px-2 py-2 text-left">Action</th>
                <th className="px-2 py-2 text-left">Kendala</th>
                <th className="px-2 py-2 w-28 text-center">Plan Target Online</th>
                <th className="px-2 py-2 w-28 text-center">Update Target Online</th>
                <th className="px-2 py-2 w-56 text-left">Note Recap (referensi)</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record, idx) => {
                const annotation =
                  annotations.find((a) => a.ticket_id === record.ticket_id) ??
                  null;
                const problem = getEffectiveProblem(record, annotation);
                const action = getEffectiveAction(annotation);
                const isProblemEdited = annotation?.is_problem_edited ?? false;
                const isActionEdited = annotation?.is_action_edited ?? false;
                const isKendalaEdited = annotation?.is_kendala_edited ?? false;
                const isPlanTargetEdited =
                  annotation?.is_plan_target_online_edited ?? false;
                const isProblemEditing =
                  editingCell?.ticketId === record.ticket_id &&
                  editingCell.field === 'problem_analisa';
                const isActionEditing =
                  editingCell?.ticketId === record.ticket_id &&
                  editingCell.field === 'action';
                const isKendalaEditing =
                  editingCell?.ticketId === record.ticket_id &&
                  editingCell.field === 'kendala';
                const isPlanTargetEditing =
                  editingCell?.ticketId === record.ticket_id &&
                  editingCell.field === 'plan_target_online';

                const isPreview = isPreviewRow(record);

                return (
                  <tr
                    key={record.ticket_id}
                    className={cn(
                      'border-t hover:bg-accent/30',
                      isPreview && 'bg-muted/30',
                    )}
                  >
                    <td className="px-2 py-2 text-center align-top">
                      <div className="flex flex-col items-center gap-1">
                        <span>{idx + 1}</span>
                        {isPreview && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded
                                       bg-blue-500/15 text-blue-500
                                       dark:text-blue-400
                                       font-medium whitespace-nowrap"
                            title="Akan masuk capture saat aging ≥ 7"
                          >
                            Preview
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs align-top">
                      {record.site_id ?? '-'}
                    </td>
                    <td className="px-2 py-2 align-top">{record.site_name}</td>
                    <td className="px-2 py-2 align-top">
                      {record.provinsi ?? '-'}
                    </td>
                    <td className="px-2 py-2 text-center font-semibold align-top">
                      {record.down_time}
                    </td>

                    <EditableCell
                      value={problem}
                      isEdited={isProblemEdited}
                      isEditing={isProblemEditing}
                      onEditStart={() =>
                        setEditingCell({
                          ticketId: record.ticket_id,
                          field: 'problem_analisa',
                        })
                      }
                      onSave={(v) =>
                        handleSave(record.ticket_id, 'problem_analisa', v)
                      }
                      onCancel={() => setEditingCell(null)}
                      onReset={() =>
                        handleReset(record.ticket_id, 'problem_analisa')
                      }
                    />

                    <EditableCell
                      value={action}
                      isEdited={isActionEdited}
                      isEditing={isActionEditing}
                      onEditStart={() =>
                        setEditingCell({
                          ticketId: record.ticket_id,
                          field: 'action',
                        })
                      }
                      onSave={(v) => handleSave(record.ticket_id, 'action', v)}
                      onCancel={() => setEditingCell(null)}
                      onReset={() => handleReset(record.ticket_id, 'action')}
                    />

                    <EditableCell
                      value={getEffectiveKendala(annotation)}
                      isEdited={isKendalaEdited}
                      isEditing={isKendalaEditing}
                      onEditStart={() =>
                        setEditingCell({
                          ticketId: record.ticket_id,
                          field: 'kendala',
                        })
                      }
                      onSave={(v) => handleSave(record.ticket_id, 'kendala', v)}
                      onCancel={() => setEditingCell(null)}
                      onReset={() => handleReset(record.ticket_id, 'kendala')}
                    />

                    <EditableCell
                      value={getEffectivePlanTargetOnline(annotation)}
                      isEdited={isPlanTargetEdited}
                      isEditing={isPlanTargetEditing}
                      onEditStart={() =>
                        setEditingCell({
                          ticketId: record.ticket_id,
                          field: 'plan_target_online',
                        })
                      }
                      onSave={(v) =>
                        handleSave(record.ticket_id, 'plan_target_online', v)
                      }
                      onCancel={() => setEditingCell(null)}
                      onReset={() =>
                        handleReset(record.ticket_id, 'plan_target_online')
                      }
                    />

                    <td className="px-2 py-2 text-center align-top">
                      {formatTargetDateInline(pickTargetOnline(record))}
                    </td>

                    <td className="px-2 py-2 align-top text-xs text-muted-foreground">
                      {(() => {
                        const note = record.site_id
                          ? getSiteNote(record.site_id)?.note?.trim()
                          : '';
                        return note
                          ? <span className="whitespace-pre-wrap text-foreground/80">{note}</span>
                          : <span className="opacity-50">-</span>;
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Hidden capture target — di-pop dari layar saat handleCapture dijalankan */}
      <div
        ref={captureRef}
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 0,
          backgroundColor: '#ffffff',
        }}
      >
        <RTGSCaptureView
          records={records.filter((r) => r.down_time >= 7)}
          annotations={annotations}
          dateLabel={dateLabel}
          timeLabel={timeLabel}
        />
      </div>
    </div>
  );
}
