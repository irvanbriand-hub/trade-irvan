import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TicketMindmap, type MindNode } from './TicketMindmap';
import { fetchSiteMaster } from '@/lib/noc/siteMasterQueries';
import { isPendidikan } from '@/lib/noc/instansi';
import type { TTRecordDB } from '@/lib/noc/types';

interface OpenByKategoriMindmapProps {
  data: TTRecordDB[];
}

const TITLE = 'Peta Tiket Open — Instansi';
const SUBTITLE = 'Pendidikan vs Non-Pendidikan · Overdue = umur > 7 hari';

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{TITLE}</CardTitle>
        <p className="text-xs text-muted-foreground">{SUBTITLE}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function OpenByKategoriMindmap({ data }: OpenByKategoriMindmapProps) {
  const { data: sites = [], isLoading } = useQuery({
    queryKey: ['noc', 'site_master', 'list'],
    queryFn: fetchSiteMaster,
  });

  const kategoriBySite = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sites) if (s.site_id) m.set(s.site_id, s.kategori_lokasi ?? '');
    return m;
  }, [sites]);

  const { root, total } = useMemo(() => {
    const open = data.filter((r) => r.status === 'OPEN');
    const isEdu = (r: TTRecordDB) => isPendidikan((r.site_id && kategoriBySite.get(r.site_id)) || '');

    const group = (id: string, label: string, tone: MindNode['tone'], rows: TTRecordDB[]): MindNode => {
      const over = rows.filter((r) => r.down_time > 7);
      const safe = rows.filter((r) => r.down_time <= 7);
      return {
        id,
        label,
        sub: '',
        count: rows.length,
        rows,
        tone,
        children: [
          { id: `${id}-over`, label: 'Overdue', sub: '> 7 hari', count: over.length, rows: over, tone: 'orange' },
          { id: `${id}-safe`, label: 'Non Overdue', sub: '≤ 7 hari', count: safe.length, rows: safe, tone: 'green' },
        ],
      };
    };

    const node: MindNode = {
      id: 'root',
      label: 'Open TT',
      sub: 'total aktif',
      count: open.length,
      rows: open,
      tone: 'danger',
      children: [
        group('edu', 'Pendidikan', 'blue', open.filter(isEdu)),
        group('non', 'Non Pendidikan', 'violet', open.filter((r) => !isEdu(r))),
      ],
    };
    return { root: node, total: open.length };
  }, [data, kategoriBySite]);

  if (isLoading) {
    return <Frame><div className="py-10 text-center text-sm text-muted-foreground">Memuat kategori…</div></Frame>;
  }
  if (sites.length === 0) {
    return (
      <Frame>
        <div className="py-10 text-center text-sm text-muted-foreground">
          Belum ada master site. Upload data di tab <strong>Datek → Master Site</strong> untuk memetakan kategori.
        </div>
      </Frame>
    );
  }

  return <TicketMindmap title={TITLE} subtitle={SUBTITLE} root={root} total={total} />;
}
