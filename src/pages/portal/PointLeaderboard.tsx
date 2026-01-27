import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trophy, Medal, Award, Crown, Flame, Building2, Globe } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { portalApi } from '@/lib/portal-api';
import { cn } from '@/lib/utils';

interface LeaderboardEntry {
  id: string;
  employeeId: string;
  name: string;
  avatarUrl?: string;
  points: number;
  currentStreak: number;
  rank: number;
}

interface LeaderboardApiResponse {
  id: string;
  employee_id: string;
  point_balance: number;
  current_punctuality_streak: number;
  employee: {
    id: string;
    full_name: string;
    nickname: string | null;
    branch_id: string | null;
  };
}

export default function PointLeaderboard() {
  const { employee, locale } = usePortal();
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<LeaderboardEntry | null>(null);
  const [viewMode, setViewMode] = useState<'branch' | 'all'>('branch');

  const fetchLeaderboard = useCallback(async () => {
    if (!employee?.id) return;
    setLoading(true);

    try {
      const { data, error } = await portalApi<LeaderboardApiResponse[]>({
        endpoint: 'leaderboard',
        employee_id: employee.id,
        params: {
          branchId: viewMode === 'branch' ? employee.branch?.id : undefined,
          limit: 20
        }
      });

      if (!error && data) {
        const entries: LeaderboardEntry[] = data.map((item, index) => ({
          id: item.id,
          employeeId: item.employee_id,
          name: item.employee?.full_name || item.employee?.nickname || 'Unknown',
          points: item.point_balance || 0,
          currentStreak: item.current_punctuality_streak || 0,
          rank: index + 1,
        }));

        setLeaderboard(entries.slice(0, 10));

        // Find user's rank
        const userEntry = entries.find(e => e.employeeId === employee.id);
        if (userEntry) {
          setMyRank(userEntry);
        }
      }
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
    } finally {
      setLoading(false);
    }
  }, [employee?.id, employee?.branch?.id, viewMode]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="h-5 w-5 text-yellow-500" />;
      case 2:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 3:
        return <Award className="h-5 w-5 text-amber-600" />;
      default:
        return <span className="text-sm font-bold text-muted-foreground">#{rank}</span>;
    }
  };

  const getRankBg = (rank: number, isMe: boolean) => {
    if (isMe) return 'bg-primary/10 border-primary';
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border-yellow-200 dark:border-yellow-800';
      case 2:
        return 'bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/20 dark:to-slate-900/20 border-gray-200 dark:border-gray-700';
      case 3:
        return 'bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border-orange-200 dark:border-orange-800';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-yellow-500" />
            {locale === 'th' ? 'Leaderboard' : 'Leaderboard'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {viewMode === 'branch'
              ? (locale === 'th' ? 'อันดับคะแนนในสาขา' : 'Branch point rankings')
              : (locale === 'th' ? 'อันดับคะแนนทั้งบริษัท' : 'Company-wide rankings')}
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <Button
            variant={viewMode === 'branch' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('branch')}
            className="gap-1"
          >
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">{locale === 'th' ? 'สาขา' : 'Branch'}</span>
          </Button>
          <Button
            variant={viewMode === 'all' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('all')}
            className="gap-1"
          >
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">{locale === 'th' ? 'ทั้งหมด' : 'All'}</span>
          </Button>
        </div>
      </div>

      {/* My Rank Card */}
      {myRank && (
        <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-xl font-bold">#{myRank.rank}</span>
                </div>
                <div>
                  <p className="font-semibold">{locale === 'th' ? 'อันดับของคุณ' : 'Your Rank'}</p>
                  <p className="text-2xl font-bold">{myRank.points.toLocaleString()} pts</p>
                </div>
              </div>
              {myRank.currentStreak > 0 && (
                <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-full">
                  <Flame className="h-4 w-4 text-orange-300" />
                  <span className="text-sm font-medium">{myRank.currentStreak}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leaderboard List */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))
        ) : leaderboard.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                {locale === 'th' ? 'ยังไม่มีข้อมูล' : 'No data yet'}
              </p>
            </CardContent>
          </Card>
        ) : (
          leaderboard.map((entry) => {
            const isMe = entry.employeeId === employee?.id;

            return (
              <Card
                key={entry.id}
                className={cn(
                  'transition-all border',
                  getRankBg(entry.rank, isMe),
                  isMe && 'ring-2 ring-primary'
                )}
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 flex justify-center">
                      {getRankIcon(entry.rank)}
                    </div>

                    <Avatar className="h-10 w-10">
                      <AvatarImage src={entry.avatarUrl} />
                      <AvatarFallback className="bg-muted">
                        {entry.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'font-medium truncate',
                        isMe && 'text-primary'
                      )}>
                        {entry.name}
                        {isMe && <span className="ml-1 text-xs">(คุณ)</span>}
                      </p>
                      {entry.currentStreak > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Flame className="h-3 w-3 text-orange-500" />
                          <span>{entry.currentStreak} {locale === 'th' ? 'วันติดต่อกัน' : 'day streak'}</span>
                        </div>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="font-bold text-lg">{entry.points.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">pts</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
