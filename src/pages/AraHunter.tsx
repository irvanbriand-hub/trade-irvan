import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AraHistoricalScanner from "@/components/ara/AraHistoricalScanner";
import AraPatternExtractor from "@/components/ara/AraPatternExtractor";
import AraPatternAnalysis from "@/components/ara/AraPatternAnalysis";
import AraLiveScanner from "@/components/ara/AraLiveScanner";
import AraWatchList from "@/components/ara/AraWatchList";

export default function AraHunter() {
  const [activeTab, setActiveTab] = useState("scan");
  const [scanComplete, setScanComplete] = useState(false);
  const [extractComplete, setExtractComplete] = useState(false);
  const [araCount, setAraCount] = useState(0);
  const [patternCount, setPatternCount] = useState(0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">🎯 ARA Hunter</h1>
        <p className="text-sm text-muted-foreground">Analisa pola historis sebelum ARA untuk prediksi kandidat ARA</p>
      </div>

      <div className="p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 text-sm text-yellow-600 dark:text-yellow-400">
        ⚠️ ARA Hunter adalah tools analisa pola historis. WIN rate tinggi tidak menjamin ARA terjadi. Selalu gunakan risk management yang ketat.
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-5">
          <TabsTrigger value="scan">📊 Scan</TabsTrigger>
          <TabsTrigger value="extract">🔧 Ekstrak</TabsTrigger>
          <TabsTrigger value="analysis">🔬 Analisa</TabsTrigger>
          <TabsTrigger value="live">🎯 Live</TabsTrigger>
          <TabsTrigger value="watchlist">👁 Watch</TabsTrigger>
        </TabsList>

        <TabsContent value="scan">
          <AraHistoricalScanner
            onComplete={(count) => { setAraCount(count); setScanComplete(true); }}
            onGoNext={() => setActiveTab("extract")}
          />
        </TabsContent>

        <TabsContent value="extract">
          <AraPatternExtractor
            onComplete={(count) => { setPatternCount(count); setExtractComplete(true); }}
            onGoNext={() => setActiveTab("analysis")}
          />
        </TabsContent>

        <TabsContent value="analysis">
          <AraPatternAnalysis />
        </TabsContent>

        <TabsContent value="live">
          <AraLiveScanner />
        </TabsContent>

        <TabsContent value="watchlist">
          <AraWatchList />
        </TabsContent>
      </Tabs>
    </div>
  );
}