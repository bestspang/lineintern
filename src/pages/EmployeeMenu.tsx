import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Clock, Calendar, History, UserCog, CheckCircle, 
  CheckSquare, Users, Settings, AlertCircle, CalendarCheck 
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const iconMap: Record<string, any> = {
  Clock,
  Calendar,
  CalendarCheck,
  History,
  UserCog,
  CheckCircle,
  CheckSquare,
  Users,
  Settings
};

interface MenuItem {
  id: string;
  menu_key: string;
  display_name_th: string;
  display_name_en: string;
  icon: string;
  action_type: string;
  action_url: string;
  display_order: number;
}

interface Employee {
  id: string;
  code: string;
  full_name: string;
  role: {
    display_name_th: string;
    display_name_en: string;
  } | null;
  branch: {
    name: string;
  } | null;
}

export default function EmployeeMenu() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [locale] = useState<'th' | 'en'>('th');

  useEffect(() => {
    const validateToken = async () => {
      const token = searchParams.get('token');
      
      if (!token) {
        setError('Token is required');
        setLoading(false);
        return;
      }

      try {
        const { data, error: validateError } = await supabase.functions.invoke(
          'employee-menu-validate',
          {
            body: { token }
          }
        );

        if (validateError || !data.success) {
          setError(data?.error || 'Invalid or expired token');
          setLoading(false);
          return;
        }

        setEmployee(data.employee);
        setMenuItems(data.menuItems || []);
        setLoading(false);
      } catch (err) {
        console.error('Error validating token:', err);
        setError('Failed to load menu');
        setLoading(false);
      }
    };

    validateToken();
  }, [searchParams]);

  const handleMenuClick = (item: MenuItem) => {
    if (item.action_type === 'page' && item.action_url) {
      navigate(item.action_url);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted p-4 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <CardTitle>{locale === 'th' ? 'เกิดข้อผิดพลาด' : 'Error'}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <p className="mt-4 text-sm text-muted-foreground text-center">
              {locale === 'th' 
                ? 'กรุณาขอลิงก์เมนูใหม่จาก LINE' 
                : 'Please request a new menu link from LINE'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted p-4 pb-8">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Employee Info Card */}
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-xl">
                  {locale === 'th' ? 'เมนูพนักงาน' : 'Employee Menu'}
                </CardTitle>
                <CardDescription className="mt-1">
                  {employee?.full_name} ({employee?.code})
                </CardDescription>
              </div>
              {employee?.role && (
                <Badge variant="secondary">
                  {locale === 'th' ? employee.role.display_name_th : employee.role.display_name_en}
                </Badge>
              )}
            </div>
          </CardHeader>
          {employee?.branch && (
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">
                📍 {employee.branch.name}
              </p>
            </CardContent>
          )}
        </Card>

        {/* Menu Items */}
        {menuItems.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">
                {locale === 'th' 
                  ? 'ไม่มีเมนูที่สามารถใช้งานได้' 
                  : 'No menu items available'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {menuItems.map((item) => {
              const Icon = iconMap[item.icon] || AlertCircle;
              return (
                <Card
                  key={item.id}
                  className="cursor-pointer hover:bg-accent/50 transition-colors active:scale-98"
                  onClick={() => handleMenuClick(item)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">
                          {locale === 'th' ? item.display_name_th : item.display_name_en}
                        </h3>
                      </div>
                      <div className="text-muted-foreground">›</div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pt-4">
          {locale === 'th' 
            ? '⏰ ลิงก์นี้จะหมดอายุหลังจากใช้งาน' 
            : '⏰ This link expires after use'}
        </p>
      </div>
    </div>
  );
}