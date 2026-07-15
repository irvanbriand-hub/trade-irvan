// Builder URL per-site untuk tombol navigasi di tiap row (Zabbix / Grafana / Maps).
// Kembalikan null → tombol tampil non-aktif (abu). Kembalikan string → tombol jadi link.
//
// Field yang tersedia dari master site (datek):
//   s.site_id, s.name, s.ip_address, s.gateway, s.hub, s.beam,
//   s.provinsi, s.kabupaten, s.kecamatan, s.cluster, s.desa,
//   s.longitude, s.latitude, s.kategori_lokasi
import type { SiteMaster } from './siteMasterQueries';

/** Google Maps — arahkan ke koordinat site. Non-aktif kalau long/lat kosong. */
export function gmapsUrl(s: SiteMaster): string | null {
  if (s.latitude == null || s.longitude == null) return null;
  return `https://www.google.com/maps?q=${s.latitude},${s.longitude}`;
}

/**
 * Zabbix — site-tree per terminal. `site_uniq_id` = terminal ID (= site_id datek).
 * Contoh: https://manager.zabbix-bakti.io/host/site-tree?site_uniq_id=AM16224717195319N&site_type=LAYANAN
 */
export function zabbixUrl(s: SiteMaster): string | null {
  if (!s.site_id) return null;
  return `https://manager.zabbix-bakti.io/host/site-tree?site_uniq_id=${encodeURIComponent(s.site_id)}&site_type=LAYANAN`;
}

// Token (UID dashboard Grafana) per HUB. Tambah entry di sini tiap dapat hub baru.
// Hub yang belum ada token-nya → tombol Grafana otomatis non-aktif.
const GRAFANA_HUB_UID: Record<string, string> = {
  H47: 'ffpVJlbHk',
  H10: 'dGmoBucIk',
  H58: '-wTRuDqSz',
};

/**
 * Grafana — RTGS remote terminal monitoring. Dashboard (token) ditentukan HUB,
 * Terminal_id = site_id. Slug diturunkan dari hub (rtgs-<hub>-remote-terminal-monitoring).
 * Contoh: .../d/ffpVJlbHk/rtgs-h47-remote-terminal-monitoring?orgId=1&var-Terminal_id=AM16199417299111N
 */
export function grafanaUrl(s: SiteMaster): string | null {
  if (!s.site_id || !s.hub) return null;
  const hub = s.hub.trim().toUpperCase();
  const uid = GRAFANA_HUB_UID[hub];
  if (!uid) return null; // hub belum ada token-nya
  const slug = `rtgs-${hub.toLowerCase()}-remote-terminal-monitoring`;
  return `https://mon-rtgs.mahaga-pratama.co.id/d/${uid}/${slug}?orgId=1&var-Terminal_id=${encodeURIComponent(s.site_id)}`;
}
