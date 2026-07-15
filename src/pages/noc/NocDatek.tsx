import { Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { Users, MapPin, type LucideIcon } from 'lucide-react';
import NocPO from './NocPO';
import SiteMasterPage from './datek/SiteMasterPage';

type SubTab = { to: string; label: string; Icon: LucideIcon };

const subTabs: SubTab[] = [
  { to: 'po', label: 'PO', Icon: Users },
  { to: 'master', label: 'Master Site', Icon: MapPin },
];

function DatekNav() {
  return (
    <div className="flex flex-wrap gap-1.5">
      {subTabs.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            [
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            ].join(' ')
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </div>
  );
}

// Container "Datek" — menampung PO + master data lainnya (Master Site, dst).
export default function NocDatek() {
  return (
    <div className="space-y-4">
      <DatekNav />
      <Routes>
        <Route path="/" element={<Navigate to="po" replace />} />
        <Route path="po" element={<NocPO />} />
        <Route path="master" element={<SiteMasterPage />} />
      </Routes>
    </div>
  );
}
