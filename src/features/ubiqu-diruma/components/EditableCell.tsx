import { useEffect, useState } from 'react';
import { Pencil, RotateCcw, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditableCellProps {
  value: string;
  isEdited: boolean;
  isEditing: boolean;
  placeholder?: string;
  onEditStart: () => void;
  onSave: (val: string) => void;
  onCancel: () => void;
  onReset: () => void;
  tdClassName?: string;
}

/** Sel tabel desktop yang bisa diedit inline (adaptasi dari NOCRtgs). */
export function EditableCell({
  value,
  isEdited,
  isEditing,
  placeholder,
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
            className="flex-1 min-h-[56px] text-sm p-1 border rounded bg-background"
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
          className="absolute top-1 left-0 w-1 h-[calc(100%-8px)] bg-amber-400 rounded-r"
          title="Sudah diedit manual"
        />
      )}
      <div className="flex items-start gap-2 pl-1">
        <span
          className={cn(
            'flex-1 whitespace-pre-wrap',
            isEdited && 'font-medium',
            !value && 'text-muted-foreground italic',
          )}
        >
          {value || placeholder || '—'}
        </span>
        <div className="opacity-0 group-hover/cell:opacity-100 transition-opacity flex gap-1 flex-shrink-0 mt-0.5">
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
