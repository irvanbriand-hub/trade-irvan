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
import { updateTargetOnlineEdited, resetTargetOnlineEdited } from '@/lib/noc/queries';
import type { PO, TTRecordDB } from '@/lib/noc/types';

// Field yang bisa diedit di halaman RTGS. 'update_target_online' disimpan ke
// tt_records (bukan annotation); sisanya ke rtgs_annotations.
type EditField = RTGSField | 'update_target_online';
import { RTGSCaptureView } from '@/components/noc/RTGSCaptureView';
import { useNOC } from '@/lib/noc/hooks/useNOC';
import { usePOList } from '@/lib/noc/hooks/usePOList';
import { getPO } from '@/lib/noc/classifiers';

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

/** Nama PO penanggung jawab lokasi (by kabupaten→provinsi). '-' kalau tak ada. */
function resolvePOName(record: TTRecordDB, poList: PO[]): string {
  return (
    getPO(record.provinsi ?? '', record.kabupaten ?? '', poList)?.name ?? '-'
  );
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
  tdClassName?: string;
}

function EditableCell({
  value,
  isEdited,
  isEditing,
  onEditStart,
  onSave,
  onCancel,
  onReset,
  tdClassName,
}: EditableCellProps) {
  const [editValue, setEditValue] = useState(value);

  useEffect(() => {
    if (isEditing) setEditValue(value);
  }, [isEditing, value]);

  if (isEditing) {
    return (
      <td
        className={cn('px-2 py-2 align-top', tdClassName)}
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
      className={cn(
        'px-2 py-2 cursor-pointer relative align-top group/cell',
        tdClassName,
      )}
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

// ─── Mobile Editable Field ───────────────────────────────────────────────────

interface MobileEditableFieldProps {
  label: string;
  value: string;
  isEdited: boolean;
  isEditing: boolean;
  onEditStart: () => void;
  onSave: (val: string) => void;
  onCancel: () => void;
  onReset: () => void;
}

function MobileEditableField({
  label,
  value,
  isEdited,
  isEditing,
  onEditStart,
  onSave,
  onCancel,
  onReset,
}: MobileEditableFieldProps) {
  const [editValue, setEditValue] = useState(value);

  useEffect(() => {
    if (isEditing) setEditValue(value);
  }, [isEditing, value]);

  return (
    <div className="px-3 py-2.5 border-t border-border/60">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isEdited && !isEditing && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
              className="p-1 rounded hover:bg-destructive/20"
              title="Reset ke default"
            >
              <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
            </button>
          )}
          {!isEditing && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEditStart();
              }}
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
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="flex-1 min-h-[72px] text-sm p-2 border rounded bg-background"
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
              className="p-1.5 hover:bg-green-500/20 rounded border border-border"
              title="Save (Enter)"
            >
              <Check className="h-4 w-4 text-green-600" />
            </button>
            <button
              onClick={onCancel}
              className="p-1.5 hover:bg-red-500/20 rounded border border-border"
              title="Cancel (Esc)"
            >
              <X className="h-4 w-4 text-red-600" />
            </button>
          </div>
        </div>
      ) : (
        <div
          className="relative cursor-pointer rounded -mx-1 px-1 py-0.5 active:bg-accent/50"
          onClick={onEditStart}
        >
          {isEdited && (
            <div
              className="absolute top-1 left-0 w-1 h-[calc(100%-8px)] bg-amber-400 rounded-r"
              title="Sudah diedit manual"
            />
          )}
          <p
            className={cn(
              'whitespace-pre-wrap text-sm pl-2 break-words',
              isEdited && 'font-medium',
              !value && 'text-muted-foreground italic',
            )}
          >
            {value || '(kosong — tap untuk isi)'}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Mobile Ticket Card ──────────────────────────────────────────────────────

interface MobileTicketCardProps {
  record: TTRecordDB;
  annotation: RTGSAnnotation | null;
  poName: string;
  index: number;
  isPreview: boolean;
  isWillBeExternal: boolean;
  isExternal: boolean;
  noteRecap: string;
  editingCell: { ticketId: string; field: EditField } | null;
  setEditingCell: (cell: { ticketId: string; field: EditField } | null) => void;
  onSave: (ticketId: string, field: EditField, value: string) => Promise<void>;
  onReset: (ticketId: string, field: EditField) => Promise<void>;
}

function MobileTicketCard({
  record,
  annotation,
  poName,
  index,
  isPreview,
  isWillBeExternal,
  isExternal,
  noteRecap,
  editingCell,
  setEditingCell,
  onSave,
  onReset,
}: MobileTicketCardProps) {
  const problem = getEffectiveProblem(record, annotation);
  const action = getEffectiveAction(annotation);
  const kendala = getEffectiveKendala(annotation);
  const planTarget = getEffectivePlanTargetOnline(annotation, record);
  const updateTarget = formatTargetDateInline(pickTargetOnline(record));

  const isProblemEdited = annotation?.is_problem_edited ?? false;
  const isActionEdited = annotation?.is_action_edited ?? false;
  const isKendalaEdited = annotation?.is_kendala_edited ?? false;
  const isUpdateTargetEdited = !!(record.is_manually_edited && record.target_online_edited);

  const isEditingField = (field: EditField) =>
    editingCell?.ticketId === record.ticket_id && editingCell.field === field;

  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden bg-card',
        isExternal
          ? 'border-2 border-emerald-500'
          : 'border border-border',
        isPreview && 'bg-muted/30',
        isWillBeExternal && 'bg-orange-500/[0.08]',
        isExternal && 'bg-emerald-500/[0.05]',
      )}
    >
      {/* Header */}
      <div className="px-3 py-2.5 flex items-start gap-2">
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <span className="text-sm font-semibold w-6 h-6 flex items-center justify-center rounded bg-yellow-400 text-black">
            {index + 1}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] text-muted-foreground truncate">
                {record.site_id ?? '-'}
              </p>
              <p className="font-medium text-sm leading-tight break-words">
                {record.site_name}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              {isPreview && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-500 dark:text-blue-400 font-medium whitespace-nowrap"
                  title="Akan masuk capture saat aging ≥ 7"
                >
                  Preview
                </span>
              )}
              {isWillBeExternal && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-600 dark:text-orange-400 font-semibold whitespace-nowrap"
                  title="Besok aging naik ke > 10 → masuk report External"
                >
                  H-1 Ext
                </span>
              )}
              {isExternal && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap"
                  title="Akan masuk report External (umur diatas 10 hari)"
                >
                  Ext
                </span>
              )}
            </div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>{record.provinsi ?? '-'}</span>
            <span>·</span>
            <span>
              PO: <strong className="text-foreground">{poName}</strong>
            </span>
            <span>·</span>
            <span>
              Umur: <strong className="text-foreground">{record.down_time}</strong> hari
            </span>
          </div>
        </div>
      </div>

      {/* Editable fields */}
      <MobileEditableField
        label="Problem Hasil Analisa"
        value={problem}
        isEdited={isProblemEdited}
        isEditing={isEditingField('problem_analisa')}
        onEditStart={() =>
          setEditingCell({ ticketId: record.ticket_id, field: 'problem_analisa' })
        }
        onSave={(v) => onSave(record.ticket_id, 'problem_analisa', v)}
        onCancel={() => setEditingCell(null)}
        onReset={() => onReset(record.ticket_id, 'problem_analisa')}
      />
      <MobileEditableField
        label="Action"
        value={action}
        isEdited={isActionEdited}
        isEditing={isEditingField('action')}
        onEditStart={() =>
          setEditingCell({ ticketId: record.ticket_id, field: 'action' })
        }
        onSave={(v) => onSave(record.ticket_id, 'action', v)}
        onCancel={() => setEditingCell(null)}
        onReset={() => onReset(record.ticket_id, 'action')}
      />
      <MobileEditableField
        label="Kendala"
        value={kendala}
        isEdited={isKendalaEdited}
        isEditing={isEditingField('kendala')}
        onEditStart={() =>
          setEditingCell({ ticketId: record.ticket_id, field: 'kendala' })
        }
        onSave={(v) => onSave(record.ticket_id, 'kendala', v)}
        onCancel={() => setEditingCell(null)}
        onReset={() => onReset(record.ticket_id, 'kendala')}
      />
      <MobileEditableField
        label="Update Target Online"
        value={updateTarget}
        isEdited={isUpdateTargetEdited}
        isEditing={isEditingField('update_target_online')}
        onEditStart={() =>
          setEditingCell({ ticketId: record.ticket_id, field: 'update_target_online' })
        }
        onSave={(v) => onSave(record.ticket_id, 'update_target_online', v)}
        onCancel={() => setEditingCell(null)}
        onReset={() => onReset(record.ticket_id, 'update_target_online')}
      />

      {/* Read-only footer */}
      <div className="px-3 py-2 border-t border-border/60 bg-muted/20 text-[11px] space-y-0.5">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">Plan Target Online (fetch awal)</span>
          <span className="font-medium">{planTarget || '-'}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground flex-shrink-0">Note Recap</span>
          <span className="text-right break-words">
            {noteRecap ? (
              <span className="text-foreground/80 whitespace-pre-wrap">{noteRecap}</span>
            ) : (
              <span className="opacity-50">-</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function NOCRtgs() {
  const { toast } = useToast();
  const { getSiteNote } = useNOC();
  const { data: poList = [] } = usePOList();
  const [records, setRecords] = useState<TTRecordDB[]>([]);
  const [annotations, setAnnotations] = useState<RTGSAnnotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<{
    ticketId: string;
    field: EditField;
  } | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const captureInternalRef = useRef<HTMLDivElement>(null);
  const captureExternalRef = useRef<HTMLDivElement>(null);

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

  function siteIdForTicket(ticketId: string): string | null {
    return records.find((r) => r.ticket_id === ticketId)?.site_id ?? null;
  }

  async function handleSave(ticketId: string, field: EditField, value: string) {
    try {
      // "Update Target Online" disimpan ke tt_records (bukan annotation).
      if (field === 'update_target_online') {
        await updateTargetOnlineEdited(ticketId, value);
        await loadData();
        setEditingCell(null);
        return;
      }

      const siteId = siteIdForTicket(ticketId);
      if (!siteId) {
        throw new Error(
          `Site ID tidak ditemukan untuk tiket ${ticketId} — anotasi tidak bisa disimpan.`,
        );
      }
      await upsertAnnotation(siteId, ticketId, field, value);
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

  async function handleReset(ticketId: string, field: EditField) {
    try {
      // Reset "Update Target Online" → kembali ke nilai fetch tiket terkini.
      if (field === 'update_target_online') {
        await resetTargetOnlineEdited(ticketId);
        await loadData();
        return;
      }

      const siteId = siteIdForTicket(ticketId);
      if (!siteId) {
        throw new Error(
          `Site ID tidak ditemukan untuk tiket ${ticketId} — reset gagal.`,
        );
      }
      await resetAnnotationField(siteId, field);
      await loadData();
    } catch (err) {
      toast({
        title: 'Gagal reset',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  }

  async function captureElementToPng(
    el: HTMLDivElement,
    filename: string,
  ): Promise<void> {
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

      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
    } finally {
      el.style.left = '-9999px';
      el.style.position = 'absolute';
      el.style.zIndex = 'auto';
    }
  }

  async function handleCapture() {
    const internalEl = captureInternalRef.current;
    const externalEl = captureExternalRef.current;
    if (!internalEl || !externalEl) return;

    setIsCapturing(true);

    const d = getWIBNow();
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    const stamp = `${yyyy}-${mm}-${dd}-${hh}${mi}`;

    try {
      await captureElementToPng(
        internalEl,
        `rtgs-mahaga-internal-${stamp}.png`,
      );
      await captureElementToPng(
        externalEl,
        `rtgs-mahaga-external-${stamp}.png`,
      );
    } catch (err) {
      toast({
        title: 'Gagal capture',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setIsCapturing(false);
    }
  }

  const dateLabel = formatWIBDate();
  const timeLabel = formatWIBTime();

  const isPreviewRow = (r: TTRecordDB) => r.down_time < 7;
  const internalRecords = records.filter((r) => r.down_time >= 7);
  const externalRecords = records.filter((r) => r.down_time >= 11);
  const captureCount = internalRecords.length;
  const externalCount = externalRecords.length;
  const previewCount = records.filter((r) => isPreviewRow(r)).length;

  // Indeks first/last row dalam tabel yang masuk report External (down_time > 10).
  // Karena records disort by down_time DESC, blok external selalu kontigu di atas.
  const firstExternalIdx = records.findIndex((r) => r.down_time >= 11);
  let lastExternalIdx = -1;
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].down_time >= 11) {
      lastExternalIdx = i;
      break;
    }
  }

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto px-3 sm:px-4">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:justify-between lg:items-start">
        <div>
          <h2 className="text-lg font-semibold">Tiket RTGS Mahaga</h2>
          <p className="text-xs text-muted-foreground">
            TT open dengan aging ≥ 5 hari
          </p>
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 lg:mr-2">
            <span>
              Internal:{' '}
              <strong className="text-foreground">{captureCount} TT</strong>
            </span>
            <span>
              External:{' '}
              <strong className="text-foreground">{externalCount} TT</strong>
            </span>
            <span className="text-blue-500 dark:text-blue-400">
              Preview: <strong>{previewCount} TT</strong>
            </span>
          </div>
          <Button
            size="sm"
            className="gap-1.5 w-full lg:w-auto"
            onClick={handleCapture}
            disabled={isCapturing || captureCount === 0}
          >
            <Camera className="h-3.5 w-3.5" />
            {isCapturing ? 'Capturing...' : 'Capture PNG (2 file)'}
          </Button>
        </div>
      </div>

      {/* Info bar */}
      <div
        className="bg-amber-50 dark:bg-amber-950/20
                   border border-amber-200 dark:border-amber-900
                   rounded-md p-3 text-xs space-y-1"
      >
        <div>
          💡 Klik kolom <strong>Problem Hasil Analisa</strong>,{' '}
          <strong>Action</strong>, <strong>Kendala</strong>, atau{' '}
          <strong>Update Target Online</strong> untuk edit manual.{' '}
          <strong>Plan Target Online</strong> = hasil fetch awal (read-only).
        </div>
        <div>
          Row dengan badge{' '}
          <strong className="text-blue-500 dark:text-blue-400">Preview</strong>{' '}
          (aging 5-6) belum masuk capture PNG, tapi annotation-nya akan muncul
          saat aging naik ke 7+.
        </div>
        <div>
          Row tint{' '}
          <strong className="text-orange-600 dark:text-orange-400">orange</strong>{' '}
          (badge <strong className="text-orange-600 dark:text-orange-400">H-1 Ext</strong>,
          aging 10) belum masuk External, tapi <strong>besok</strong> akan naik
          ke aging &gt; 10 → siap-siap di-prep.
        </div>
        <div>
          Row di dalam{' '}
          <strong className="text-emerald-600 dark:text-emerald-400">
            border hijau
          </strong>{' '}
          (badge <strong className="text-emerald-600 dark:text-emerald-400">Ext</strong>,
          aging &gt; 10) masuk report <strong>External</strong> — kolom Action,
          Plan Target Online, dan Update Target Online disembunyikan di image
          External-nya.
        </div>
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
        <>
          {/* Mobile / Tablet — card stack */}
          <div className="lg:hidden space-y-3">
            {records.map((record, idx) => {
              const annotationRaw =
                (record.site_id
                  ? annotations.find((a) => a.site_id === record.site_id)
                  : null) ?? null;
              // Gate per insiden (lihat tabel desktop): incident_start harus
              // cocok date_start tiket sekarang, kalau tidak anotasi diabaikan.
              const annotation =
                annotationRaw && annotationRaw.incident_start === record.date_start
                  ? annotationRaw
                  : null;
              const isPreview = isPreviewRow(record);
              const isExternal = record.down_time >= 11;
              const isWillBeExternal = record.down_time === 10;
              const noteRecap = record.site_id
                ? (getSiteNote(record.site_id)?.note?.trim() ?? '')
                : '';
              return (
                <MobileTicketCard
                  key={record.ticket_id}
                  record={record}
                  annotation={annotation}
                  poName={resolvePOName(record, poList)}
                  index={idx}
                  isPreview={isPreview}
                  isWillBeExternal={isWillBeExternal}
                  isExternal={isExternal}
                  noteRecap={noteRecap}
                  editingCell={editingCell}
                  setEditingCell={setEditingCell}
                  onSave={handleSave}
                  onReset={handleReset}
                />
              );
            })}
          </div>

          {/* Desktop — tabel existing */}
          <div className="hidden lg:block border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-yellow-400 text-black">
              <tr>
                <th className="px-2 py-2 w-12 text-center">No</th>
                <th className="px-2 py-2 w-36 text-left">SiteID</th>
                <th className="px-2 py-2 text-left">Nama Lokasi</th>
                <th className="px-2 py-2 w-40 text-left">Provinsi</th>
                <th className="px-2 py-2 w-28 text-left">PO</th>
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
                const annotationRaw =
                  (record.site_id
                    ? annotations.find((a) => a.site_id === record.site_id)
                    : null) ?? null;
                // Gate per insiden: anotasi hanya berlaku kalau incident_start
                // cocok dengan date_start tiket sekarang (insiden lama → diabaikan).
                const annotation =
                  annotationRaw && annotationRaw.incident_start === record.date_start
                    ? annotationRaw
                    : null;
                const problem = getEffectiveProblem(record, annotation);
                const action = getEffectiveAction(annotation);
                const isProblemEdited = annotation?.is_problem_edited ?? false;
                const isActionEdited = annotation?.is_action_edited ?? false;
                const isKendalaEdited = annotation?.is_kendala_edited ?? false;
                const isUpdateTargetEdited = !!(
                  record.is_manually_edited && record.target_online_edited
                );
                const isProblemEditing =
                  editingCell?.ticketId === record.ticket_id &&
                  editingCell.field === 'problem_analisa';
                const isActionEditing =
                  editingCell?.ticketId === record.ticket_id &&
                  editingCell.field === 'action';
                const isKendalaEditing =
                  editingCell?.ticketId === record.ticket_id &&
                  editingCell.field === 'kendala';
                const isUpdateTargetEditing =
                  editingCell?.ticketId === record.ticket_id &&
                  editingCell.field === 'update_target_online';

                const isPreview = isPreviewRow(record);
                const isExternal = record.down_time >= 11;
                const isWillBeExternal = record.down_time === 10;
                const isFirstExternal = idx === firstExternalIdx;
                const isLastExternal = idx === lastExternalIdx;

                // Border emerald untuk membungkus blok rows yang akan masuk
                // report External (≥10 hari).
                const borderTopExt = isFirstExternal
                  ? 'border-t-[3px] border-t-emerald-500'
                  : '';
                const borderBottomExt = isLastExternal
                  ? 'border-b-[3px] border-b-emerald-500'
                  : '';
                const borderLeftExt = isExternal
                  ? 'border-l-[3px] border-l-emerald-500'
                  : '';
                const borderRightExt = isExternal
                  ? 'border-r-[3px] border-r-emerald-500'
                  : '';
                const middleCellBorders = cn(borderTopExt, borderBottomExt);
                const firstCellBorders = cn(
                  borderTopExt,
                  borderBottomExt,
                  borderLeftExt,
                );
                const lastCellBorders = cn(
                  borderTopExt,
                  borderBottomExt,
                  borderRightExt,
                );

                return (
                  <tr
                    key={record.ticket_id}
                    className={cn(
                      'border-t hover:bg-accent/30',
                      isPreview && 'bg-muted/30',
                      isWillBeExternal && 'bg-orange-500/[0.1]',
                      isExternal && 'bg-emerald-500/[0.06]',
                    )}
                  >
                    <td
                      className={cn(
                        'px-2 py-2 text-center align-top',
                        firstCellBorders,
                      )}
                    >
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
                        {isWillBeExternal && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded
                                       bg-orange-500/20 text-orange-600
                                       dark:text-orange-400
                                       font-semibold whitespace-nowrap"
                            title="Besok aging naik ke > 10 → masuk report External"
                          >
                            H-1 Ext
                          </span>
                        )}
                        {isExternal && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded
                                       bg-emerald-500/15 text-emerald-600
                                       dark:text-emerald-400
                                       font-medium whitespace-nowrap"
                            title="Akan masuk report External (umur diatas 10 hari)"
                          >
                            Ext
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className={cn(
                        'px-2 py-2 font-mono text-xs align-top',
                        middleCellBorders,
                      )}
                    >
                      {record.site_id ?? '-'}
                    </td>
                    <td
                      className={cn('px-2 py-2 align-top', middleCellBorders)}
                    >
                      {record.site_name}
                    </td>
                    <td
                      className={cn('px-2 py-2 align-top', middleCellBorders)}
                    >
                      {record.provinsi ?? '-'}
                    </td>
                    <td
                      className={cn('px-2 py-2 align-top', middleCellBorders)}
                    >
                      {resolvePOName(record, poList)}
                    </td>
                    <td
                      className={cn(
                        'px-2 py-2 text-center font-semibold align-top',
                        middleCellBorders,
                      )}
                    >
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
                      tdClassName={middleCellBorders}
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
                      tdClassName={middleCellBorders}
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
                      tdClassName={middleCellBorders}
                    />

                    {/* Plan Target Online = snapshot fetch awal (read-only) */}
                    <td
                      className={cn(
                        'px-2 py-2 text-center align-top',
                        middleCellBorders,
                      )}
                    >
                      {getEffectivePlanTargetOnline(annotation, record) || '-'}
                    </td>

                    {/* Update Target Online = editable (→ tt_records) */}
                    <EditableCell
                      value={formatTargetDateInline(pickTargetOnline(record))}
                      isEdited={isUpdateTargetEdited}
                      isEditing={isUpdateTargetEditing}
                      onEditStart={() =>
                        setEditingCell({
                          ticketId: record.ticket_id,
                          field: 'update_target_online',
                        })
                      }
                      onSave={(v) =>
                        handleSave(record.ticket_id, 'update_target_online', v)
                      }
                      onCancel={() => setEditingCell(null)}
                      onReset={() =>
                        handleReset(record.ticket_id, 'update_target_online')
                      }
                      tdClassName={middleCellBorders}
                    />

                    <td
                      className={cn(
                        'px-2 py-2 align-top text-xs text-muted-foreground',
                        lastCellBorders,
                      )}
                    >
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
        </>
      )}

      {/* Hidden capture targets — di-pop dari layar saat handleCapture dijalankan */}
      <div
        ref={captureInternalRef}
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 0,
          backgroundColor: '#ffffff',
        }}
      >
        <RTGSCaptureView
          records={internalRecords}
          annotations={annotations}
          poList={poList}
          dateLabel={dateLabel}
          timeLabel={timeLabel}
          variant="internal"
        />
      </div>
      <div
        ref={captureExternalRef}
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 0,
          backgroundColor: '#ffffff',
        }}
      >
        <RTGSCaptureView
          records={externalRecords}
          annotations={annotations}
          poList={poList}
          dateLabel={dateLabel}
          timeLabel={timeLabel}
          variant="external"
        />
      </div>
    </div>
  );
}
