import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTTRecords } from '@/lib/noc/hooks/useTTRecords';
import { fetchSiteMaster, SITE_MASTER_LIST_QK } from '@/lib/noc/siteMasterQueries';
import { RadialOpenMindmap } from '@/components/noc/RadialOpenMindmap';

/**
 * Halaman capture headless untuk /mindmap Telegram. Render radial "Peta Tiket
 * Open" (3 cabang) di atas putih. Puppeteer screenshot #mindmap-capture-ready.
 */
export default function NocMindmapCapture() {
  // Paksa light theme → hasil capture bersih/putih.
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add('light');
    el.classList.remove('dark');
  }, []);

  const { data: records = [], isLoading: l1 } = useTTRecords();
  // Warm cache site master (dipakai RadialOpenMindmap untuk cabang Instansi).
  const { isLoading: l2 } = useQuery({ queryKey: SITE_MASTER_LIST_QK, queryFn: fetchSiteMaster });

  if (l1 || l2) {
    return (
      <div id="mindmap-capture-loading" style={{ padding: 20, fontFamily: 'Arial, sans-serif', color: '#333' }}>
        Loading…
      </div>
    );
  }

  return (
    <div id="mindmap-capture-ready" style={{ width: '1160px', padding: '20px', backgroundColor: '#ffffff' }}>
      <RadialOpenMindmap data={records} />
    </div>
  );
}
