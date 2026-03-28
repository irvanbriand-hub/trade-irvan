import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export interface BacktestMethod {
  id: string;
  label: string;
  description: string;
  defaultThreshold: number;
}

export interface BacktestConfigData {
  methods: { id: string; threshold: number }[];
  period: string;
}

const METHODS: BacktestMethod[] = [
  { id: "bsjp", label: "BSJP — Beli Sore Jual Pagi", description: "Entry = Close Day 0, Exit = High Day 1. WIN jika High >= Close × threshold", defaultThreshold: 2 },
  { id: "swing3", label: "Swing 1-3 hari", description: "Entry = Close Day 0, Exit = High terbaik Day 1-3. WIN jika ada hari tembus threshold", defaultThreshold: 5 },
  { id: "swing5", label: "Swing 1-5 hari", description: "Entry = Close Day 0, Exit = High terbaik Day 1-5. WIN jika ada hari tembus threshold", defaultThreshold: 5 },
];

const PERIODS = [
  { value: "6m", label: "6 Bulan" },
  { value: "1y", label: "1 Tahun" },
  { value: "2y", label: "2 Tahun" },
  { value: "all", label: "Semua Data" },
];

interface BacktestConfigProps {
  onProceed: (config: BacktestConfigData) => void;
  onBack: () => void;
}

export default function BacktestConfig({ onProceed, onBack }: BacktestConfigProps) {
  const [selected, setSelected] = useState<Record<string, boolean>>({ bsjp: true });
  const [thresholds, setThresholds] = useState<Record<string, number>>({ bsjp: 2, swing3: 5, swing5: 5 });
  const [period, setPeriod] = useState("1y");

  const handleToggle = (id: string) => {
    setSelected(s => ({ ...s, [id]: !s[id] }));
  };

  const handleSubmit = () => {
    const methods = METHODS
      .filter(m => selected[m.id])
      .map(m => ({ id: m.id, threshold: thresholds[m.id] || m.defaultThreshold }));
    if (methods.length === 0) return;
    onProceed({ methods, period });
  };

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <h3 className="text-sm font-bold text-foreground">⚙️ Pilih Metode Backtest</h3>

      {METHODS.map((m) => (
        <Card key={m.id} className={`transition-colors ${selected[m.id] ? "border-primary/50 bg-primary/5" : ""}`}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Checkbox checked={!!selected[m.id]} onCheckedChange={() => handleToggle(m.id)} className="mt-0.5" />
              <div className="flex-1 space-y-2">
                <div>
                  <p className="text-sm font-bold text-foreground">{m.label}</p>
                  <p className="text-xs text-muted-foreground">{m.description}</p>
                </div>
                {selected[m.id] && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">WIN threshold:</span>
                    <Input
                      type="number"
                      value={thresholds[m.id]}
                      onChange={(e) => setThresholds(t => ({ ...t, [m.id]: parseFloat(e.target.value) || 0 }))}
                      className="w-20 h-7 text-xs"
                      step={0.5}
                      min={0.5}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-bold text-foreground mb-3">Periode Historis</p>
          <div className="flex flex-wrap gap-2">
            {PERIODS.map(p => (
              <Button
                key={p.value}
                variant={period === p.value ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod(p.value)}
                className="text-xs"
              >
                {p.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onBack}>← Kembali</Button>
        <Button onClick={handleSubmit} disabled={!Object.values(selected).some(Boolean)}>
          Lanjut ke Parameter →
        </Button>
      </div>
    </div>
  );
}
