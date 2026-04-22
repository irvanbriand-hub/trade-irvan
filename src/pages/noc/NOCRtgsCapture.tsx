import { useEffect, useState } from 'react';
import {
  getRTGSAnnotations,
  getRTGSTickets,
  type RTGSAnnotation,
} from '@/lib/noc/rtgsQueries';
import type { TTRecordDB } from '@/lib/noc/types';
import { RTGSCaptureView } from '@/components/noc/RTGSCaptureView';

// ─── Date helpers (WIB) ──────────────────────────────────────────────────────

function getWIBNow(): Date {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

function formatWIBDate(): string {
  const d = getWIBNow();
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = d.getUTCFullYear();
  return `${dd}/${mm}/${yy}`;
}

function formatWIBTime(): string {
  const d = getWIBNow();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function NOCRtgsCapture() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<TTRecordDB[]>([]);
  const [annotations, setAnnotations] = useState<RTGSAnnotation[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [tts, anns] = await Promise.all([
          getRTGSTickets(),
          getRTGSAnnotations(),
        ]);
        if (cancelled) return;
        setRecords(tts);
        setAnnotations(anns);
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
        id="rtgs-capture-loading"
        style={{ padding: '20px', fontFamily: 'Arial, sans-serif', color: '#333' }}
      >
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div
        id="rtgs-capture-ready"
        style={{
          width: '1400px',
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
    <RTGSCaptureView
      records={records}
      annotations={annotations}
      dateLabel={formatWIBDate()}
      timeLabel={formatWIBTime()}
    />
  );
}
