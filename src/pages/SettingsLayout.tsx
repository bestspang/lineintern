import { Outlet, useLocation } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NavLink } from '@/components/NavLink';
import { Shield, Webhook, AlertTriangle, FileText, Settings as SettingsIcon } from 'lucide-react';

export default function SettingsLayout() {
  const location = useLocation();
  
  const tabs = [
    { label: 'General', path: '/settings', icon: SettingsIcon },
    { label: 'Safety Rules', path: '/settings/safety', icon: Shield },
    { label: 'Integrations', path: '/settings/integrations', icon: Webhook },
    { label: 'Alerts & Logs', path: '/settings/alerts', icon: AlertTriangle },
    { label: 'Reports', path: '/settings/reports', icon: FileText },
  ];

  return (
    <div className="space-y-6 max-w-full px-4 sm:px-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage bot configuration and monitoring</p>
      </div>

      <Tabs value={location.pathname} className="w-full">
        <TabsList className="w-full flex flex-wrap gap-2 mb-6">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.path} value={tab.path} asChild>
              <NavLink 
                to={tab.path} 
                end={tab.path === '/settings'}
                className="flex items-center gap-2 whitespace-nowrap w-full sm:w-auto data-[state=active]:bg-background data-[state=active]:text-foreground"
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </NavLink>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Outlet />
    </div>
  );
}
