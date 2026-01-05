import { Outlet, useLocation } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NavLink } from '@/components/NavLink';
import { Shield, Webhook, AlertTriangle, FileText, Settings as SettingsIcon, Users, ShieldCheck } from 'lucide-react';

export default function SettingsLayout() {
  const location = useLocation();
  
  const tabs = [
    { label: 'General', path: '/settings', icon: SettingsIcon },
    { label: 'Users', path: '/settings/users', icon: Users },
    { label: 'Roles', path: '/settings/roles', icon: ShieldCheck },
    { label: 'Safety Rules', path: '/settings/safety', icon: Shield },
    { label: 'Integrations', path: '/settings/integrations', icon: Webhook },
    { label: 'Alerts & Logs', path: '/settings/alerts', icon: AlertTriangle },
    { label: 'Reports', path: '/settings/reports', icon: FileText },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage bot configuration and monitoring</p>
      </div>

      <Tabs value={location.pathname} className="w-full">
        <TabsList className="w-full flex flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-6">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.path} value={tab.path} asChild>
              <NavLink 
                to={tab.path} 
                end={tab.path === '/settings'}
                className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm w-full sm:w-auto data-[state=active]:bg-background data-[state=active]:text-foreground px-2 sm:px-3"
              >
                <tab.icon className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
              </NavLink>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Outlet />
    </div>
  );
}
