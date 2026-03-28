import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScreenerStockData } from "@/lib/screenerStore";
import { calcParams, getParamDetails, getParamBadgeColor } from "@/lib/paramCalculator";

interface Props {
  stockData: ScreenerStockData;
  isExpanded: boolean;
  onToggle: () => void;
}

export function ParameterBadge({ stockData, isExpanded, onToggle }: Props) {
  const params = calcParams(stockData);

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className="inline-flex items-center gap-1"
    >
      <Badge
        className={cn(
          "text-[10px] px-1.5 py-0.5 font-mono cursor-pointer transition-colors",
          getParamBadgeColor(params.count)
        )}
      >
        {params.count}/8
        <ChevronDown className={cn("h-2.5 w-2.5 ml-0.5 transition-transform", isExpanded && "rotate-180")} />
      </Badge>
    </button>
  );
}

export function ParameterChecklist({ stockData }: { stockData: ScreenerStockData }) {
  const details = getParamDetails(stockData);

  return (
    <div className="bg-muted/30 border border-border rounded-lg p-3 animate-in slide-in-from-top-2 duration-200">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Parameter Korelasi (Data Insight Tambahan)
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-1 px-2 text-[10px] font-semibold text-muted-foreground">Parameter</th>
              <th className="text-center py-1 px-2 text-[10px] font-semibold text-muted-foreground">Status</th>
              <th className="text-left py-1 px-2 text-[10px] font-semibold text-muted-foreground">Nilai</th>
            </tr>
          </thead>
          <tbody>
            {details.map((d) => (
              <tr key={d.key} className="border-b border-border/30">
                <td className="py-1.5 px-2 font-medium text-foreground">{d.label}</td>
                <td className="py-1.5 px-2 text-center">
                  {d.value ? (
                    <Check className="h-3.5 w-3.5 text-green-500 inline" />
                  ) : (
                    <X className="h-3.5 w-3.5 text-red-400 inline" />
                  )}
                </td>
                <td className="py-1.5 px-2 text-muted-foreground font-mono text-[10px]">{d.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
