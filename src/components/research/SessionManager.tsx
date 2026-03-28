import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useBacktestSessions, useSaveSession, useDeleteSession } from "@/hooks/useResearchScreener";
import { format } from "date-fns";
import { toast } from "sonner";

interface SessionManagerProps {
  pendingSummary?: any;
  formula?: string;
  formulaId?: string;
  screeningDate?: string;
  onViewSession?: (session: any) => void;
  onRerun?: (session: any) => void;
}

export default function SessionManager({ pendingSummary, formula, formulaId, screeningDate, onViewSession, onRerun }: SessionManagerProps) {
  const defaultName = screeningDate
    ? `Research - ${format(new Date(screeningDate), "dd MMM yyyy")}`
    : "";
  const [showSave, setShowSave] = useState(!!pendingSummary);
  const [saveName, setSaveName] = useState(defaultName);
  const [saveNotes, setSaveNotes] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  const { data: sessions } = useBacktestSessions();
  const saveSession = useSaveSession();
  const deleteSession = useDeleteSession();

  const handleSave = () => {
    if (!saveName.trim() || !pendingSummary) return;
    saveSession.mutate({
      nama: saveName,
      formula: formula || pendingSummary.formula || "",
      formula_id: formulaId,
      metode: pendingSummary.methods?.map((m: any) => m.id) || [],
      threshold_bsjp: pendingSummary.methods?.find((m: any) => m.id === "bsjp")?.threshold,
      threshold_swing: pendingSummary.methods?.find((m: any) => m.id === "swing3" || m.id === "swing5")?.threshold,
      periode_historis: pendingSummary.period,
      parameter_dipilih: pendingSummary.params,
      hasil_summary: pendingSummary,
      notes: saveNotes,
    }, {
      onSuccess: () => {
        toast.success("Session disimpan!");
        setShowSave(false);
        setSaveName("");
        setSaveNotes("");
      },
    });
  };

  const toggleCompare = (id: string) => {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const compareSessionsData = compareIds.length === 2 && sessions
    ? compareIds.map(id => sessions.find((s: any) => s.id === id)).filter(Boolean)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">📊 Saved Backtest Sessions</h3>
        {compareIds.length === 2 && (
          <Button size="sm" variant="outline" onClick={() => setShowCompare(true)}>
            📋 Compare ({compareIds.length})
          </Button>
        )}
      </div>

      {sessions && sessions.length > 0 ? (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs h-8 w-8">📋</TableHead>
                <TableHead className="text-xs h-8">Nama</TableHead>
                <TableHead className="text-xs h-8">Formula</TableHead>
                <TableHead className="text-xs h-8">Metode</TableHead>
                <TableHead className="text-xs h-8">Tanggal</TableHead>
                <TableHead className="text-xs h-8">WIN%</TableHead>
                <TableHead className="text-xs h-8 text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s: any) => {
                const methods = Array.isArray(s.metode) ? s.metode : [];
                const summary = s.hasil_summary as any;
                const overallWr = summary?.overallStats
                  ? Object.values(summary.overallStats as Record<string, any>).reduce((acc: number, ms: any) => ms.winRate || acc, 0)
                  : null;

                return (
                  <TableRow key={s.id}>
                    <TableCell className="py-1.5 px-2">
                      <input
                        type="checkbox"
                        checked={compareIds.includes(s.id)}
                        onChange={() => toggleCompare(s.id)}
                        className="h-3 w-3"
                      />
                    </TableCell>
                    <TableCell className="text-xs py-1.5 font-medium">{s.nama}</TableCell>
                    <TableCell className="text-xs py-1.5 font-mono text-muted-foreground max-w-[150px] truncate">
                      {s.formula.slice(0, 40)}
                    </TableCell>
                    <TableCell className="text-xs py-1.5">
                      {methods.map((m: string) => (
                        <Badge key={m} variant="outline" className="text-[10px] mr-1">{m}</Badge>
                      ))}
                    </TableCell>
                    <TableCell className="text-xs py-1.5 text-muted-foreground">
                      {format(new Date(s.tanggal_run), "dd/MM/yy HH:mm")}
                    </TableCell>
                    <TableCell className="text-xs py-1.5">
                      {overallWr != null && (
                        <Badge variant="outline" className={`text-xs ${overallWr >= 50 ? "text-emerald-500" : "text-red-500"}`}>
                          {typeof overallWr === 'number' ? overallWr.toFixed(1) : overallWr}%
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs py-1.5 text-right">
                      <div className="flex gap-1 justify-end">
                        {onViewSession && (
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onViewSession(s)}>
                            👁
                          </Button>
                        )}
                        {onRerun && (
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onRerun(s)}>
                            🔄
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive" onClick={() => deleteSession.mutate(s.id)}>
                          🗑
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground text-sm">
            Belum ada session tersimpan.
          </CardContent>
        </Card>
      )}

      {/* Save Dialog */}
      <Dialog open={showSave} onOpenChange={setShowSave}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>💾 Simpan Hasil Backtest</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder='Nama session, contoh: "MA Squeeze v1 - BSJP"' value={saveName} onChange={e => setSaveName(e.target.value)} />
            <Textarea placeholder="Notes (opsional)" value={saveNotes} onChange={e => setSaveNotes(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSave(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={!saveName.trim()}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compare Dialog */}
      <Dialog open={showCompare} onOpenChange={setShowCompare}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>📋 Compare Sessions</DialogTitle>
          </DialogHeader>
          {compareSessionsData.length === 2 && (
            <div className="grid grid-cols-2 gap-4">
              {compareSessionsData.map((s: any) => (
                <Card key={s.id}>
                  <CardContent className="p-4 space-y-2">
                    <p className="text-sm font-bold text-foreground">{s.nama}</p>
                    <p className="text-xs text-muted-foreground font-mono">{s.formula.slice(0, 60)}</p>
                    <div className="text-xs text-muted-foreground">
                      <p>Metode: {(s.metode as string[]).join(", ")}</p>
                      <p>Tanggal: {format(new Date(s.tanggal_run), "dd/MM/yy")}</p>
                    </div>
                    {s.hasil_summary?.overallStats && Object.entries(s.hasil_summary.overallStats as Record<string, any>).map(([method, stats]: [string, any]) => (
                      <div key={method} className="bg-muted/50 rounded p-2">
                        <p className="text-xs font-bold">{method.toUpperCase()}</p>
                        <p className="text-xs">WIN%: <span className={stats.winRate >= 50 ? "text-emerald-500" : "text-red-500"}>{stats.winRate?.toFixed(1)}%</span></p>
                        <p className="text-xs">Total: {stats.totalSignals} | Avg: {stats.avgGain?.toFixed(2)}%</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
