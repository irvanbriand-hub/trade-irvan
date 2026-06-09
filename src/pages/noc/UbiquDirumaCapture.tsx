// Route capture untuk /diruma (Telegram): render PNG top-10 NON-HTB.
// Di-screenshot oleh Puppeteer via api/telegram-webhook.ts (waitSelector
// #ubiqu-capture-ready). Pola mirror NOCRtgsCapture.tsx.

import { useEffect, useState } from 'react';
import type { DatasetRow, UbiquEdit } from '@/features/ubiqu-diruma/lib/types';
import { CAPTURE_TOP_N } from '@/features/ubiqu-diruma/lib/types';
import {
  loadDataset,
  loadEdits,
  loadHtbOverride,
} from '@/features/ubiqu-diruma/lib/queries';
import { UbiquCaptureView } from '@/features/ubiqu-diruma/components/CaptureView';

// ─── Date helpers (WIB) ──────────────────────────────────────────────────────
function getWIBNow(): Date {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}
function formatWIBDate(): string {
  const d = getWIBNow();
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(
    d.getUTCMonth() + 1,
  ).padStart(2, '0')}/${d.getUTCFullYear()}`;
}
function formatWIBTime(): string {
  const d = getWIBNow();
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(
    d.getUTCMinutes(),
  ).padStart(2, '0')}`;
}

export default function UbiquDirumaCapture() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [edits, setEdits] = useState<UbiquEdit[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [ds, ed, ovr] = await Promise.all([
          loadDataset(), // sudah order dur_days desc
          loadEdits(),
          loadHtbOverride(),
        ]);
        if (cancelled) return;
        const overrideSet = new Set(ovr);
        // NON-HTB efektif = htb_label NON HTB DAN tidak di-override jadi HTB.
        const nonHtb = ds.filter(
          (r) => r.htb_label === 'NON HTB' && !overrideSet.has(r.ticket_id),
        );
        setRows(nonHtb.slice(0, CAPTURE_TOP_N));
        setEdits(ed);
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
        setReady(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div
        id="ubiqu-capture-loading"
        style={{ padding: '20px', fontFamily: 'Arial, sans-serif', color: '#333' }}
      >
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div
        id="ubiqu-capture-ready"
        style={{
          width: '1600px',
          padding: '40px',
          backgroundColor: '#ffffff',
          fontFamily: 'Arial, sans-serif',
          textAlign: 'center',
          color: '#dc2626',
          fontSize: '18px',
        }}
      >
        ⚠️ {error}
      </div>
    );
  }

  return (
    <UbiquCaptureView
      rows={rows}
      edits={edits}
      dateLabel={formatWIBDate()}
      timeLabel={formatWIBTime()}
    />
  );
}
