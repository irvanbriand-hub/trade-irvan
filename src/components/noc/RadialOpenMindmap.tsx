import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { fetchSiteMaster, type SiteMaster } from '@/lib/noc/siteMasterQueries';
import { usePOList } from '@/lib/noc/hooks/usePOList';
import { isPendidikan } from '@/lib/noc/instansi';
import { LocationListSheet } from './LocationListSheet';
import { AREA_MAP, AREA_NAMES } from '@/lib/noc/constants';
import type { TTRecordDB } from '@/lib/noc/types';

interface RadialOpenMindmapProps {
  data: TTRecordDB[];
}

type Tone = 'green' | 'orange' | 'blue' | 'violet' | 'amber' | 'red' | 'slate';
type Dir = 'left' | 'right' | 'bottom';

const TONE: Record<Tone, { pill: string; stroke: string }> = {
  green: { pill: 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400', stroke: 'rgb(34 197 94)' },
  orange: { pill: 'bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-400', stroke: 'rgb(249 115 22)' },
  blue: { pill: 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400', stroke: 'rgb(59 130 246)' },
  violet: { pill: 'bg-violet-500/10 border-violet-500/30 text-violet-700 dark:text-violet-400', stroke: 'rgb(139 92 246)' },
  amber: { pill: 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400', stroke: 'rgb(245 158 11)' },
  red: { pill: 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400', stroke: 'rgb(239 68 68)' },
  slate: { pill: 'bg-slate-500/10 border-slate-500/30 text-slate-700 dark:text-slate-300', stroke: 'rgb(100 116 139)' },
};

const AREA_TONE: Record<number, Tone> = { 1: 'blue', 2: 'violet', 3: 'orange', 0: 'slate' };

function getArea(provinsi: string | null): 0 | 1 | 2 | 3 {
  const a = AREA_MAP[(provinsi ?? '').toUpperCase()];
  return (a === 1 || a === 2 || a === 3 ? a : 0) as 0 | 1 | 2 | 3;
}

// Timestamp WIB (dd/MM/yyyy HH:mm) untuk header laporan.
function wibStamp(): string {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} WIB`;
}

interface RNode {
  id: string;
  label: string;
  count: number;
  rows: TTRecordDB[];
  tone: Tone;
  desc?: string;
  children?: RNode[];
}

// Border lensa PERMANEN (ikut kebaca saat capture PNG ke Telegram).
const LENS = 'rounded-2xl border border-border/60 bg-muted/20 p-4';

export function RadialOpenMindmap({ data }: RadialOpenMindmapProps) {
  const { data: sites = [] } = useQuery({
    queryKey: ['noc', 'site_master', 'list'],
    queryFn: fetchSiteMaster,
  });

  const kategoriBySite = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sites) if (s.site_id) m.set(s.site_id, s.kategori_lokasi ?? '');
    return m;
  }, [sites]);

  const siteById = useMemo(() => {
    const m = new Map<string, SiteMaster>();
    for (const s of sites) if (s.site_id) m.set(s.site_id, s);
    return m;
  }, [sites]);

  const { data: poList = [] } = usePOList();
  const [selected, setSelected] = useState<{ label: string; desc?: string; rows: TTRecordDB[] } | null>(null);

  const { total, openRows, left, right, bottom } = useMemo(() => {
    const open = data.filter((r) => r.status === 'OPEN');
    const isEdu = (r: TTRecordDB) => isPendidikan((r.site_id && kategoriBySite.get(r.site_id)) || '');
    const over = (r: TTRecordDB) => r.down_time > 7;

    const overdue = open.filter(over);
    const warnRows = overdue.filter((r) => r.down_time <= 10);
    const critRows = overdue.filter((r) => r.down_time >= 11);
    const safeRows = open.filter((r) => !over(r));

    const eduRows = open.filter(isEdu);
    const nonRows = open.filter((r) => !isEdu(r));

    const areaNode = (a: 0 | 1 | 2 | 3): RNode => {
      const sub = open.filter((r) => getArea(r.provinsi) === a);
      const lt3 = sub.filter((r) => r.down_time < 3);
      const gte3 = sub.filter((r) => r.down_time >= 3);
      return {
        id: `a${a}`,
        label: a === 0 ? 'Tak Terpetakan' : `Area ${a}`,
        count: sub.length,
        rows: sub,
        tone: AREA_TONE[a],
        desc: a === 0 ? 'Provinsi belum terpetakan ke area' : `Open TT di ${AREA_NAMES[a]}`,
        children: [
          { id: `a${a}-lt3`, label: '< 3 hari', count: lt3.length, rows: lt3, tone: 'amber', desc: 'Open umur < 3 hari' },
          { id: `a${a}-gte3`, label: '≥ 3 hari', count: gte3.length, rows: gte3, tone: 'red', desc: 'Open umur ≥ 3 hari' },
        ],
      };
    };

    const instansi = (id: string, label: string, tone: Tone, desc: string, rows: TTRecordDB[]): RNode => {
      const oRows = rows.filter(over);
      const sRows = rows.filter((r) => !over(r));
      return {
        id,
        label,
        count: rows.length,
        rows,
        tone,
        desc,
        children: [
          { id: `${id}-over`, label: 'Overdue', count: oRows.length, rows: oRows, tone: 'orange', desc: `${label}, umur > 7 hari` },
          { id: `${id}-safe`, label: 'Non Overdue', count: sRows.length, rows: sRows, tone: 'green', desc: `${label}, umur ≤ 7 hari` },
        ],
      };
    };

    // Pecah satu set tiket per area (Area 1/2/3 + Tak Terpetakan bila ada).
    const areaBreakdown = (idPrefix: string, rows: TTRecordDB[]): RNode[] =>
      ([1, 2, 3, 0] as const)
        .map((a) => ({ a, sub: rows.filter((r) => getArea(r.provinsi) === a) }))
        .filter(({ a, sub }) => a !== 0 || sub.length > 0)
        .map(({ a, sub }) => ({
          id: `${idPrefix}-a${a}`,
          label: a === 0 ? 'Tak Terpetakan' : `Area ${a}`,
          count: sub.length,
          rows: sub,
          tone: AREA_TONE[a],
          desc: a === 0 ? 'Provinsi belum terpetakan ke area' : AREA_NAMES[a],
        }));

    const areas = ([1, 2, 3, 0] as const).filter((a) => a !== 0 || open.some((r) => getArea(r.provinsi) === 0));

    return {
      total: open.length,
      openRows: open,
      left: [
        {
          id: 'over',
          label: 'Overdue',
          count: overdue.length,
          rows: overdue,
          tone: 'orange' as Tone,
          desc: 'Open umur > 7 hari (lewat SLA)',
          children: [
            {
              id: 'over-warn',
              label: '8–10 hari',
              count: warnRows.length,
              rows: warnRows,
              tone: 'amber' as Tone,
              desc: 'Overdue 8–10 hari',
              children: areaBreakdown('over-warn', warnRows),
            },
            {
              id: 'over-crit',
              label: '> 10 hari',
              count: critRows.length,
              rows: critRows,
              tone: 'red' as Tone,
              desc: 'Overdue kritis, > 10 hari',
              children: areaBreakdown('over-crit', critRows),
            },
          ],
        },
        { id: 'safe', label: 'Non Overdue', count: safeRows.length, rows: safeRows, tone: 'green' as Tone, desc: 'Open umur ≤ 7 hari (masih dalam SLA)' },
      ] as RNode[],
      right: [
        instansi('edu', 'Pendidikan', 'blue', 'Site kategori pendidikan (sekolah/madrasah/pesantren/kampus/dll)', eduRows),
        instansi('non', 'Non Pendidikan', 'violet', 'Site non-pendidikan / belum terkategori di master', nonRows),
      ] as RNode[],
      bottom: areas.map(areaNode) as RNode[],
    };
  }, [data, kategoriBySite]);

  const edges = useMemo(() => {
    const es: { from: string; to: string; dir: Dir; tone: Tone }[] = [];
    const walk = (node: RNode, dir: Dir) => {
      for (const ch of node.children ?? []) {
        es.push({ from: node.id, to: ch.id, dir, tone: ch.tone });
        walk(ch, dir);
      }
    };
    const addArm = (arm: RNode[], dir: Dir) => {
      for (const n of arm) {
        es.push({ from: 'center', to: n.id, dir, tone: n.tone });
        walk(n, dir);
      }
    };
    addArm(left, 'left');
    addArm(right, 'right');
    addArm(bottom, 'bottom');
    return es;
  }, [left, right, bottom]);

  const containerRef = useRef<HTMLDivElement>(null);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const [paths, setPaths] = useState<{ d: string; stroke: string }[]>([]);
  const flatAll = (nodes: RNode[]): RNode[] => nodes.flatMap((n) => [n, ...flatAll(n.children ?? [])]);
  const sig = `${total}|` + flatAll([...left, ...right, ...bottom]).map((n) => `${n.id}:${n.count}`).join(',');

  useLayoutEffect(() => {
    const compute = () => {
      const c = containerRef.current;
      if (!c) return;
      const cRect = c.getBoundingClientRect();
      const next = edges
        .map(({ from, to, dir, tone }) => {
          const f = refs.current[from];
          const t = refs.current[to];
          if (!f || !t) return null;
          const fr = f.getBoundingClientRect();
          const tr = t.getBoundingClientRect();
          const L = (x: number) => x - cRect.left;
          const T = (y: number) => y - cRect.top;
          let d = '';
          if (dir === 'left') {
            const x1 = L(fr.left), y1 = T((fr.top + fr.bottom) / 2);
            const x2 = L(tr.right), y2 = T((tr.top + tr.bottom) / 2);
            const mx = (x1 + x2) / 2;
            d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
          } else if (dir === 'right') {
            const x1 = L(fr.right), y1 = T((fr.top + fr.bottom) / 2);
            const x2 = L(tr.left), y2 = T((tr.top + tr.bottom) / 2);
            const mx = (x1 + x2) / 2;
            d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
          } else {
            const x1 = L((fr.left + fr.right) / 2), y1 = T(fr.bottom);
            const x2 = L((tr.left + tr.right) / 2), y2 = T(tr.top);
            const my = (y1 + y2) / 2;
            d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
          }
          return { d, stroke: TONE[tone].stroke };
        })
        .filter(Boolean) as { d: string; stroke: string }[];
      setPaths(next);
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const setRef = (id: string) => (el: HTMLElement | null) => {
    refs.current[id] = el;
  };
  const openList = (n: { label: string; desc?: string; rows: TTRecordDB[] }) =>
    setSelected({ label: n.label, desc: n.desc, rows: n.rows });

  const Pill = ({ n, size }: { n: RNode; size: 'main' | 'child' }) => (
    <button
      type="button"
      ref={setRef(n.id)}
      onClick={() => openList(n)}
      title={`${n.label}${n.desc ? ` — ${n.desc}` : ''}\n${n.count} dari ${total} open (${pct(n.count)}%)\nKlik untuk lihat daftar lokasi`}
      className={cn(
        'relative z-10 flex-shrink-0 cursor-pointer rounded-xl border shadow-sm text-center transition-all',
        'hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-ring/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        TONE[n.tone].pill,
        size === 'main' ? 'px-4 py-2.5' : 'px-3 py-2',
        n.count === 0 && 'opacity-55',
      )}
    >
      <div className={cn('font-semibold leading-tight whitespace-nowrap', size === 'main' ? 'text-xs' : 'text-[11px]')}>
        {n.label}
      </div>
      <div className={cn('font-bold tabular-nums leading-none mt-1', size === 'main' ? 'text-2xl' : 'text-xl')}>
        {n.count}
      </div>
    </button>
  );

  // Lensa: border permanen + judul seragam di pojok kiri-atas.
  const Lens = ({ title, contentClass, children }: { title: string; contentClass: string; children: ReactNode }) => (
    <div className={cn(LENS, 'relative')}>
      <span className="absolute left-4 top-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </span>
      <div className={cn('pt-6', contentClass)}>{children}</div>
    </div>
  );

  // Cabang kiri (Aging) — rekursif, mengalir ke kiri (mendukung kedalaman area).
  const LeftBranch = ({ node, depth }: { node: RNode; depth: number }) => (
    <div className="flex flex-row-reverse items-center gap-x-8">
      <Pill n={node} size={depth === 0 ? 'main' : 'child'} />
      {node.children && node.children.length > 0 && (
        <div className="flex flex-col items-end gap-3">
          {node.children.map((ch) => (
            <LeftBranch key={ch.id} node={ch} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold">Pemetaan Tiket Open Aktif</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Aging · Instansi · Area</p>
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5">{wibStamp()}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div ref={containerRef} className="relative mx-auto w-full min-w-[960px] max-w-[1280px] px-4 py-6">
            <svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none">
              {paths.map((p, i) => (
                <path key={i} d={p.d} stroke={p.stroke} strokeWidth={2} strokeOpacity={0.55} />
              ))}
            </svg>

            {/* Baris tengah: Aging (kiri) — Center — Instansi (kanan). Grid 1fr auto 1fr
                → pusat benar-benar di tengah, arm simetris. */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-8">
              <div className="justify-self-end">
                <Lens title="Aging" contentClass="flex flex-col items-end gap-5">
                  {left.map((n) => (
                    <LeftBranch key={n.id} node={n} depth={0} />
                  ))}
                </Lens>
              </div>

              <button
                type="button"
                ref={setRef('center')}
                onClick={() => openList({ label: 'Open TT', desc: 'Semua tiket open aktif', rows: openRows })}
                title={`Open TT — total tiket open aktif\n${total} tiket\nKlik untuk lihat daftar lokasi`}
                className="relative z-10 cursor-pointer rounded-2xl bg-red-600 px-6 py-4 text-center text-white shadow-lg shadow-red-500/25 transition-all hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="text-xs font-semibold opacity-90">Open TT</div>
                <div className="text-4xl font-bold tabular-nums leading-none mt-1">{total}</div>
              </button>

              <div className="justify-self-start">
                <Lens title="Instansi" contentClass="flex flex-col items-start gap-5">
                  {right.map((n) => (
                    <div key={n.id} className="flex items-center gap-x-8">
                      <Pill n={n} size="main" />
                      {n.children && (
                        <div className="flex flex-col items-start gap-3">
                          {n.children.map((ch) => <Pill key={ch.id} n={ch} size="child" />)}
                        </div>
                      )}
                    </div>
                  ))}
                </Lens>
              </div>
            </div>

            {/* Baris bawah: Area — center di bawah pusat */}
            <div className="mt-12 flex justify-center">
              <Lens title="Area" contentClass="flex flex-wrap justify-center gap-8">
                {bottom.map((n) => (
                  <div key={n.id} className="flex flex-col items-center gap-y-7">
                    <Pill n={n} size="main" />
                    {n.children && (
                      <div className="flex gap-3">
                        {n.children.map((ch) => <Pill key={ch.id} n={ch} size="child" />)}
                      </div>
                    )}
                  </div>
                ))}
              </Lens>
            </div>
          </div>
        </div>

        <LocationListSheet
          open={!!selected}
          onOpenChange={(o) => {
            if (!o) setSelected(null);
          }}
          title={selected?.label ?? ''}
          desc={selected?.desc}
          rows={selected?.rows ?? []}
          siteById={siteById}
          poList={poList}
          total={total}
        />
      </CardContent>
    </Card>
  );
}
