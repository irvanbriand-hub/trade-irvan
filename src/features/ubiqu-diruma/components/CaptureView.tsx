import type React from 'react';
import type { DatasetRow, UbiquEdit } from '../lib/types';
import { nonHtbCaptureTitle } from '../lib/types';
import {
  findEdit,
  effProgress,
  effKendala,
  effMrqNumber,
  effResi,
  effEta,
  effStatusPengiriman,
} from '../lib/queries';

interface CaptureViewProps {
  rows: DatasetRow[]; // NON-HTB, sudah top-N, sorted dur_days desc
  edits: UbiquEdit[];
  dateLabel: string; // 'DD/MM/YYYY'
  timeLabel: string; // 'HH:mm'
  /** Sertakan kolom spare (MRQ/RESI/ETA/Status Pengiriman) di capture. Default: false. */
  includeSpare?: boolean;
}

const thStyle: React.CSSProperties = {
  padding: '10px 8px',
  backgroundColor: '#FFEB3B',
  color: '#000',
  fontWeight: 700,
  fontSize: '14px',
  textAlign: 'center',
  border: '1px solid #888',
};

const tdBase: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid #ccc',
  verticalAlign: 'top',
  lineHeight: 1.4,
  color: '#000',
  fontSize: '12px',
  wordBreak: 'break-word',
  overflowWrap: 'break-word',
  whiteSpace: 'normal',
};

function dash(s: string): string {
  return s && s.trim() ? s : '-';
}

export function UbiquCaptureView({
  rows,
  edits,
  dateLabel,
  timeLabel,
  includeSpare = false,
}: CaptureViewProps) {
  return (
    <div
      id="ubiqu-capture-ready"
      style={{
        width: '1600px',
        backgroundColor: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        color: '#000',
      }}
    >
      <div
        style={{
          padding: '10px 16px',
          backgroundColor: '#FFFFFF',
          color: '#C00000',
          fontSize: '15px',
          fontWeight: 700,
        }}
      >
        {nonHtbCaptureTitle(dateLabel, timeLabel)}
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', fontSize: '13px' }}>
          Belum ada data NON-HTB.
        </div>
      ) : (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            fontSize: '12px',
            backgroundColor: '#ffffff',
          }}
        >
          <colgroup>
            <col style={{ width: '36px' }} /> {/* No */}
            <col style={{ width: '210px' }} /> {/* No Tiket */}
            <col style={{ width: '90px' }} /> {/* Site ID */}
            <col style={{ width: 'auto' }} /> {/* Nama Lokasi */}
            <col style={{ width: '130px' }} /> {/* Provinsi */}
            <col style={{ width: '55px' }} /> {/* Umur */}
            <col style={{ width: '150px' }} /> {/* Trouble Category */}
            <col style={{ width: 'auto' }} /> {/* Problem */}
            <col style={{ width: 'auto' }} /> {/* Progress */}
            {includeSpare && (
              <>
                <col style={{ width: '130px' }} /> {/* MRQ Number */}
                <col style={{ width: '120px' }} /> {/* RESI */}
                <col style={{ width: '120px' }} /> {/* ETA */}
                <col style={{ width: '100px' }} /> {/* Status Pengiriman */}
              </>
            )}
          </colgroup>
          <thead>
            <tr>
              <th style={thStyle}>No</th>
              <th style={thStyle}>No Tiket</th>
              <th style={thStyle}>Site ID</th>
              <th style={thStyle}>Nama Lokasi</th>
              <th style={thStyle}>Provinsi</th>
              <th style={thStyle}>
                Umur
                <br />
                Tiket
                <br />
                (Hari)
              </th>
              <th style={thStyle}>Trouble Category (Info CBOSS)</th>
              <th style={thStyle}>Problem</th>
              <th style={thStyle}>Progress</th>
              {includeSpare && (
                <>
                  <th style={thStyle}>MRQ NUMBER</th>
                  <th style={thStyle}>RESI</th>
                  <th style={thStyle}>ETA</th>
                  <th style={thStyle}>STATUS PENGIRIMAN</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const edit = findEdit(edits, row.ticket_id);
              const bg = idx % 2 === 0 ? '#ffffff' : '#fafafa';
              return (
                <tr key={row.ticket_id} style={{ backgroundColor: bg }}>
                  <td style={{ ...tdBase, textAlign: 'center' }}>{idx + 1}</td>
                  <td style={{ ...tdBase, fontSize: '11px' }}>
                    {dash(row.ticket_number)}
                  </td>
                  <td style={{ ...tdBase, whiteSpace: 'nowrap' }}>
                    {dash(row.site_id)}
                  </td>
                  <td style={tdBase}>{dash(row.site_name)}</td>
                  <td style={tdBase}>{dash(row.province)}</td>
                  <td style={{ ...tdBase, textAlign: 'center', fontWeight: 600 }}>
                    {row.dur_days}
                  </td>
                  <td style={tdBase}>{dash(row.trouble_category)}</td>
                  <td style={tdBase}>{dash(effKendala(edit))}</td>
                  <td style={tdBase}>{dash(effProgress(edit))}</td>
                  {includeSpare && (
                    <>
                      <td style={tdBase}>{dash(effMrqNumber(edit))}</td>
                      <td style={tdBase}>{dash(effResi(edit))}</td>
                      <td style={tdBase}>{dash(effEta(edit))}</td>
                      <td style={{ ...tdBase, textAlign: 'center' }}>
                        {dash(effStatusPengiriman(edit))}
                      </td>
                    </>
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
