import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useBranchReportContext } from '../context/BranchReportContext';
import { Flame, GlassWater, IceCream } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';

interface TopItem {
  name: string;
  count: number;
}

interface BranchTopSellers {
  branch_name: string;
  topLemonade: TopItem[];
  topSlurpee: TopItem[];
}

// Helper to safely extract array from Json type
function extractStringArray(json: Json | null | undefined): string[] {
  if (!json) return [];
  if (Array.isArray(json)) {
    return json.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

export default function TopSellingHeatmap() {
  const { filteredReports, selectedBranch } = useBranchReportContext();

  // Aggregate top sellers across all reports
  const topSellersData = useMemo((): BranchTopSellers[] => {
    const byBranch = new Map<string, {
      lemonade: Map<string, number>;
      slurpee: Map<string, number>;
    }>();

    filteredReports.forEach(r => {
      const existing = byBranch.get(r.branch_name) || {
        lemonade: new Map<string, number>(),
        slurpee: new Map<string, number>(),
      };

      // Process top_lemonade
      const lemonadeItems = extractStringArray(r.top_lemonade);
      lemonadeItems.forEach((item, idx) => {
        if (item && item.trim()) {
          const cleanItem = item.trim();
          const weight = 3 - Math.min(idx, 2); // First item gets 3 points, second 2, third 1
          existing.lemonade.set(cleanItem, (existing.lemonade.get(cleanItem) || 0) + weight);
        }
      });

      // Process top_slurpee
      const slurpeeItems = extractStringArray(r.top_slurpee);
      slurpeeItems.forEach((item, idx) => {
        if (item && item.trim()) {
          const cleanItem = item.trim();
          const weight = 3 - Math.min(idx, 2);
          existing.slurpee.set(cleanItem, (existing.slurpee.get(cleanItem) || 0) + weight);
        }
      });

      byBranch.set(r.branch_name, existing);
    });

    return Array.from(byBranch.entries())
      .map(([name, data]) => ({
        branch_name: name,
        topLemonade: Array.from(data.lemonade.entries())
          .map(([itemName, count]) => ({ name: itemName, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3),
        topSlurpee: Array.from(data.slurpee.entries())
          .map(([itemName, count]) => ({ name: itemName, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3),
      }))
      .filter(b => b.topLemonade.length > 0 || b.topSlurpee.length > 0)
      .sort((a, b) => a.branch_name.localeCompare(b.branch_name));
  }, [filteredReports]);

  // Overall top sellers
  const overallTop = useMemo(() => {
    const lemonade = new Map<string, number>();
    const slurpee = new Map<string, number>();

    topSellersData.forEach(branch => {
      branch.topLemonade.forEach(item => {
        lemonade.set(item.name, (lemonade.get(item.name) || 0) + item.count);
      });
      branch.topSlurpee.forEach(item => {
        slurpee.set(item.name, (slurpee.get(item.name) || 0) + item.count);
      });
    });

    return {
      lemonade: Array.from(lemonade.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      slurpee: Array.from(slurpee.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    };
  }, [topSellersData]);

  if (topSellersData.length === 0) {
    return null;
  }

  const getHeatColor = (count: number, maxCount: number) => {
    const ratio = count / maxCount;
    if (ratio >= 0.8) return 'bg-red-500 text-white';
    if (ratio >= 0.6) return 'bg-orange-500 text-white';
    if (ratio >= 0.4) return 'bg-yellow-500 text-black';
    if (ratio >= 0.2) return 'bg-green-400 text-black';
    return 'bg-green-200 text-black';
  };

  const maxLemonade = Math.max(...overallTop.lemonade.map(i => i.count), 1);
  const maxSlurpee = Math.max(...overallTop.slurpee.map(i => i.count), 1);

  return (
    <div className="space-y-6">
      {/* Overall Top Sellers */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GlassWater className="h-5 w-5 text-yellow-500" />
              น้ำเลม่อนขายดี (รวมทุกสาขา)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {overallTop.lemonade.map((item, idx) => (
                <Badge 
                  key={item.name} 
                  variant="secondary"
                  className={`${getHeatColor(item.count, maxLemonade)} transition-colors`}
                >
                  <Flame className="h-3 w-3 mr-1" />
                  {idx + 1}. {item.name}
                </Badge>
              ))}
              {overallTop.lemonade.length === 0 && (
                <span className="text-sm text-muted-foreground">ไม่มีข้อมูล</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <IceCream className="h-5 w-5 text-blue-500" />
              น้ำสเลอปี้ขายดี (รวมทุกสาขา)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {overallTop.slurpee.map((item, idx) => (
                <Badge 
                  key={item.name} 
                  variant="secondary"
                  className={`${getHeatColor(item.count, maxSlurpee)} transition-colors`}
                >
                  <Flame className="h-3 w-3 mr-1" />
                  {idx + 1}. {item.name}
                </Badge>
              ))}
              {overallTop.slurpee.length === 0 && (
                <span className="text-sm text-muted-foreground">ไม่มีข้อมูล</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per Branch Details */}
      {selectedBranch === 'all' && topSellersData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">เมนูขายดีแต่ละสาขา</CardTitle>
            <CardDescription>Top 3 ของแต่ละสาขา</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {topSellersData.slice(0, 6).map(branch => (
                <div key={branch.branch_name} className="border rounded-lg p-3">
                  <h4 className="font-medium text-sm mb-2 truncate">{branch.branch_name}</h4>
                  
                  {branch.topLemonade.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <GlassWater className="h-3 w-3" /> เลม่อน
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {branch.topLemonade.slice(0, 2).map((item, idx) => (
                          <span key={item.name} className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">
                            {idx + 1}. {item.name.length > 15 ? item.name.substring(0, 15) + '...' : item.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {branch.topSlurpee.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <IceCream className="h-3 w-3" /> สเลอปี้
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {branch.topSlurpee.slice(0, 2).map((item, idx) => (
                          <span key={item.name} className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                            {idx + 1}. {item.name.length > 15 ? item.name.substring(0, 15) + '...' : item.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
