import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Settings, 
  Users, 
  Building2,
  Clock,
  RefreshCw
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface ConfigIssue {
  severity: 'critical' | 'warning' | 'info';
  category: 'employee' | 'branch' | 'settings' | 'system';
  title: string;
  description: string;
  affectedItems: string[];
  suggestion: string;
}

export default function ConfigurationValidator() {
  const { data: issues, isLoading, refetch } = useQuery({
    queryKey: ['config-validation'],
    queryFn: async () => {
      const issues: ConfigIssue[] = [];

      // 1. Check employees configuration
      const { data: employees } = await supabase
        .from('employees')
        .select('*')
        .eq('is_active', true);

      employees?.forEach(emp => {
        // Check time_based employees without allowed work times
        if (emp.working_time_type === 'time_based') {
          if (!emp.shift_start_time || !emp.shift_end_time) {
            issues.push({
              severity: 'critical',
              category: 'employee',
              title: `${emp.full_name}: Missing Shift Times`,
              description: 'Employee is time_based but missing shift_start_time or shift_end_time',
              affectedItems: [emp.code, emp.full_name],
              suggestion: 'Set shift_start_time and shift_end_time for this employee',
            });
          }
          
          if (!emp.allowed_work_start_time || !emp.allowed_work_end_time) {
            issues.push({
              severity: 'critical',
              category: 'employee',
              title: `${emp.full_name}: Missing Allowed Work Times`,
              description: 'Employee is time_based but missing allowed_work_start_time or allowed_work_end_time - validation will be bypassed!',
              affectedItems: [emp.code, emp.full_name],
              suggestion: 'Set allowed_work_start_time and allowed_work_end_time immediately',
            });
          }
        }

        // Check hours_based employees without hours_per_day
        if (emp.working_time_type === 'hours_based' && !emp.hours_per_day) {
          issues.push({
            severity: 'warning',
            category: 'employee',
            title: `${emp.full_name}: Missing Hours Per Day`,
            description: 'Employee is hours_based but hours_per_day is not set - will default to 8',
            affectedItems: [emp.code, emp.full_name],
            suggestion: 'Set hours_per_day for accurate work time calculation',
          });
        }

        // Check employees without branch
        if (!emp.branch_id) {
          issues.push({
            severity: 'warning',
            category: 'employee',
            title: `${emp.full_name}: No Branch Assigned`,
            description: 'Employee has no branch assigned',
            affectedItems: [emp.code, emp.full_name],
            suggestion: 'Assign a branch to this employee',
          });
        }

        // Check employees without LINE user ID
        if (!emp.line_user_id) {
          issues.push({
            severity: 'info',
            category: 'employee',
            title: `${emp.full_name}: No LINE User ID`,
            description: 'Employee cannot receive LINE notifications',
            affectedItems: [emp.code, emp.full_name],
            suggestion: 'Add LINE user ID to enable notifications',
          });
        }

        // Check unrealistic configurations
        if (emp.max_work_hours_per_day && emp.max_work_hours_per_day > 16) {
          issues.push({
            severity: 'warning',
            category: 'employee',
            title: `${emp.full_name}: Unrealistic Max Work Hours`,
            description: `max_work_hours_per_day is ${emp.max_work_hours_per_day} hours (>16 hours)`,
            affectedItems: [emp.code, emp.full_name],
            suggestion: 'Review and adjust max_work_hours_per_day',
          });
        }
      });

      // 2. Check branches configuration
      const { data: branches } = await supabase
        .from('branches')
        .select('*, employees!inner(id, full_name, is_active)')
        .eq('is_deleted', true);

      if (branches && branches.length > 0) {
        branches.forEach(branch => {
          const activeEmployees = branch.employees?.filter((e: any) => e.is_active) || [];
          if (activeEmployees.length > 0) {
            issues.push({
              severity: 'critical',
              category: 'branch',
              title: `${branch.name}: Deleted Branch with Active Employees`,
              description: `Branch is marked as deleted but has ${activeEmployees.length} active employees`,
              affectedItems: activeEmployees.map((e: any) => e.full_name),
              suggestion: 'Either restore the branch or reassign employees to active branches',
            });
          }
        });
      }

      // 3. Check for orphaned work sessions
      const { data: orphanedSessions, error: sessionError } = await supabase
        .from('work_sessions')
        .select('id, employee_id, work_date, status, employees(full_name, code)')
        .in('status', ['active', 'pending'])
        .lt('work_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

      if (orphanedSessions && orphanedSessions.length > 0) {
        orphanedSessions.forEach(session => {
          issues.push({
            severity: 'warning',
            category: 'system',
            title: `Orphaned Work Session: ${session.employees?.full_name}`,
            description: `Work session from ${session.work_date} is still ${session.status}`,
            affectedItems: [session.employees?.code || 'Unknown', session.work_date],
            suggestion: 'Run cleanup to close old work sessions',
          });
        });
      }

      // 4. Check system settings
      const { data: systemSettings } = await supabase
        .from('system_settings')
        .select('*');

      const requiredSettings = ['app_url', 'reminder_intervals', 'grace_period_auto_checkout'];
      const missingSettings = requiredSettings.filter(key => 
        !systemSettings?.find(s => s.setting_key === key)
      );

      if (missingSettings.length > 0) {
        issues.push({
          severity: 'warning',
          category: 'settings',
          title: 'Missing System Settings',
          description: `${missingSettings.length} required system settings are not configured`,
          affectedItems: missingSettings,
          suggestion: 'Configure missing system settings',
        });
      }

      // 5. Check for bot message logs issues
      const { data: recentBotLogs, error: botLogsError } = await supabase
        .from('bot_message_logs')
        .select('id, delivery_status, created_at')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      const failedLogs = recentBotLogs?.filter(log => log.delivery_status === 'failed') || [];
      
      if (failedLogs.length > 5) {
        issues.push({
          severity: 'critical',
          category: 'system',
          title: 'High Bot Message Failure Rate',
          description: `${failedLogs.length} bot messages failed in the last 24 hours`,
          affectedItems: [`${failedLogs.length} failed messages`],
          suggestion: 'Check LINE API connectivity and credentials',
        });
      }

      if (!recentBotLogs || recentBotLogs.length === 0) {
        issues.push({
          severity: 'warning',
          category: 'system',
          title: 'No Bot Messages in 24 Hours',
          description: 'Bot message logs are empty - logging may not be working',
          affectedItems: ['bot_message_logs table'],
          suggestion: 'Check bot_message_logs RLS policies and logBotMessage() calls',
        });
      }

      return issues;
    },
  });

  const criticalIssues = issues?.filter(i => i.severity === 'critical') || [];
  const warningIssues = issues?.filter(i => i.severity === 'warning') || [];
  const infoIssues = issues?.filter(i => i.severity === 'info') || [];

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'warning': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'info': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <XCircle className="h-5 w-5 text-red-600" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-orange-600" />;
      case 'info': return <CheckCircle2 className="h-5 w-5 text-blue-600" />;
      default: return <Settings className="h-5 w-5" />;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'employee': return <Users className="h-4 w-4" />;
      case 'branch': return <Building2 className="h-4 w-4" />;
      case 'settings': return <Settings className="h-4 w-4" />;
      case 'system': return <Clock className="h-4 w-4" />;
      default: return <Settings className="h-4 w-4" />;
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configuration Validator</h1>
          <p className="text-muted-foreground mt-1">
            ตรวจสอบความถูกต้องของการตั้งค่าระบบ
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-l-4 border-l-red-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Critical Issues</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">
                {criticalIssues.length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                ต้องแก้ไขทันที
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-orange-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Warnings</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-600">
                {warningIssues.length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                ควรแก้ไข
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">System Health</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {criticalIssues.length === 0 ? '✓' : '✗'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {criticalIssues.length === 0 ? 'ทำงานปกติ' : 'ต้องแก้ไข'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Critical Issues */}
      {criticalIssues.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Critical Issues ({criticalIssues.length})
            </CardTitle>
            <CardDescription>
              ปัญหาร้ายแรงที่ต้องแก้ไขทันที
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {criticalIssues.map((issue, idx) => (
              <Alert key={idx} className={getSeverityColor(issue.severity)}>
                <div className="flex gap-3">
                  {getSeverityIcon(issue.severity)}
                  <div className="flex-1 space-y-1">
                    <AlertTitle className="flex items-center gap-2">
                      {getCategoryIcon(issue.category)}
                      {issue.title}
                    </AlertTitle>
                    <AlertDescription className="space-y-2">
                      <p>{issue.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {issue.affectedItems.map((item, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {item}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-sm font-semibold mt-2">
                        💡 {issue.suggestion}
                      </p>
                    </AlertDescription>
                  </div>
                </div>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Warning Issues */}
      {warningIssues.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              Warnings ({warningIssues.length})
            </CardTitle>
            <CardDescription>
              ควรตรวจสอบและแก้ไข
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {warningIssues.map((issue, idx) => (
              <Alert key={idx} className={getSeverityColor(issue.severity)}>
                <div className="flex gap-3">
                  {getSeverityIcon(issue.severity)}
                  <div className="flex-1 space-y-1">
                    <AlertTitle className="flex items-center gap-2">
                      {getCategoryIcon(issue.category)}
                      {issue.title}
                    </AlertTitle>
                    <AlertDescription className="space-y-2">
                      <p>{issue.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {issue.affectedItems.map((item, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {item}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-sm font-semibold mt-2">
                        💡 {issue.suggestion}
                      </p>
                    </AlertDescription>
                  </div>
                </div>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Info Issues */}
      {infoIssues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-600">
              <CheckCircle2 className="h-5 w-5" />
              Information ({infoIssues.length})
            </CardTitle>
            <CardDescription>
              ข้อมูลที่ควรทราบ
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {infoIssues.map((issue, idx) => (
              <Alert key={idx} className={getSeverityColor(issue.severity)}>
                <div className="flex gap-3">
                  {getSeverityIcon(issue.severity)}
                  <div className="flex-1 space-y-1">
                    <AlertTitle className="flex items-center gap-2">
                      {getCategoryIcon(issue.category)}
                      {issue.title}
                    </AlertTitle>
                    <AlertDescription className="space-y-2">
                      <p>{issue.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {issue.affectedItems.map((item, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </AlertDescription>
                  </div>
                </div>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      {/* All Clear */}
      {!isLoading && issues && issues.length === 0 && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-green-900 mb-2">
              ✅ ระบบพร้อมใช้งาน
            </h3>
            <p className="text-green-700">
              ไม่พบปัญหาในการตั้งค่า ระบบทำงานปกติ
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
