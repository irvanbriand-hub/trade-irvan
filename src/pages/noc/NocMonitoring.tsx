import { Activity, BarChart3, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SiteMasterTable } from '@/components/noc/SiteMasterTable';

export default function NocMonitoring() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Monitoring</h2>
          <p className="text-xs text-muted-foreground">
            Tiap baris punya tombol cepat ke dashboard site: Zabbix, Grafana, Google Maps.
          </p>
        </div>
        {/* Legenda tombol */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Activity className="h-3.5 w-3.5 text-red-600 dark:text-red-400" /> Zabbix</span>
          <span className="inline-flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" /> Grafana</span>
          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" /> Google Maps</span>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Data Site</CardTitle>
        </CardHeader>
        <CardContent>
          <SiteMasterTable showActions />
        </CardContent>
      </Card>
    </div>
  );
}
