import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import FormulaEditor from "@/components/research/FormulaEditor";
import ScanProgress, { type ScanResult } from "@/components/research/ScanProgress";
import ScanResults from "@/components/research/ScanResults";
import BacktestConfig, { type BacktestConfigData } from "@/components/research/BacktestConfig";
import ParameterConfig, { type ParamItem } from "@/components/research/ParameterConfig";
import AnalysisResults from "@/components/research/AnalysisResults";
import SessionManager from "@/components/research/SessionManager";
import { format } from "date-fns";

const LS_KEY = "research_formula_draft";

const STEPS = [
  { num: 1, label: "Formula" },
  { num: 2, label: "Scan" },
  { num: 3, label: "Hasil" },
  { num: 4, label: "Metode" },
  { num: 5, label: "Parameter" },
  { num: 6, label: "Analisa" },
  { num: 7, label: "Simpan" },
];

export default function ResearchScreener() {
  const [mainTab, setMainTab] = useState<"research" | "saved">("research");
  const [step, setStep] = useState(1);
  const [formula, setFormula] = useState(() => localStorage.getItem(LS_KEY) || "");
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scanTime, setScanTime] = useState("");
  const [scanDataDate, setScanDataDate] = useState<string | undefined>();
  const [screeningDate, setScreeningDate] = useState<string | undefined>();
  const [backtestConfig, setBacktestConfig] = useState<BacktestConfigData | null>(null);
  const [selectedParams, setSelectedParams] = useState<ParamItem[]>([]);
  const [pendingSummary, setPendingSummary] = useState<any>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Persist formula to localStorage
  useEffect(() => {
    if (formula) localStorage.setItem(LS_KEY, formula);
  }, [formula]);

  const handleFormulaValidated = (f: string) => {
    setFormula(f);
    localStorage.setItem(LS_KEY, f);
    setStep(2);
  };

  const handleScanComplete = (results: ScanResult[], dataDate?: string) => {
    setScanResults(results);
    setScanTime(format(new Date(), "dd/MM/yyyy HH:mm:ss"));
    setScanDataDate(dataDate);
    setStep(3);
  };

  const handleBacktestConfig = (config: BacktestConfigData) => {
    setBacktestConfig(config);
    setStep(5);
  };

  const handleParamsSelected = (params: ParamItem[]) => {
    setSelectedParams(params);
    setStep(6);
  };

  const handleSaveSummary = (summary: any) => {
    setPendingSummary(summary);
    setStep(7);
  };

  const handleReset = () => {
    setFormula("");
    localStorage.removeItem(LS_KEY);
    setScanResults([]);
    setScanTime("");
    setScanDataDate(undefined);
    setScreeningDate(undefined);
    setBacktestConfig(null);
    setSelectedParams([]);
    setPendingSummary(null);
    setStep(1);
    setShowResetConfirm(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">🔬 Research Screener</h1>
          <p className="text-xs text-muted-foreground">Buat formula custom, scan pasar, dan analisa historis</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowResetConfirm(true)} className="text-xs">
          🔄 Reset
        </Button>
      </div>

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as any)}>
        <TabsList>
          <TabsTrigger value="research" className="text-xs">🔬 Research</TabsTrigger>
          <TabsTrigger value="saved" className="text-xs">📊 Saved Backtest</TabsTrigger>
        </TabsList>

        <TabsContent value="research" className="space-y-4">
          {/* Stepper */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {STEPS.map((s) => (
              <button
                key={s.num}
                onClick={() => { if (s.num < step) setStep(s.num); }}
                disabled={s.num > step}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 ${
                  s.num === step
                    ? "bg-primary text-primary-foreground"
                    : s.num < step
                    ? "bg-primary/10 text-primary cursor-pointer hover:bg-primary/20"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-background/20 flex items-center justify-center text-[10px] font-bold">
                  {s.num < step ? "✓" : s.num}
                </span>
                {s.label}
              </button>
            ))}
          </div>

          {/* Step Content */}
          {step === 1 && <FormulaEditor onValidated={handleFormulaValidated} initialFormula={formula} />}

          {step === 2 && (
            <ScanProgress
              formula={formula}
              screeningDate={screeningDate}
              onScreeningDateChange={setScreeningDate}
              onComplete={handleScanComplete}
              onCancel={() => setStep(1)}
            />
          )}

          {step === 3 && (
            <ScanResults
              results={scanResults}
              formula={formula}
              scanTime={scanTime}
              dataDate={scanDataDate}
              onProceed={() => setStep(4)}
              onBack={() => setStep(1)}
            />
          )}

          {step === 4 && (
            <BacktestConfig
              onProceed={handleBacktestConfig}
              onBack={() => setStep(3)}
            />
          )}

          {step === 5 && (
            <ParameterConfig
              onProceed={handleParamsSelected}
              onBack={() => setStep(4)}
            />
          )}

          {step === 6 && backtestConfig && (
            <AnalysisResults
              formula={formula}
              scanResults={scanResults}
              config={backtestConfig}
              params={selectedParams}
              onSave={handleSaveSummary}
              onBack={() => setStep(5)}
            />
          )}

          {step === 7 && (
            <SessionManager
              pendingSummary={pendingSummary}
              formula={formula}
              screeningDate={scanDataDate}
            />
          )}
        </TabsContent>

        <TabsContent value="saved">
          <SessionManager
            onViewSession={(s) => {
              setMainTab("research");
              setPendingSummary(s.hasil_summary);
              setStep(7);
            }}
            onRerun={(s) => {
              setFormula(s.formula);
              setMainTab("research");
              setStep(2);
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Reset Confirmation Dialog */}
      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>🔄 Reset semua step?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Formula, hasil scan, dan analisa akan dihapus. Semua progress akan kembali ke Step 1.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetConfirm(false)}>Batal</Button>
            <Button variant="destructive" onClick={handleReset}>Reset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
