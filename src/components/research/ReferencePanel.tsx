import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface ReferenceSectionProps {
  title: string;
  items: string[];
  onInsert: (text: string) => void;
}

function ReferenceSection({ title, items, onInsert }: ReferenceSectionProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
      </button>
      {open && (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {items.map((item) => (
            <button
              key={item}
              onClick={() => onInsert(item)}
              className="px-2 py-0.5 text-xs rounded bg-muted hover:bg-primary/20 hover:text-primary transition-colors font-mono"
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ReferencePanelProps {
  onInsert: (text: string) => void;
}

export default function ReferencePanel({ onInsert }: ReferencePanelProps) {
  const sections = [
    { title: "HARGA & VOLUME", items: ["open", "high", "low", "close", "volume", "value"] },
    { title: "MOVING AVERAGE", items: ["sma(20)", "sma(50)", "sma(200)", "ema(10)", "ema(20)", "ema(50)", "sma_vol(20)", "sma_vol(5)"] },
    { title: "PREV CANDLE", items: ["prev_open", "prev_high", "prev_low", "prev_close", "prev_volume", "prev_2_close", "prev_3_close", "prev_2_high", "prev_2_low"] },
    { title: "BOLLINGER", items: ["bb_top", "bb_mid", "bb_bottom", "bb_bandwidth", "bb_top(20,2)", "bb_bottom(20,2)"] },
    { title: "MACD", items: ["macd", "macd_signal", "macd_histogram", "macd(12,26)", "macd_signal(12,26,9)"] },
    { title: "STOCHASTIC", items: ["stoch_k", "stoch_d", "stoch_k(14,3)", "stoch_d(14,3,3)"] },
    { title: "OSCILLATOR", items: ["rsi", "rsi(14)", "adx", "pdx", "ndx"] },
    { title: "FUNGSI", items: ["hhv(20)", "llv(20)", "cross(a,b)"] },
    { title: "OPERATOR", items: ["AND", "OR", "NOT", ">", "<", ">=", "<=", "==", "!=", "+", "-", "*", "/", "(", ")"] },
  ];

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="px-3 py-2 bg-muted/50 border-b border-border">
        <h3 className="text-xs font-bold text-foreground">📘 Referensi Indikator</h3>
        <p className="text-[10px] text-muted-foreground">Klik untuk insert ke editor</p>
      </div>
      <div className="max-h-[500px] overflow-y-auto">
        {sections.map((s) => (
          <ReferenceSection key={s.title} title={s.title} items={s.items} onInsert={onInsert} />
        ))}
      </div>
    </div>
  );
}
