// Resolve PO penanggung jawab lokasi dari datasheet PO.
// Twist datasheet:
//   - Mayoritas baris kabupaten = 'All' → match per provinsi.
//   - PROVINS sering berupa GRUP ('SULAWESI', 'KALIMANTAN') sedangkan provinsi
//     tiket spesifik ('SULAWESI SELATAN') → match prefix, pilih paling spesifik.
//   - JAWA BARAT dipecah per kabupaten (tanpa baris 'All') → override kabupaten.

export interface PORef {
  provins: string;
  kabupaten: string;
  nama_po: string;
}

function norm(s: string | null | undefined): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Buang prefiks administratif supaya nama kabupaten/kota bisa dibandingkan. */
function coreRegion(s: string): string {
  return norm(s)
    .replace(/^KABUPATEN\s+/, '')
    .replace(/^KAB\.?\s*/, '')
    .replace(/^KOTA\s+/, '')
    .trim();
}

/**
 * @returns nama PO, atau '' kalau tidak ketemu (→ jadi sel editable manual).
 */
export function resolvePO(
  province: string,
  city: string,
  district: string,
  poList: PORef[],
): string {
  const provN = norm(province);
  const cityCore = coreRegion(city);
  const distCore = coreRegion(district);

  // 1) Override kabupaten (baris kabupaten != 'All').
  for (const po of poList) {
    if (norm(po.kabupaten) === 'ALL') continue;
    const kabCore = coreRegion(po.kabupaten);
    if (!kabCore) continue;
    for (const t of [cityCore, distCore]) {
      if (!t) continue;
      if (t === kabCore || t.includes(kabCore) || kabCore.includes(t)) {
        return po.nama_po;
      }
    }
  }

  // 2) Provinsi (baris kabupaten = 'All'), pilih prefix paling spesifik.
  let best: PORef | null = null;
  let bestLen = -1;
  for (const po of poList) {
    if (norm(po.kabupaten) !== 'ALL') continue;
    const refProv = norm(po.provins);
    if (provN === refProv || provN.startsWith(refProv)) {
      if (refProv.length > bestLen) {
        best = po;
        bestLen = refProv.length;
      }
    }
  }
  return best?.nama_po ?? '';
}
