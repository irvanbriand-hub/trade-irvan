import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { fetchSiteMaster, type SiteMaster } from '@/lib/noc/siteMasterQueries';
import { usePOList } from '@/lib/noc/hooks/usePOList';
import { LocationListSheet } from './LocationListSheet';
import type { TTRecordDB } from '@/lib/noc/types';

export type MindTone = 'primary' | 'danger' | 'green' | 'orange' | 'amber' | 'red' | 'blue' | 'violet' | 'slate';

export interface MindNode {
  id: string;
  label: string;
  sub: string;
  count: number;
  tone: MindTone;
  rows?: TTRecordDB[]; // daftar tiket yang diwakili node ini (untuk drawer)
  children?: MindNode[];
}

const TONE: Record<MindTone, { pill: string; stroke: string }> = {
  primary: { pill: 'bg-primary text-primary-foreground border-transparent shadow-primary/20', stroke: 'hsl(var(--primary))' },
  danger: { pill: 'bg-red-600 text-white border-transparent shadow-red-500/25', stroke: 'rgb(239 68 68)' },
  green: { pill: 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400', stroke: 'rgb(34 197 94)' },
  orange: { pill: 'bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-400', stroke: 'rgb(249 115 22)' },
  amber: { pill: 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400', stroke: 'rgb(245 158 11)' },
  red: { pill: 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400', stroke: 'rgb(239 68 68)' },
  blue: { pill: 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400', stroke: 'rgb(59 130 246)' },
  violet: { pill: 'bg-violet-500/10 border-violet-500/30 text-violet-700 dark:text-violet-400', stroke: 'rgb(139 92 246)' },
  slate: { pill: 'bg-slate-500/10 border-slate-500/30 text-slate-700 dark:text-slate-300', stroke: 'rgb(100 116 139)' },
};

function collectEdges(node: MindNode, acc: { from: string; to: string; tone: MindTone }[] = []) {
  for (const ch of node.children ?? []) {
    acc.push({ from: node.id, to: ch.id, tone: ch.tone });
    collectEdges(ch, acc);
  }
  return acc;
}

function signature(node: MindNode): string {
  return `${node.id}:${node.count}(${(node.children ?? []).map(signature).join(',')})`;
}

interface TicketMindmapProps {
  title: string;
  subtitle?: string;
  root: MindNode;
  /** Total pembanding untuk persentase di drawer (mis. total open / closed / semua TT). */
  total?: number;
}

export function TicketMindmap({ title, subtitle, root, total }: TicketMindmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLElement | null>>({});
  const [paths, setPaths] = useState<{ d: string; stroke: string }[]>([]);
  const [selected, setSelected] = useState<{ label: string; desc?: string; rows: TTRecordDB[] } | null>(null);
  const sig = signature(root);

  const { data: sites = [] } = useQuery({ queryKey: ['noc', 'site_master', 'list'], queryFn: fetchSiteMaster });
  const { data: poList = [] } = usePOList();
  const siteById = useMemo(() => {
    const m = new Map<string, SiteMaster>();
    for (const s of sites) if (s.site_id) m.set(s.site_id, s);
    return m;
  }, [sites]);

  useLayoutEffect(() => {
    const compute = () => {
      const c = containerRef.current;
      if (!c) return;
      const cRect = c.getBoundingClientRect();
      const next = collectEdges(root)
        .map(({ from, to, tone }) => {
          const p = nodeRefs.current[from];
          const ch = nodeRefs.current[to];
          if (!p || !ch) return null;
          const pr = p.getBoundingClientRect();
          const chr = ch.getBoundingClientRect();
          const x1 = pr.right - cRect.left;
          const y1 = pr.top + pr.height / 2 - cRect.top;
          const x2 = chr.left - cRect.left;
          const y2 = chr.top + chr.height / 2 - cRect.top;
          const mx = (x1 + x2) / 2;
          return { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, stroke: TONE[tone].stroke };
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

  const setRef = (id: string) => (el: HTMLElement | null) => {
    nodeRefs.current[id] = el;
  };
  const onSelect = (node: MindNode) => {
    if (node.rows) setSelected({ label: node.label, desc: node.sub || undefined, rows: node.rows });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto pb-2">
          <div ref={containerRef} className="relative inline-flex items-center min-w-max py-4 pr-4">
            <svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none">
              {paths.map((p, i) => (
                <path key={i} d={p.d} stroke={p.stroke} strokeWidth={2} strokeOpacity={0.55} />
              ))}
            </svg>
            <Branch node={root} depth={0} setRef={setRef} onSelect={onSelect} />
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
          total={total ?? root.count}
        />
      </CardContent>
    </Card>
  );
}

interface BranchProps {
  node: MindNode;
  depth: number;
  setRef: (id: string) => (el: HTMLElement | null) => void;
  onSelect: (node: MindNode) => void;
}

function Branch({ node, depth, setRef, onSelect }: BranchProps) {
  const hasChildren = !!node.children?.length;
  return (
    <div className="flex items-center">
      <Pill node={node} lg={depth === 0} setRef={setRef} onSelect={onSelect} />
      {hasChildren && (
        <>
          <span className="w-14 flex-shrink-0" />
          <div className={cn('flex flex-col', depth === 0 ? 'gap-8' : 'gap-4')}>
            {node.children!.map((ch) => (
              <Branch key={ch.id} node={ch} depth={depth + 1} setRef={setRef} onSelect={onSelect} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface PillProps {
  node: MindNode;
  lg?: boolean;
  setRef: (id: string) => (el: HTMLElement | null) => void;
  onSelect: (node: MindNode) => void;
}

function Pill({ node, lg, setRef, onSelect }: PillProps) {
  const clickable = !!node.rows;
  const className = cn(
    'relative z-10 flex-shrink-0 rounded-xl border shadow-sm text-left transition-all',
    TONE[node.tone].pill,
    lg ? 'px-5 py-4 min-w-[120px]' : 'px-4 py-3 min-w-[112px]',
    node.count === 0 && node.tone !== 'primary' && node.tone !== 'danger' && 'opacity-55',
    clickable &&
      'cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-ring/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  );
  const inner = (
    <>
      <div className={cn('font-semibold leading-tight', lg ? 'text-sm' : 'text-xs')}>{node.label}</div>
      <div className={cn('font-bold tabular-nums leading-none mt-1.5', lg ? 'text-3xl' : 'text-2xl')}>{node.count}</div>
      {node.sub && (
        <div className={cn('mt-1 leading-none', lg ? 'text-[11px] opacity-80' : 'text-[10px] opacity-70')}>{node.sub}</div>
      )}
    </>
  );

  if (clickable) {
    return (
      <button type="button" ref={setRef(node.id)} onClick={() => onSelect(node)} title="Klik untuk lihat daftar lokasi" className={className}>
        {inner}
      </button>
    );
  }
  return (
    <div ref={setRef(node.id)} className={className}>
      {inner}
    </div>
  );
}
