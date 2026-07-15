import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Activity, BarChart3, MapPin, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { fetchSiteMaster, SITE_MASTER_LIST_QK, type SiteMaster } from '@/lib/noc/siteMasterQueries';
import { gmapsUrl, zabbixUrl, grafanaUrl } from '@/lib/noc/siteLinks';

const LIST_LIMIT = 300;

type LinkTone = 'red' | 'orange' | 'blue';
const LINK_HOVER: Record<LinkTone, string> = {
  red: 'hover:bg-red-500/15 text-red-600 dark:text-red-400',
  orange: 'hover:bg-orange-500/15 text-orange-600 dark:text-orange-400',
  blue: 'hover:bg-blue-500/15 text-blue-600 dark:text-blue-400',
};

function LinkIconBtn({ href, title, Icon, tone }: { href: string | null; title: string; Icon: LucideIcon; tone: LinkTone }) {
  if (!href) {
    return (
      <span
        title={`${title} — belum tersedia`}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/30 cursor-not-allowed"
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
      className={cn('flex h-7 w-7 items-center justify-center rounded-md transition-colors', LINK_HOVER[tone])}
    >
      <Icon className="h-3.5 w-3.5" />
    </a>
  );
}

function SiteActions({ s }: { s: SiteMaster }) {
  return (
    <div className="flex items-center gap-0.5">
      <LinkIconBtn href={zabbixUrl(s)} title="Zabbix" Icon={Activity} tone="red" />
      <LinkIconBtn href={grafanaUrl(s)} title="Grafana" Icon={BarChart3} tone="orange" />
      <LinkIconBtn href={gmapsUrl(s)} title="Google Maps" Icon={MapPin} tone="blue" />
    </div>
  );
}

/**
 * Tabel master site (datek) read-only + search. Fetch sendiri via React Query
 * (query key bersama → cache di-share, tidak fetch dobel). Dipakai di halaman
 * Datek → Master Site dan halaman Monitoring.
 */
export function SiteMasterTable({ showActions = false }: { showActions?: boolean }) {
  const [search, setSearch] = useState('');
  const { data: sites = [], isLoading } = useQuery({
    queryKey: SITE_MASTER_LIST_QK,
    queryFn: fetchSiteMaster,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sites;
    return sites.filter((s) =>
      [s.site_id, s.name, s.provinsi, s.kabupaten, s.kecamatan, s.kategori_lokasi, s.cluster, s.ip_address, s.gateway, s.hub, s.beam]
        .some((v) => (v ?? '').toLowerCase().includes(term)),
    );
  }, [sites, search]);

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Memuat data…</div>;
  }
  if (sites.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Belum ada data. Upload Excel di tab Datek → Master Site untuk mengisi.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari site ID / nama / provinsi / kategori…"
          className="h-8 pl-8 text-xs"
        />
      </div>

      <div className="border rounded-md overflow-auto max-h-[calc(100vh-16rem)]">
        <table className="w-full text-xs min-w-[1340px]">
          <thead className="bg-muted/60 sticky top-0 z-10">
            <tr className="text-left [&>th]:px-2 [&>th]:py-2 [&>th]:font-semibold [&>th]:whitespace-nowrap">
              <th className="w-10">#</th>
              {showActions && <th className="w-24">Aksi</th>}
              <th>Site ID</th>
              <th>Name</th>
              <th>Kategori</th>
              <th>IP Address</th>
              <th>Gateway</th>
              <th>Provinsi</th>
              <th>Kabupaten</th>
              <th>Kecamatan</th>
              <th>Cluster</th>
              <th>Desa</th>
              <th>HUB</th>
              <th>Beam</th>
              <th className="text-right">Longitude</th>
              <th className="text-right">Latitude</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, LIST_LIMIT).map((s, i) => (
              <tr key={s.id} className="border-t [&>td]:px-2 [&>td]:py-1.5 [&>td]:align-top hover:bg-accent/30">
                <td className="text-muted-foreground tabular-nums">{i + 1}</td>
                {showActions && (
                  <td>
                    <SiteActions s={s} />
                  </td>
                )}
                <td className="font-mono whitespace-nowrap">{s.site_id}</td>
                <td>{s.name ?? '—'}</td>
                <td>{s.kategori_lokasi ?? '—'}</td>
                <td className="font-mono whitespace-nowrap">{s.ip_address ?? '—'}</td>
                <td className="font-mono whitespace-nowrap">{s.gateway ?? '—'}</td>
                <td>{s.provinsi ?? '—'}</td>
                <td>{s.kabupaten ?? '—'}</td>
                <td>{s.kecamatan ?? '—'}</td>
                <td>{s.cluster ?? '—'}</td>
                <td>{s.desa ?? '—'}</td>
                <td>{s.hub ?? '—'}</td>
                <td>{s.beam ?? '—'}</td>
                <td className="text-right tabular-nums whitespace-nowrap">{s.longitude ?? '—'}</td>
                <td className="text-right tabular-nums whitespace-nowrap">{s.latitude ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {search.trim()
          ? `${filtered.length.toLocaleString('id-ID')} hasil`
          : `${sites.length.toLocaleString('id-ID')} site`}
        {filtered.length > LIST_LIMIT && ` · menampilkan ${LIST_LIMIT} teratas`}
      </p>
    </div>
  );
}
