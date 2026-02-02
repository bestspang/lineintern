import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Building, Briefcase, MapPin, 
  ExternalLink, MessageSquare, Clock, User
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import type { ConversationItem } from './ConversationList';

interface EmployeeInfoCardProps {
  conversation: ConversationItem | null;
}

export function EmployeeInfoCard({ conversation }: EmployeeInfoCardProps) {
  // Fetch employee details
  const { data: employee, isLoading } = useQuery({
    queryKey: ['dm-employee-detail', conversation?.employee_id],
    queryFn: async () => {
      if (!conversation?.employee_id) return null;
      
      const { data, error } = await supabase
        .from('employees')
        .select(`
          *,
          branches!branch_id(name, address),
          employee_roles!role_id(name, priority)
        `)
        .eq('id', conversation.employee_id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!conversation?.employee_id,
  });

  if (!conversation) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">เลือกการสนทนาเพื่อดูข้อมูล</p>
      </div>
    );
  }

  if (!conversation.employee_id) {
    return (
      <Card className="m-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            ผู้ใช้ทั่วไป
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-16 w-16">
              <AvatarImage src={conversation.user_avatar_url || undefined} />
              <AvatarFallback className="text-lg">
                {conversation.user_display_name?.substring(0, 2).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{conversation.user_display_name || 'Unknown'}</p>
              <Badge variant="secondary">ไม่ใช่พนักงาน</Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MessageSquare className="h-4 w-4" />
              <span>{conversation.message_count} ข้อความ</span>
            </div>
            {conversation.last_activity && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="truncate">
                  {format(new Date(conversation.last_activity), 'dd MMM', { locale: th })}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="m-4">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!employee) {
    return (
      <Card className="m-4">
        <CardContent className="py-8 text-center text-muted-foreground">
          <p>ไม่พบข้อมูลพนักงาน</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="m-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Briefcase className="h-4 w-4" />
          ข้อมูลพนักงาน
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Profile section */}
        <div className="flex items-center gap-3">
          <Avatar className="h-16 w-16 border-2 border-primary/20">
            <AvatarImage src={conversation.user_avatar_url || undefined} />
            <AvatarFallback className="text-lg bg-primary/10">
              {employee.full_name?.substring(0, 2).toUpperCase() || 'E'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{employee.full_name}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={employee.is_active ? "default" : "secondary"}>
                {employee.is_active ? 'Active' : 'Inactive'}
              </Badge>
              {(employee.employee_roles as any)?.name && (
                <Badge variant="outline">
                  {(employee.employee_roles as any).name}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-2 text-sm">
          {(employee.branches as any)?.name && (
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4 text-muted-foreground" />
              <span>{(employee.branches as any).name}</span>
            </div>
          )}

          {(employee.branches as any)?.address && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <span className="text-xs text-muted-foreground line-clamp-2">
                {(employee.branches as any).address}
              </span>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t">
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <p className="text-lg font-bold">{conversation.message_count}</p>
            <p className="text-xs text-muted-foreground">ข้อความ</p>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <p className="text-lg font-bold">
              {conversation.last_activity 
                ? format(new Date(conversation.last_activity), 'dd', { locale: th })
                : '-'
              }
            </p>
            <p className="text-xs text-muted-foreground">
              {conversation.last_activity 
                ? format(new Date(conversation.last_activity), 'MMM', { locale: th })
                : 'ล่าสุด'
              }
            </p>
          </div>
        </div>

        {/* Link to employee detail */}
        <Button variant="outline" className="w-full" asChild>
          <Link to={`/attendance/employees/${employee.id}`}>
            <ExternalLink className="h-4 w-4 mr-2" />
            ดูข้อมูลเพิ่มเติม
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
