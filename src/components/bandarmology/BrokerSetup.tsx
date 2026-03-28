import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useBrokerProfiles } from "@/hooks/useBrokerProfiles";
import { Loader2, Plus, Pencil, X, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function BrokerSetup() {
  const { brokers, addBroker, updateBroker, isLoading } = useBrokerProfiles();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#00D4FF");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const handleAdd = async () => {
    if (!code.trim() || !name.trim()) {
      toast({ title: "Isi kode dan nama broker", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      await addBroker(code, name, color);
      setCode("");
      setName("");
      setColor("#00D4FF");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setAdding(false);
  };

  const startEdit = (b: typeof brokers[0]) => {
    setEditingId(b.id);
    setEditName(b.broker_name);
    setEditColor(b.color);
  };

  const saveEdit = async (id: string) => {
    try {
      await updateBroker(id, { broker_name: editName, color: editColor });
      setEditingId(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const toggleActive = async (b: typeof brokers[0]) => {
    try {
      await updateBroker(b.id, { is_active: !b.is_active });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">➕ Tambah Broker Baru</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <Label className="text-xs">Kode Broker (max 4 huruf)</Label>
              <Input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase().slice(0, 4))}
                placeholder="XX"
                className="h-8 text-xs font-mono uppercase"
                maxLength={4}
              />
            </div>
            <div>
              <Label className="text-xs">Nama Broker</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nama lengkap broker"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Warna</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="h-8 w-10 rounded cursor-pointer border border-input"
                />
                <span className="text-[10px] font-mono text-muted-foreground">{color}</span>
              </div>
            </div>
            <Button onClick={handleAdd} disabled={adding || !code.trim() || !name.trim()} size="sm" className="h-8">
              {adding ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
              Tambah Broker
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">📋 Broker Terdaftar ({brokers.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {brokers.length === 0 ? (
            <p className="text-xs text-muted-foreground">Belum ada broker. Tambahkan broker pertama di atas.</p>
          ) : (
            brokers.map(b => (
              <div
                key={b.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${b.is_active ? "bg-card" : "bg-muted/30 opacity-60"}`}
              >
                <div
                  className="w-4 h-4 rounded-full shrink-0 border"
                  style={{ backgroundColor: b.color, borderColor: b.color }}
                />
                {editingId === b.id ? (
                  <>
                    <span className="font-mono font-bold text-sm">{b.broker_code}</span>
                    <Input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="h-7 text-xs w-40"
                    />
                    <input
                      type="color"
                      value={editColor}
                      onChange={e => setEditColor(e.target.value)}
                      className="h-7 w-8 rounded cursor-pointer border border-input"
                    />
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => saveEdit(b.id)}>
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingId(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="font-mono font-bold text-sm" style={{ color: b.color }}>{b.broker_code}</span>
                    <span className="text-sm text-foreground">— {b.broker_name}</span>
                    {!b.is_active && <Badge variant="outline" className="text-[9px]">Nonaktif</Badge>}
                    <div className="ml-auto flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => startEdit(b)}>
                        <Pencil className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => toggleActive(b)}
                      >
                        {b.is_active ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
