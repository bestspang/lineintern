import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useBranchReportContext } from '../context/BranchReportContext';
import { Trophy, Medal, Award, Star } from 'lucide-react';

interface BranchScore {
  branch_name: string;
  score: number;
  salesScore: number;
  targetScore: number;
  tcScore: number;
  reportCount: number;
  avgSales: number;
  targetAchievementRate: number;
  avgTC: number;
}

export default function BranchPerformanceScore() {
  const { filteredReports } = useBranchReportContext();

  const branchScores = useMemo((): BranchScore[] => {
    const byBranch = new Map<string, {
      totalSales: number;
      totalTC: number;
      targetAchieved: number;
      reportCount: number;
      totalTarget: number;
    }>();

    // Aggregate data by branch
    filteredReports.forEach(r => {
      const existing = byBranch.get(r.branch_name) || {
        totalSales: 0,
        totalTC: 0,
        targetAchieved: 0,
        reportCount: 0,
        totalTarget: 0,
      };

      existing.reportCount += 1;
      if (r.sales !== null) existing.totalSales += r.sales;
      if (r.tc !== null) existing.totalTC += r.tc;
      if (r.sales !== null && r.sales_target !== null && r.sales >= r.sales_target) {
        existing.targetAchieved += 1;
      }
      if (r.sales_target !== null) existing.totalTarget += r.sales_target;

      byBranch.set(r.branch_name, existing);
    });

    // Calculate scores
    const allBranches = Array.from(byBranch.entries());
    
    // Find max values for normalization
    const maxAvgSales = Math.max(...allBranches.map(([, d]) => d.totalSales / d.reportCount)) || 1;
    const maxAvgTC = Math.max(...allBranches.map(([, d]) => d.totalTC / d.reportCount)) || 1;

    return allBranches.map(([name, data]) => {
      const avgSales = data.totalSales / data.reportCount;
      const avgTC = data.totalTC / data.reportCount;
      const targetAchievementRate = data.reportCount > 0 
        ? (data.targetAchieved / data.reportCount) * 100 
        : 0;

      // Calculate component scores (0-100)
      const salesScore = Math.round((avgSales / maxAvgSales) * 100);
      const tcScore = Math.round((avgTC / maxAvgTC) * 100);
      const targetScore = Math.round(targetAchievementRate);

      // Weighted overall score
      const score = Math.round(
        (salesScore * 0.4) + 
        (targetScore * 0.35) + 
        (tcScore * 0.25)
      );

      return {
        branch_name: name,
        score,
        salesScore,
        targetScore,
        tcScore,
        reportCount: data.reportCount,
        avgSales: Math.round(avgSales),
        targetAchievementRate: Math.round(targetAchievementRate),
        avgTC: Math.round(avgTC),
      };
    }).sort((a, b) => b.score - a.score);
  }, [filteredReports]);

  if (branchScores.length === 0) {
    return null;
  }

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0: return <Trophy className="h-6 w-6 text-yellow-500" />;
      case 1: return <Medal className="h-6 w-6 text-gray-400" />;
      case 2: return <Award className="h-6 w-6 text-amber-600" />;
      default: return <Star className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-blue-500';
    if (score >= 40) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-blue-500';
    if (score >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          คะแนนประสิทธิภาพสาขา
        </CardTitle>
        <CardDescription>
          คำนวณจาก: ยอดขาย (40%) + บรรลุเป้า (35%) + TC (25%)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {branchScores.slice(0, 10).map((branch, index) => (
            <div key={branch.branch_name} className="flex items-center gap-4">
              <div className="w-8 flex justify-center">
                {getRankIcon(index)}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium truncate">{branch.branch_name}</span>
                  <Badge variant="outline" className="text-xs">
                    {branch.reportCount} รายงาน
                  </Badge>
                </div>
                
                <div className="flex items-center gap-2">
                  <Progress 
                    value={branch.score} 
                    className={`h-2 flex-1 ${getProgressColor(branch.score)}`}
                  />
                  <span className={`font-bold text-lg w-12 text-right ${getScoreColor(branch.score)}`}>
                    {branch.score}
                  </span>
                </div>
                
                <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                  <span>ยอดขายเฉลี่ย: {branch.avgSales.toLocaleString()}</span>
                  <span>บรรลุเป้า: {branch.targetAchievementRate}%</span>
                  <span>TC เฉลี่ย: {branch.avgTC}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
