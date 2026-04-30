// Tabel breakdown harian S-Curve.
// Baris: PLAN DAILY, PLAN ALL, ACTUAL ALL.
// Kolom: tanggal-tanggal di periode baseline.
// Pakai HTML table + inline style supaya konsisten antara dashboard preview
// dan capture page (Puppeteer screenshot).

import type { SCurveSeries } from '@/lib/noc/scurveSeries';

interface Props {
  series: SCurveSeries;
}

const HEADER_BG = '#FFE066';
const BORDER = '1px solid #000';

const headerCellStyle: React.CSSProperties = {
  background: HEADER_BG,
  border: BORDER,
  padding: '6px 10px',
  textAlign: 'center',
  fontWeight: 700,
  fontSize: 13,
  color: '#000',
  whiteSpace: 'nowrap',
};

const labelCellStyle: React.CSSProperties = {
  border: BORDER,
  padding: '6px 10px',
  fontWeight: 700,
  fontSize: 13,
  color: '#000',
  background: '#fff',
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const dataCellStyle: React.CSSProperties = {
  border: BORDER,
  padding: '6px 10px',
  fontSize: 13,
  color: '#000',
  background: '#fff',
  textAlign: 'center',
  minWidth: 80,
};

export function SCurveBreakdownTable({ series }: Props) {
  const { fullDates, planDaily, planned, actual } = series;

  if (fullDates.length === 0) return null;

  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontFamily: 'Arial, sans-serif',
        background: '#fff',
      }}
    >
      <thead>
        <tr>
          <th style={headerCellStyle}>KETERANGAN</th>
          {fullDates.map((d, i) => (
            <th key={i} style={headerCellStyle}>
              {d}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style={labelCellStyle}>PLAN DAILY</td>
          {planDaily.map((v, i) => (
            <td key={i} style={dataCellStyle}>
              {v}
            </td>
          ))}
        </tr>
        <tr>
          <td style={labelCellStyle}>PLAN ALL</td>
          {planned.map((v, i) => (
            <td key={i} style={dataCellStyle}>
              {v}
            </td>
          ))}
        </tr>
        <tr>
          <td style={labelCellStyle}>ACTUAL ALL</td>
          {actual.map((v, i) => (
            <td key={i} style={dataCellStyle}>
              {v ?? ''}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
