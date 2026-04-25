import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Bell, BellOff, CheckCheck, Info, AlertTriangle, Settings, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

interface Notification {
  id: string;
  title: string;
  body: string | null;
  type: string;
  priority: string;
  is_read: boolean;
  read_at: string | null;
  action_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface NotificationPreferences {
  notify_overtime: boolean;
  notify_early_leave: boolean;
  notify_day_off: boolean;
  notify_remote_checkout: boolean;
}

const defaultPrefs: NotificationPreferences = {
  notify_overtime: true,
  notify_early_leave: true,
  notify_day_off: true,
  notify_remote_checkout: true,
};

const typeIcons: Record<string, typeof Info> = {
  info: Info,
  approval: CheckCheck,
  alert: AlertTriangle,
  system: Settings,
};

const priorityColors: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  normal: 'bg-secondary text-secondary-foreground',
  high: 'bg-primary/10 text-primary',
  urgent: 'bg-destructive/10 text-destructive',
};

export default function Notifications() {
  const { employee, locale } = usePortal();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [prefs, setPrefs] = useState<NotificationPreferences>(defaultPrefs);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const t = (th: string, en: string) => locale === 'th' ? th : en;

  useEffect(() => {
    if (!employee?.id) return;
    fetchNotifications();
    fetchPreferences();

    const channel = supabase
      .channel('portal-notifications')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `employee_id=eq.${employee.id}`,
      }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [employee?.id]);

  const fetchNotifications = async () => {
    if (!employee?.id) return;
    const { data, error } = await supabase
      .from('notifications' as never)
      .select('*')
      .eq('employee_id', employee.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      setNotifications(data as unknown as Notification[]);
    }
    setLoading(false);
  };

  const fetchPreferences = async () => {
    if (!employee?.id) return;
    try {
      const { data } = await supabase.functions.invoke('portal-data', {
        body: { endpoint: 'notification-preferences', employee_id: employee.id }
      });
      if (data?.data) {
        setPrefs({
          notify_overtime: data.data.notify_overtime ?? true,
          notify_early_leave: data.data.notify_early_leave ?? true,
          notify_day_off: data.data.notify_day_off ?? true,
          notify_remote_checkout: data.data.notify_remote_checkout ?? true,
        });
      }
    } catch (e) {
      console.warn('Failed to fetch notification preferences', e);
    }
  };

  const updatePreference = async (key: keyof NotificationPreferences, value: boolean) => {
    const newPrefs = { ...prefs, [key]: value };
    setPrefs(newPrefs);
    setPrefsLoading(true);
    try {
      await supabase.functions.invoke('portal-data', {
        body: {
          endpoint: 'notification-preferences-update',
          employee_id: employee?.id,
          params: newPrefs,
        }
      });
      toast.success(t('บันทึกแล้ว', 'Saved'));
    } catch (e) {
      setPrefs(prefs); // rollback
      toast.error(t('บันทึกไม่สำเร็จ', 'Failed to save'));
    }
    setPrefsLoading(false);
  };

  const markAsRead = async (id: string) => {
    await supabase
      .from('notifications' as never)
      .update({ is_read: true, read_at: new Date().toISOString() } as never)
      .eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n));
  };

  const markAllAsRead = async () => {
    if (!employee?.id) return;
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;

    await supabase
      .from('notifications' as never)
      .update({ is_read: true, read_at: new Date().toISOString() } as never)
      .in('id', unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() })));
    toast.success(t('อ่านทั้งหมดแล้ว', 'All marked as read'));
  };

  const handleClick = (n: Notification) => {
    if (!n.is_read) markAsRead(n.id);
    if (n.action_url) navigate(n.action_url);
  };

  const filtered = tab === 'unread' ? notifications.filter(n => !n.is_read) : notifications;
  const unreadCount = notifications.filter(n => !n.is_read).length;

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return t('เมื่อสักครู่', 'Just now');
    if (diffMins < 60) return `${diffMins} ${t('นาทีที่แล้ว', 'min ago')}`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} ${t('ชม.ที่แล้ว', 'hr ago')}`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} ${t('วันที่แล้ว', 'days ago')}`;
    return d.toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US', { month: 'short', day: 'numeric' });
  };

  const prefItems: { key: keyof NotificationPreferences; icon: string; label: string }[] = [
    { key: 'notify_overtime', icon: '📋', label: t('คำขอ OT', 'OT Requests') },
    { key: 'notify_early_leave', icon: '🚪', label: t('คำขอออกก่อนเวลา', 'Early Leave Requests') },
    { key: 'notify_day_off', icon: '📅', label: t('คำขอวันหยุด', 'Day Off Requests') },
    { key: 'notify_remote_checkout', icon: '📍', label: t('Checkout นอกสถานที่', 'Remote Checkout') },
  ];

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{t('การแจ้งเตือน', 'Notifications')}</h2>
          {unreadCount > 0 && (
            <Badge variant="default" className="text-xs">{unreadCount}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead}>
              <CheckCheck className="h-4 w-4 mr-1" />
              {t('อ่านทั้งหมด', 'Read all')}
            </Button>
          )}
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Settings className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>{t('ตั้งค่าการแจ้งเตือน', 'Notification Settings')}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground mb-4">
                {t('เลือกประเภทการแจ้งเตือนที่ต้องการรับ', 'Choose which notifications to receive')}
              </p>
              <div className="space-y-4">
                {prefItems.map(item => (
                  <div key={item.key} className="flex items-center justify-between">
                    <span className="text-sm">
                      {item.icon} {item.label}
                    </span>
                    <Switch
                      checked={prefs[item.key]}
                      onCheckedChange={(v) => updatePreference(item.key, v)}
                      disabled={prefsLoading}
                    />
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="all" className="flex-1">{t('ทั้งหมด', 'All')}</TabsTrigger>
          <TabsTrigger value="unread" className="flex-1">
            {t('ยังไม่อ่าน', 'Unread')} {unreadCount > 0 && `(${unreadCount})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-3 space-y-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <BellOff className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">{tab === 'unread' ? t('ไม่มีแจ้งเตือนใหม่', 'No unread notifications') : t('ยังไม่มีการแจ้งเตือน', 'No notifications yet')}</p>
            </div>
          ) : (
            filtered.map(n => {
              const Icon = typeIcons[n.type] || Info;
              return (
                <Card
                  key={n.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${!n.is_read ? 'border-primary/30 bg-primary/5' : ''}`}
                  onClick={() => handleClick(n)}
                >
                  <CardContent className="p-3 flex items-start gap-3">
                    <div className={`mt-0.5 p-1.5 rounded-lg ${priorityColors[n.priority] || priorityColors.normal}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium line-clamp-1 ${!n.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {n.title}
                        </p>
                        {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />}
                      </div>
                      {n.body && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">{formatTime(n.created_at)}</p>
                    </div>
                    {n.action_url && <ChevronRight className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
