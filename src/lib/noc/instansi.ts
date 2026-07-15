// Klasifikasi kategori instansi (dari kolom KATEGORI LOKASI master site).

// Keyword kategori instansi pendidikan (dicocokkan word-boundary, uppercase).
export const EDU_KEYWORDS = [
  'PENDIDIKAN', 'SEKOLAH', 'PESANTREN', 'PONPES', 'PONDOK', 'MADRASAH',
  'UNIVERSITAS', 'KAMPUS', 'INSTITUT', 'POLITEKNIK', 'AKADEMI', 'SLB',
  'SD', 'SDN', 'SMP', 'SMPN', 'SMA', 'SMAN', 'SMK', 'SMKN',
  'MI', 'MIN', 'MTS', 'MTSN', 'MA', 'MAN', 'TK', 'PAUD', 'RA',
];

const EDU_RE = new RegExp(`\\b(${EDU_KEYWORDS.join('|')})\\b`);

/** True kalau kategori lokasi termasuk instansi pendidikan. */
export function isPendidikan(kategori: string): boolean {
  return EDU_RE.test(kategori.toUpperCase());
}
