import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Save } from 'lucide-react';

const PLACEHOLDERS = [
  { key: '{HARI}', desc: 'Nama hari (Senin, Selasa, ...)' },
  { key: '{TANGGAL}', desc: 'Tanggal lengkap (18 April 2026)' },
  { key: '{TOTAL_TT}', desc: 'Total tiket (open + closed)' },
  { key: '{OPEN_LT30}', desc: 'Tiket aging < 30 hari' },
  { key: '{OPEN_GT30}', desc: 'Tiket aging 30–59 hari' },
  { key: '{OPEN_GT60}', desc: 'Tiket aging ≥ 60 hari' },
  { key: '{NEW_OPEN}', desc: 'TT hari ini (down_time = 1)' },
  { key: '{CLOSED_KEMARIN}', desc: 'Total closed dari snapshot kemarin' },
];

export default function NocSettings() {
  const { toast } = useToast();
  const [template, setTemplate] = useState('');
  const [initial, setInitial] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from('bot_templates' as any)
        .select('template_text')
        .eq('template_key', 'rekap_pagi')
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        toast({ title: 'Gagal load template', description: error.message, variant: 'destructive' });
      } else if (data) {
        const text = (data as any).template_text ?? '';
        setTemplate(text);
        setInitial(text);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase
      .from('bot_templates' as any)
      .update({ template_text: template, updated_at: new Date().toISOString() })
      .eq('template_key', 'rekap_pagi');
    setSaving(false);

    if (error) {
      toast({ title: 'Gagal menyimpan', description: error.message, variant: 'destructive' });
      return;
    }
    setInitial(template);
    toast({ title: 'Template disimpan' });
  }

  const dirty = template !== initial;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Template Rekap Pagi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              Placeholder yang tersedia:
            </div>
            <div className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
              {PLACEHOLDERS.map((p) => (
                <div key={p.key} className="flex gap-2">
                  <code className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px]">
                    {p.key}
                  </code>
                  <span className="text-muted-foreground">{p.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading template...
            </div>
          ) : (
            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={20}
              className="font-mono text-sm"
              placeholder="Template rekap pagi..."
            />
          )}

          <div className="flex items-center justify-end gap-2">
            {dirty && (
              <span className="text-xs text-muted-foreground">Ada perubahan belum disimpan</span>
            )}
            <Button
              onClick={handleSave}
              disabled={loading || saving || !dirty}
              size="sm"
              className="gap-1.5"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Simpan Template
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
