import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { highlightFormula, validateFormula, type ParseError } from "@/lib/formulaParser";
import { useCustomFormulas, useSaveFormula, useDeleteFormula, useUpdateFormula } from "@/hooks/useResearchScreener";
import { format } from "date-fns";
import { toast } from "sonner";
import ReferencePanel from "./ReferencePanel";

interface FormulaEditorProps {
  onValidated: (formula: string) => void;
  initialFormula?: string;
}

export default function FormulaEditor({ onValidated, initialFormula }: FormulaEditorProps) {
  const [formula, setFormula] = useState(initialFormula || "");
  const [errors, setErrors] = useState<ParseError[]>([]);
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const { data: formulas } = useCustomFormulas();
  const saveFormula = useSaveFormula();
  const deleteFormula = useDeleteFormula();
  const updateFormula = useUpdateFormula();

  const handleInsert = useCallback((text: string) => {
    const ta = textareaRef.current;
    if (!ta) { setFormula(f => f + text); return; }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = formula.slice(0, start);
    const after = formula.slice(end);
    const newFormula = before + text + after;
    setFormula(newFormula);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + text.length;
    }, 0);
  }, [formula]);

  const handleValidate = () => {
    const result = validateFormula(formula);
    setErrors(result.errors);
    if (result.valid) {
      toast.success("✅ Formula valid!");
      onValidated(formula);
    }
  };

  const handleSave = () => {
    if (!saveName.trim()) return;
    saveFormula.mutate({ nama: saveName, formula }, {
      onSuccess: () => { toast.success("Formula disimpan!"); setShowSave(false); setSaveName(""); },
    });
  };

  const handleLoad = (f: { id: string; formula: string }) => {
    setFormula(f.formula);
    setErrors([]);
    updateFormula.mutate({ id: f.id });
    toast.success("Formula dimuat!");
  };

  const lines = formula.split("\n");
  const errorLines = new Set(errors.map(e => e.line));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Editor - 60% */}
        <div className="lg:col-span-3 space-y-3">
          <div className="border border-border rounded-lg overflow-hidden bg-[hsl(var(--card))]">
            {/* Highlighted overlay + textarea */}
            <div className="relative">
              {/* Line numbers + highlighted code (display only) */}
              <div ref={overlayRef} className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="flex font-mono text-xs leading-6 p-3">
                  <div className="w-8 text-right pr-3 text-muted-foreground/50 select-none shrink-0">
                    {lines.map((_, idx) => (
                      <div key={idx} className={errorLines.has(idx + 1) ? "text-destructive font-bold" : ""}>
                        {idx + 1}
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    {lines.map((line, idx) => (
                      <div
                        key={idx}
                        className={`whitespace-pre ${errorLines.has(idx + 1) ? "bg-destructive/10 rounded" : ""}`}
                      >
                        {highlightFormula(line).map((span, si) => (
                          <span key={si} className={span.className}>{span.text}</span>
                        ))}
                        {line === "" && "\u200B"}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Actual textarea */}
              <textarea
                ref={textareaRef}
                value={formula}
                onChange={(e) => { setFormula(e.target.value); setErrors([]); }}
                onScroll={(e) => {
                  if (overlayRef.current) {
                    overlayRef.current.scrollTop = e.currentTarget.scrollTop;
                    overlayRef.current.scrollLeft = e.currentTarget.scrollLeft;
                  }
                }}
                className="w-full font-mono text-xs leading-6 p-3 pl-14 bg-transparent text-transparent caret-foreground resize-none focus:outline-none min-h-[288px]"
                placeholder="Tulis formula screening di sini...&#10;Contoh: close > sma(20) AND volume > sma_vol(20)"
                spellCheck={false}
                rows={12}
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleValidate} disabled={!formula.trim()} className="gap-1.5">
              ▶ Validasi & Lanjut
            </Button>
            <Button variant="outline" onClick={() => setShowSave(true)} disabled={!formula.trim()} className="gap-1.5">
              💾 Simpan
            </Button>
            <Button variant="outline" onClick={() => { setFormula(""); setErrors([]); }} className="gap-1.5">
              🗑 Clear
            </Button>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="p-3 space-y-1">
                <p className="text-xs font-bold text-destructive">❌ Formula Error</p>
                {errors.map((err, i) => (
                  <div key={i} className="text-xs text-destructive/90">
                    <span className="font-mono">Baris {err.line}:</span> {err.message}
                    {err.suggestion && (
                      <span className="text-primary ml-1 cursor-pointer hover:underline" onClick={() => {
                        if (err.suggestion) {
                          const match = err.suggestion.match(/'([^']+)'/);
                          if (match) {
                            setFormula(f => f.replace(new RegExp(`\\b${errors[i].message.match(/'([^']+)'/)?.[1]}\\b`), match[1]));
                          }
                        }
                      }}>
                        → {err.suggestion}
                      </span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Saved Formulas */}
          {formulas && formulas.length > 0 && (
            <Card>
              <CardContent className="p-3">
                <p className="text-xs font-bold mb-2 text-foreground">📂 Saved Formulas</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs h-8">Nama</TableHead>
                      <TableHead className="text-xs h-8">Preview</TableHead>
                      <TableHead className="text-xs h-8">Tanggal</TableHead>
                      <TableHead className="text-xs h-8 text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formulas.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="text-xs py-1.5 font-medium">{f.nama}</TableCell>
                        <TableCell className="text-xs py-1.5 font-mono text-muted-foreground max-w-[200px] truncate">
                          {f.formula.slice(0, 60)}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-muted-foreground">
                          {format(new Date(f.created_at), "dd/MM/yy")}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-right">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleLoad(f)}>
                              Load
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive" onClick={() => deleteFormula.mutate(f.id)}>
                              Hapus
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Reference Panel - 40% */}
        <div className="lg:col-span-2">
          <ReferencePanel onInsert={handleInsert} />
        </div>
      </div>

      {/* Save Dialog */}
      <Dialog open={showSave} onOpenChange={setShowSave}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Simpan Formula</DialogTitle>
          </DialogHeader>
          <Input placeholder="Nama formula..." value={saveName} onChange={(e) => setSaveName(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSave(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={!saveName.trim()}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
