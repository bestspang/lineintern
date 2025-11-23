import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { FileText, TrendingUp, Users, MessageSquare, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

type ReportPeriod = "daily" | "weekly" | "custom";

export default function Reports() {
  const [selectedGroupId, setSelectedGroupId] = useState<string>("all");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("all");
  const [selectedReport, setSelectedReport] = useState<any>(null);

  const { data: groups } = useQuery({
    queryKey: ["groups"],
    queryFn: async () => {
      const { data, error } = await supabase.from("groups").select("*").eq("status", "active").order("display_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: reports, isLoading } = useQuery({
    queryKey: ["reports", selectedGroupId, selectedPeriod],
    queryFn: async () => {
      let query = supabase.from("reports").select("*, groups(display_name)").order("created_at", { ascending: false });
      if (selectedGroupId !== "all") query = query.eq("group_id", selectedGroupId);
      if (selectedPeriod !== "all") query = query.eq("period", selectedPeriod as ReportPeriod);
      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data;
    },
  });

  const getData = (report: any, path: string) => {
    try {
      const keys = path.split('.');
      let value = report.data;
      for (const key of keys) {
        value = value?.[key];
      }
      return value ?? 0;
    } catch {
      return 0;
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
        <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
          <SelectTrigger className="w-full sm:w-[200px] text-sm">
            <SelectValue placeholder="All Groups" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Groups</SelectItem>
            {groups?.map((group) => (
              <SelectItem key={group.id} value={group.id}>{group.display_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-full sm:w-[200px] text-sm">
            <SelectValue placeholder="All Periods" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Periods</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3 sm:space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}><CardHeader className="p-4 sm:p-6"><Skeleton className="h-6 w-1/3" /></CardHeader></Card>
          ))}
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {reports?.length === 0 ? (
            <Card><CardContent className="flex flex-col items-center justify-center p-8 sm:p-12">
              <FileText className="h-8 h-8 sm:h-12 sm:w-12 text-muted-foreground mb-4" />
              <p className="text-sm sm:text-base text-muted-foreground">No reports found</p>
            </CardContent></Card>
          ) : (
            reports?.map((report) => (
              <Card key={report.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setSelectedReport(report)}>
                <CardHeader className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base sm:text-lg truncate">{(report.groups as any)?.display_name || "Unknown Group"}</CardTitle>
                      <CardDescription className="text-xs sm:text-sm">
                        {format(new Date(report.from_date), "MMM d")} - {format(new Date(report.to_date), "MMM d, yyyy")}
                      </CardDescription>
                    </div>
                    <Badge className="shrink-0 text-xs">{report.period}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-xs sm:text-sm">
                    <div><div className="text-muted-foreground">Messages</div><div className="font-semibold">{getData(report, 'activity.totalMessages')}</div></div>
                    <div><div className="text-muted-foreground">Users</div><div className="font-semibold">{getData(report, 'activity.activeUsers')}</div></div>
                    <div><div className="text-muted-foreground">Mood</div><div className="font-semibold">{(getData(report, 'sentiment.moodScore') * 100).toFixed(0)}/100</div></div>
                    <div><div className="text-muted-foreground">Alerts</div><div className="font-semibold">{getData(report, 'safety.total')}</div></div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
