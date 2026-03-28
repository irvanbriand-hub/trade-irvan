import { TradeForm } from "@/components/journal/TradeForm";
import { TradeHistory } from "@/components/journal/TradeHistory";
import { useEquityToggle, useEquityCalc } from "@/hooks/useEquityToggle";
import { DisplayModeToggle } from "@/components/DisplayModeToggle";

export default function Journal() {
  const { mode, toggle } = useEquityToggle();
  const { formatValue } = useEquityCalc();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Jurnal Trading</h1>
        <DisplayModeToggle mode={mode} onToggle={toggle} />
      </div>
      <TradeForm />
      <TradeHistory displayMode={mode} formatValue={formatValue} />
    </div>
  );
}
