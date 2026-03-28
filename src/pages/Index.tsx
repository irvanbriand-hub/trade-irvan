import { useState } from "react";
import { screeningModules, mockStocks, type Stock } from "@/data/mockStocks";
import { ScreeningModuleCard } from "@/components/ScreeningModuleCard";
import { StockTable } from "@/components/StockTable";
import { MarketOverview } from "@/components/MarketOverview";
import { StockChartPopup } from "@/components/StockChartPopup";
import { BarChart3, Search, LineChart, PieChart } from "lucide-react";

type TabCategory = "all" | "fundamental" | "technical";

const Index = () => {
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabCategory>("all");
  const [chartStock, setChartStock] = useState<Stock | null>(null);

  const selectedModule = screeningModules.find((m) => m.id === activeModule);
  const filteredStocks = selectedModule
    ? mockStocks.filter(selectedModule.filter)
    : mockStocks;

  const filteredModules =
    activeTab === "all"
      ? screeningModules
      : screeningModules.filter((m) => m.category === activeTab);

  const tabs: { id: TabCategory; label: string; icon: React.ElementType }[] = [
    { id: "all", label: "Semua", icon: Search },
    { id: "fundamental", label: "Fundamental", icon: PieChart },
    { id: "technical", label: "Teknikal", icon: LineChart },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">StockScreener</h1>
              <p className="text-[11px] text-muted-foreground">IDX • Data Mock</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-gain animate-pulse-glow" />
            <span className="hidden sm:inline">Market Open</span>
          </div>
        </div>
      </header>

      <main className="container max-w-7xl mx-auto px-4 py-6 space-y-6">
        <MarketOverview />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sidebar */}
          <aside className="lg:col-span-4 xl:col-span-3 space-y-3">
            {/* Category Tabs */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 border border-border">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setActiveModule(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-2 py-2 rounded-md transition-all ${
                    activeTab === tab.id
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setActiveModule(null)}
              className={`w-full text-left text-sm px-4 py-2.5 rounded-lg border transition-all ${
                activeModule === null
                  ? "border-primary/60 bg-primary/5 text-foreground font-semibold"
                  : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30"
              }`}
            >
              📊 Semua Saham ({mockStocks.length})
            </button>

            {filteredModules.map((mod) => (
              <ScreeningModuleCard
                key={mod.id}
                module={mod}
                isActive={activeModule === mod.id}
                onClick={() => setActiveModule(mod.id)}
              />
            ))}
          </aside>

          {/* Results */}
          <section className="lg:col-span-8 xl:col-span-9">
            <StockTable
              stocks={filteredStocks}
              title={selectedModule ? selectedModule.title : "Semua Saham"}
              onTickerClick={(stock) => setChartStock(stock)}
            />
          </section>
        </div>
      </main>

      {chartStock && (
        <StockChartPopup
          ticker={chartStock.ticker}
          stockName={chartStock.name}
          price={chartStock.price}
          changePct={chartStock.changePct}
          open={!!chartStock}
          onClose={() => setChartStock(null)}
        />
      )}
    </div>
  );
};

export default Index;
