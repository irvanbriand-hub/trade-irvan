import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export interface ParamItem {
  id: string;
  name: string;
  formula: string;
  isCustom?: boolean;
}

const DEFAULT_PARAMS: ParamItem[] = [
  { id: "pr", name: "PR — Prev Red", formula: "prev_close < prev_open" },
  { id: "v_ma20", name: "V>MA20 — Volume > SMA Vol 20", formula: "volume > sma_vol(20)" },
  { id: "ma_plus", name: "MA+ — MA3>MA5>MA10>MA20", formula: "sma(3) > sma(5) AND sma(5) > sma(10) AND sma(10) > sma(20)" },
  { id: "l_pl", name: "L>PL — Low > Prev Low", formula: "low > prev_low" },
  { id: "h_ph", name: "H>PH — High > Prev High", formula: "high > prev_high" },
  { id: "gap_up", name: "Gap Up — Open > Prev Close", formula: "open > prev_close" },
  { id: "c_vwap", name: "C>VWAP — Close > VWAP", formula: "close > (high + low + close) / 3" },
  { id: "v_ma5", name: "V>MA5 — Volume > SMA Vol 5", formula: "volume > sma_vol(5)" },
];

interface ParameterConfigProps {
  onProceed: (params: ParamItem[]) => void;
  onBack: () => void;
}

export default function ParameterConfig({ onProceed, onBack }: ParameterConfigProps) {
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(DEFAULT_PARAMS.map(p => [p.id, true]))
  );
  const [customParams, setCustomParams] = useState<ParamItem[]>([]);
  const [newName, setNewName] = useState("");
  const [newFormula, setNewFormula] = useState("");

  const toggleParam = (id: string) => {
    setSelected(s => ({ ...s, [id]: !s[id] }));
  };

  const addCustom = () => {
    if (!newName.trim() || !newFormula.trim()) return;
    const id = `custom_${Date.now()}`;
    setCustomParams(c => [...c, { id, name: newName, formula: newFormula, isCustom: true }]);
    setSelected(s => ({ ...s, [id]: true }));
    setNewName("");
    setNewFormula("");
  };

  const removeCustom = (id: string) => {
    setCustomParams(c => c.filter(p => p.id !== id));
    setSelected(s => { const n = { ...s }; delete n[id]; return n; });
  };

  const handleProceed = () => {
    const all = [...DEFAULT_PARAMS, ...customParams];
    const activeParams = all.filter(p => selected[p.id]);
    onProceed(activeParams);
  };

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <h3 className="text-sm font-bold text-foreground">🎛️ Pilih Parameter Korelasi</h3>

      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-bold text-muted-foreground mb-2">PARAMETER DEFAULT (8 parameter)</p>
          {DEFAULT_PARAMS.map(p => (
            <div key={p.id} className="flex items-center gap-3">
              <Checkbox checked={!!selected[p.id]} onCheckedChange={() => toggleParam(p.id)} />
              <div className="flex-1">
                <p className="text-xs font-medium text-foreground">{p.name}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{p.formula}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {customParams.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-bold text-muted-foreground mb-2">PARAMETER CUSTOM</p>
            {customParams.map(p => (
              <div key={p.id} className="flex items-center gap-3">
                <Checkbox checked={!!selected[p.id]} onCheckedChange={() => toggleParam(p.id)} />
                <div className="flex-1">
                  <p className="text-xs font-medium text-foreground">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{p.formula}</p>
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => removeCustom(p.id)}>
                  ✕
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-bold text-muted-foreground mb-2">+ TAMBAH PARAMETER CUSTOM</p>
          <div className="space-y-2">
            <Input placeholder='Nama parameter, contoh: "RSI Oversold"' value={newName} onChange={e => setNewName(e.target.value)} className="text-xs h-8" />
            <Input placeholder='Kondisi boolean, contoh: "rsi < 40"' value={newFormula} onChange={e => setNewFormula(e.target.value)} className="text-xs h-8 font-mono" />
            <Button variant="outline" size="sm" onClick={addCustom} disabled={!newName.trim() || !newFormula.trim()}>
              + Tambah Parameter
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onBack}>← Kembali</Button>
        <Button onClick={handleProceed}>▶ Jalankan Analisa →</Button>
      </div>
    </div>
  );
}
