/**
 * Profile Sync Health Dashboard
 * 
 * ⚠️ IMPORTANT: This page is read-only monitoring for users with LINE profile sync issues.
 * It uses existing edge functions (fix-user-names) for retry actions.
 * 
 * DO NOT modify:
 * - Users.tsx - existing user management page
 * - Alerts.tsx - existing alerts page
 * - Database schema
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  RefreshCw, AlertTriangle, CheckCircle2, XCircle, Users, Activity,
  ExternalLink, Loader2, UserX, ImageOff
} from 'lucide-react';
import { toast } from 'sonner';
import { useLocale } from '@/contexts/LocaleContext';
import { formatDistanceToNow } from 'date-fns';
import { th, enUS } from 'date-fns/locale';
import { Link } from 'react-router-dom';

interface UserWithSyncIssue {
  id: string;
  line_user_id: string;
  display_name: string;
  avatar_url: string | null;
  last_seen_at: string | null;
  error_count: number;
  last_error: string | null;
  hasAvatar: boolean;
  hasGenericName: boolean;
}

interface AlertRow {
  id: string;
  summary: string;
  created_at: string;
  resolved: boolean | null;
}

export default function ProfileSyncHealth() {
  const { t, locale } = useLocale();
  const queryClient = useQueryClient();
  const [retryingUser, setRetryingUser] = useState<string | null>(null);

  // Fetch all users
  const { data: allUsers, isLoading: usersLoading } = useQuery({
    queryKey: ['all-users-for-sync'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, line_user_id, display_name, avatar_url, last_seen_at')
        .order('display_name');
      
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch profile sync error alerts
  const { data: profileAlerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['profile-sync-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('id, summary, created_at, resolved')
        .like('summary', 'Failed to fetch LINE profile%')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as AlertRow[];
    }
  });

  // Process data to combine users with their error counts
  const usersWithIssues: UserWithSyncIssue[] = (() => {
    if (!allUsers || !profileAlerts) return [];

    // Group alerts by user ID suffix (last 6 chars)
    const alertsByUserSuffix: Record<string, { count: number; lastError: string; alertIds: string[] }> = {};
    
    profileAlerts.forEach(alert => {
      // Extract user ID suffix from summary like "Failed to fetch LINE profile for user 8da68c"
      const match = alert.summary.match(/user ([a-f0-9]+)$/i);
      if (match) {
        const suffix = match[1].toLowerCase();
        if (!alertsByUserSuffix[suffix]) {
          alertsByUserSuffix[suffix] = { count: 0, lastError: alert.created_at, alertIds: [] };
        }
        alertsByUserSuffix[suffix].count++;
        alertsByUserSuffix[suffix].alertIds.push(alert.id);
        if (alert.created_at > alertsByUserSuffix[suffix].lastError) {
          alertsByUserSuffix[suffix].lastError = alert.created_at;
        }
      }
    });

    // Match users with their alert data
    return allUsers
      .map(user => {
        const userSuffix = user.line_user_id.slice(-6).toLowerCase();
        const alertData = alertsByUserSuffix[userSuffix];
        
        if (!alertData) return null;

        return {
          id: user.id,
          line_user_id: user.line_user_id,
          display_name: user.display_name || 'Unknown',
          avatar_url: user.avatar_url,
          last_seen_at: user.last_seen_at,
          error_count: alertData.count,
          last_error: alertData.lastError,
          hasAvatar: !!user.avatar_url,
          hasGenericName: (user.display_name || '').startsWith('User ') || 
                          (user.display_name || '').startsWith('Unknown')
        };
      })
      .filter((u): u is UserWithSyncIssue => u !== null)
      .sort((a, b) => b.error_count - a.error_count);
  })();

  // Calculate stats
  const stats = {
    usersWithIssues: usersWithIssues.length,
    totalErrors: usersWithIssues.reduce((sum, u) => sum + u.error_count, 0),
    missingAvatars: usersWithIssues.filter(u => !u.hasAvatar).length,
    genericNames: usersWithIssues.filter(u => u.hasGenericName).length,
    totalUsers: allUsers?.length || 0,
    healthyPercent: allUsers?.length 
      ? Math.round(((allUsers.length - usersWithIssues.length) / allUsers.length) * 100)
      : 100
  };

  // Retry sync mutation
  const retrySyncMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke('fix-user-names', {
        body: { user_ids: [userId] }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(t('ซิงค์ profile สำเร็จ', 'Profile sync successful'));
      queryClient.invalidateQueries({ queryKey: ['all-users-for-sync'] });
      setRetryingUser(null);
    },
    onError: (error) => {
      toast.error(t('ซิงค์ไม่สำเร็จ', 'Sync failed') + ': ' + (error as Error).message);
      setRetryingUser(null);
    }
  });

  // Resolve all alerts mutation
  const resolveAlertsMutation = useMutation({
    mutationFn: async () => {
      const unresolvedAlerts = profileAlerts?.filter(a => !a.resolved).map(a => a.id) || [];
      if (unresolvedAlerts.length === 0) return { updated: 0 };
      
      const { error } = await supabase
        .from('alerts')
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .in('id', unresolvedAlerts);
      
      if (error) throw error;
      return { updated: unresolvedAlerts.length };
    },
    onSuccess: (data) => {
      toast.success(t(`Resolved ${data.updated} alerts`, `แก้ไข ${data.updated} alerts แล้ว`));
      queryClient.invalidateQueries({ queryKey: ['profile-sync-alerts'] });
    },
    onError: (error) => {
      toast.error(t('แก้ไข alerts ไม่สำเร็จ', 'Failed to resolve alerts'));
    }
  });

  const handleRetrySync = (userId: string) => {
    setRetryingUser(userId);
    retrySyncMutation.mutate(userId);
  };

  const isLoading = usersLoading || alertsLoading;
  const unresolvedCount = profileAlerts?.filter(a => !a.resolved).length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t('Profile Sync Health', 'สุขภาพ Profile Sync')}
          </h1>
          <p className="text-muted-foreground">
            {t(
              'Monitor users with LINE profile sync issues',
              'ติดตาม users ที่ LINE profile sync มีปัญหา'
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['all-users-for-sync'] });
              queryClient.invalidateQueries({ queryKey: ['profile-sync-alerts'] });
            }}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {t('รีเฟรช', 'Refresh')}
          </Button>
          {unresolvedCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => resolveAlertsMutation.mutate()}
              disabled={resolveAlertsMutation.isPending}
            >
              {resolveAlertsMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              {t(`Resolve All (${unresolvedCount})`, `แก้ไขทั้งหมด (${unresolvedCount})`)}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('Users with Issues', 'Users มีปัญหา')}
            </CardTitle>
            <UserX className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.usersWithIssues}</div>
            <p className="text-xs text-muted-foreground">
              {t(`จาก ${stats.totalUsers} users ทั้งหมด`, `out of ${stats.totalUsers} total users`)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('Total Errors', 'Errors ทั้งหมด')}
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">{stats.totalErrors}</div>
            <p className="text-xs text-muted-foreground">
              {t(`${unresolvedCount} unresolved`, `${unresolvedCount} ยังไม่แก้ไข`)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('Missing Avatars', 'ไม่มี Avatar')}
            </CardTitle>
            <ImageOff className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.missingAvatars}</div>
            <p className="text-xs text-muted-foreground">
              {t(`${stats.genericNames} generic names`, `${stats.genericNames} ชื่อ generic`)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('Healthy Users', 'Users ปกติ')}
            </CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{stats.healthyPercent}%</div>
            <p className="text-xs text-muted-foreground">
              {t('ของ users ทั้งหมด', 'of all users')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('Users with Profile Sync Issues', 'Users ที่ Profile Sync มีปัญหา')}</CardTitle>
          <CardDescription>
            {t(
              'Users อาจ block bot หรือออกจาก group แล้ว',
              'These users may have blocked the bot or left the group'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : usersWithIssues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <h3 className="text-lg font-semibold">{t('ยอดเยี่ยม!', 'All Good!')}</h3>
              <p className="text-muted-foreground">
                {t('ไม่มี users ที่มีปัญหา profile sync', 'No users with profile sync issues')}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('User', 'ผู้ใช้')}</TableHead>
                  <TableHead className="text-center">{t('Errors', 'Errors')}</TableHead>
                  <TableHead>{t('Last Error', 'Error ล่าสุด')}</TableHead>
                  <TableHead>{t('Status', 'สถานะ')}</TableHead>
                  <TableHead className="text-right">{t('Actions', 'การกระทำ')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersWithIssues.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback>
                            {user.display_name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{user.display_name}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            ...{user.line_user_id.slice(-6)}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={user.error_count > 100 ? 'destructive' : 'secondary'}>
                        {user.error_count}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.last_error ? (
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(user.last_error), { 
                            addSuffix: true,
                            locale: locale === 'th' ? th : enUS
                          })}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {!user.hasAvatar && (
                          <Badge variant="outline" className="text-destructive border-destructive">
                            <ImageOff className="h-3 w-3 mr-1" />
                            {t('ไม่มี Avatar', 'No Avatar')}
                          </Badge>
                        )}
                        {user.hasGenericName && (
                          <Badge variant="outline" className="text-amber-500 border-amber-500">
                            <UserX className="h-3 w-3 mr-1" />
                            {t('ชื่อ Generic', 'Generic Name')}
                          </Badge>
                        )}
                        {user.hasAvatar && !user.hasGenericName && (
                          <Badge variant="outline" className="text-green-500 border-green-500">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {t('มี Profile', 'Has Profile')}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRetrySync(user.id)}
                          disabled={retryingUser === user.id}
                        >
                          {retryingUser === user.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          <span className="ml-1 hidden sm:inline">{t('ซิงค์', 'Sync')}</span>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/users/${user.id}`}>
                            <ExternalLink className="h-4 w-4" />
                            <span className="ml-1 hidden sm:inline">{t('ดู', 'View')}</span>
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-destructive border-destructive">
                <ImageOff className="h-3 w-3" />
              </Badge>
              <span className="text-muted-foreground">{t('ไม่มี Avatar', 'No Avatar')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-amber-500 border-amber-500">
                <UserX className="h-3 w-3" />
              </Badge>
              <span className="text-muted-foreground">{t('ชื่อ Generic (เช่น "User 8da68c")', 'Generic Name (e.g. "User 8da68c")')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-green-500 border-green-500">
                <CheckCircle2 className="h-3 w-3" />
              </Badge>
              <span className="text-muted-foreground">{t('มี Profile แต่ sync ล้มเหลว', 'Has Profile but sync failed')}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
