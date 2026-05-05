import type React from 'react';
import {
  getEffectiveProblem,
  getEffectiveAction,
  getEffectiveKendala,
  getEffectivePlanTargetOnline,
  type RTGSAnnotation,
} from '@/lib/noc/rtgsQueries';
import type { TTRecordDB } from '@/lib/noc/types';

export type RTGSCaptureVariant = 'internal' | 'external';

interface RTGSCaptureViewProps {
  records: TTRecordDB[];
  annotations: RTGSAnnotation[];
  /** Tanggal & jam yang di-render di header (WIB). */
  dateLabel: string; // 'DD/MM/YYYY'
  timeLabel: string; // 'HH:mm'
  /**
   * Varian tampilan:
   * - 'internal' (default): semua kolom tampil, header "umur 7 hari atau lebih".
   * - 'external': kolom Action, Plan Target Online, Update Target Online disembunyikan,
   *   header "umur 10 hari atau lebih". Records tetap di-filter di parent.
   */
  variant?: RTGSCaptureVariant;
}

// ─── Date format helper ──────────────────────────────────────────────────────

/** Convert ISO 'YYYY-MM-DD' (atau apapun yg ada di TT record) → 'DD/MM/YYYY'. */
function formatTargetDate(raw: string | null | undefined): string {
  if (!raw) return '-';
  const trimmed = raw.trim();
  // ISO YYYY-MM-DD
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  // Sudah dalam DD/MM/YYYY atau D/M/YYYY → normalize
  const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${d}/${m}/${y}`;
  }
  return trimmed;
}

/** Pilih target online yang paling relevan untuk RTGS report. */
function pickTargetOnline(record: TTRecordDB): string {
  if (record.is_manually_edited && record.target_online_edited) {
    return record.target_online_edited;
  }
  return record.target_online_original ?? '';
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '10px 10px',
  backgroundColor: '#FFEB3B',
  color: '#000',
  fontWeight: 700,
  fontSize: '16px',
  textAlign: 'center',
  border: '1px solid #888',
};

const tdBase: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid #ccc',
  verticalAlign: 'top',
  lineHeight: 1.4,
  color: '#000',
  fontSize: '13px',
  wordBreak: 'break-word',
  overflowWrap: 'break-word',
  whiteSpace: 'normal',
};

// ─── Main view ───────────────────────────────────────────────────────────────

export function RTGSCaptureView({
  records,
  annotations,
  dateLabel,
  timeLabel,
  variant = 'internal',
}: RTGSCaptureViewProps) {
  const annotationByTicket = new Map(
    annotations.map((a) => [a.ticket_id, a]),
  );

  const isExternal = variant === 'external';
  const ageThreshold = isExternal ? 10 : 7;

  return (
    <div
      id="rtgs-capture-ready"
      style={{
        width: '1400px',
        backgroundColor: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        color: '#000',
      }}
    >
      {/* Title bar — putih dengan teks merah, nempel seamless dengan table */}
      <div
        style={{
          padding: '10px 16px',
          backgroundColor: '#FFFFFF',
          color: '#C00000',
          fontSize: '14px',
          fontWeight: 700,
          marginBottom: 0,
          borderBottom: 'none',
        }}
      >
        Tiket RTGS Mahaga yang umur nya {ageThreshold} hari atau lebih, update :
        tgl {dateLabel}, Jam {timeLabel}
      </div>

      {/* Tabel */}
      {records.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', fontSize: '13px' }}>
          Tidak ada TT dengan aging ≥ {ageThreshold} hari.
        </div>
      ) : (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            marginTop: 0,
            fontSize: '13px',
            backgroundColor: '#ffffff',
          }}
        >
          <colgroup>
            <col style={{ width: '50px' }} />   {/* No */}
            <col style={{ width: '175px' }} />  {/* SiteID — cukup untuk 17-18 char */}
            <col style={{ width: 'auto' }} />   {/* Nama Lokasi */}
            <col style={{ width: '160px' }} />  {/* Provinsi */}
            <col style={{ width: '90px' }} />   {/* Umur Tiket */}
            <col style={{ width: 'auto' }} />   {/* Problem Analisa */}
            {!isExternal && <col style={{ width: 'auto' }} />}   {/* Action */}
            <col style={{ width: 'auto' }} />   {/* Kendala */}
            {!isExternal && <col style={{ width: '100px' }} />}  {/* Plan Target Online */}
            {!isExternal && <col style={{ width: '100px' }} />}  {/* Update Target Online */}
          </colgroup>
          <thead>
            <tr>
              <th style={thStyle}>No</th>
              <th style={thStyle}>SiteID</th>
              <th style={thStyle}>Nama Lokasi</th>
              <th style={thStyle}>Provinsi</th>
              <th style={thStyle}>Umur Tiket (hari)</th>
              <th style={thStyle}>Problem Hasil Analisa</th>
              {!isExternal && <th style={thStyle}>Action</th>}
              <th style={thStyle}>Kendala</th>
              {!isExternal && <th style={thStyle}>Plan Target Online</th>}
              {!isExternal && <th style={thStyle}>Update Target Online</th>}
            </tr>
          </thead>
          <tbody>
            {records.map((record, idx) => {
              const annotation = annotationByTicket.get(record.ticket_id) ?? null;
              const problem = getEffectiveProblem(record, annotation);
              const action = getEffectiveAction(annotation);
              const bg = idx % 2 === 0 ? '#ffffff' : '#fafafa';

              return (
                <tr key={record.ticket_id} style={{ backgroundColor: bg }}>
                  <td style={{ ...tdBase, textAlign: 'center' }}>{idx + 1}</td>
                  <td
                    style={{
                      ...tdBase,
                      fontFamily: 'Arial, sans-serif',
                      fontSize: '13px',
                      wordBreak: 'keep-all',
                      overflowWrap: 'normal',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {record.site_id ?? '-'}
                  </td>
                  <td style={tdBase}>{record.site_name}</td>
                  <td style={tdBase}>{record.provinsi ?? '-'}</td>
                  <td style={{ ...tdBase, textAlign: 'center', fontWeight: 600 }}>
                    {record.down_time}
                  </td>
                  <td style={tdBase}>{problem}</td>
                  {!isExternal && <td style={tdBase}>{action}</td>}
                  <td style={tdBase}>{getEffectiveKendala(annotation)}</td>
                  {!isExternal && (
                    <td style={{ ...tdBase, textAlign: 'center' }}>
                      {formatTargetDate(
                        getEffectivePlanTargetOnline(annotation),
                      )}
                    </td>
                  )}
                  {!isExternal && (
                    <td style={{ ...tdBase, textAlign: 'center' }}>
                      {formatTargetDate(pickTargetOnline(record))}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
