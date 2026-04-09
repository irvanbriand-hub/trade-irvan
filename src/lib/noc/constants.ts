export const AREA_MAP: Record<string, number> = {
  // Area 1 — Sumatera & Jawa
  'ACEH': 1,
  'SUMATERA UTARA': 1,
  'SUMATERA BARAT': 1,
  'SUMATERA SELATAN': 1,
  'RIAU': 1,
  'KEPULAUAN RIAU': 1,
  'JAMBI': 1,
  'BENGKULU': 1,
  'LAMPUNG': 1,
  'KEPULAUAN BANGKA BELITUNG': 1,
  'DKI JAKARTA': 1,
  'JAWA BARAT': 1,
  'JAWA TENGAH': 1,
  'JAWA TIMUR': 1,
  'DI YOGYAKARTA': 1,
  'BANTEN': 1,
  // Area 2 — Sulawesi & Kalimantan
  'SULAWESI UTARA': 2,
  'SULAWESI TENGAH': 2,
  'SULAWESI SELATAN': 2,
  'SULAWESI TENGGARA': 2,
  'SULAWESI BARAT': 2,
  'GORONTALO': 2,
  'KALIMANTAN BARAT': 2,
  'KALIMANTAN TENGAH': 2,
  'KALIMANTAN SELATAN': 2,
  'KALIMANTAN TIMUR': 2,
  'KALIMANTAN UTARA': 2,
  // Area 3 — Timur Indonesia
  'NUSA TENGGARA TIMUR': 3,
  'NUSA TENGGARA BARAT': 3,
  'BALI': 3,
  'MALUKU': 3,
  'MALUKU UTARA': 3,
  'PAPUA': 3,
  'PAPUA BARAT': 3,
  'PAPUA BARAT DAYA': 3,
  'PAPUA PEGUNUNGAN': 3,
  'PAPUA TENGAH': 3,
  'PAPUA SELATAN': 3,
};

export const AREA_NAMES: Record<number, string> = {
  1: 'Sumatera & Jawa',
  2: 'Sulawesi & Kalimantan',
  3: 'Timur Indonesia',
};

// Provinsi digroup per area untuk UI multi-select
export const ALL_PROVINSI: Record<number, string[]> = {
  1: [
    'ACEH', 'SUMATERA UTARA', 'SUMATERA BARAT', 'SUMATERA SELATAN',
    'RIAU', 'KEPULAUAN RIAU', 'JAMBI', 'BENGKULU', 'LAMPUNG',
    'KEPULAUAN BANGKA BELITUNG', 'DKI JAKARTA', 'JAWA BARAT', 'JAWA TENGAH',
    'JAWA TIMUR', 'DI YOGYAKARTA', 'BANTEN',
  ],
  2: [
    'SULAWESI UTARA', 'SULAWESI TENGAH', 'SULAWESI SELATAN',
    'SULAWESI TENGGARA', 'SULAWESI BARAT', 'GORONTALO',
    'KALIMANTAN BARAT', 'KALIMANTAN TENGAH', 'KALIMANTAN SELATAN',
    'KALIMANTAN TIMUR', 'KALIMANTAN UTARA',
  ],
  3: [
    'NUSA TENGGARA TIMUR', 'NUSA TENGGARA BARAT', 'BALI',
    'MALUKU', 'MALUKU UTARA', 'PAPUA', 'PAPUA BARAT',
    'PAPUA BARAT DAYA', 'PAPUA PEGUNUNGAN', 'PAPUA TENGAH', 'PAPUA SELATAN',
  ],
};

// Alias untuk backward compatibility di komponen yang masih pakai nama lama
export const PROVINSI_BY_AREA = ALL_PROVINSI;

// Aging bucket labels untuk chart
export const AGING_BUCKETS = [
  { label: '1-6j', min: 1, max: 6 },
  { label: '7-13j', min: 7, max: 13 },
  { label: '14-19j', min: 14, max: 19 },
  { label: '20-29j', min: 20, max: 29 },
  { label: '30+j', min: 30, max: Infinity },
] as const;
