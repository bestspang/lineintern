import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export default function AttendanceSummaries() {
  const { data: summaries, isLoading } = useQuery({
    queryKey: ['daily-summaries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_attendance_summaries')
        .select('*, branch:branches(name)')
        .order('summary_date', { ascending: false })
        .limit(30);
      
      if (error) throw error;
      return data;
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-3 sm:py-6 space-y-4 sm:space-y-6">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
            Daily Summaries
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            View daily attendance summaries sent to LINE groups
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6">
          {summaries?.map((summary) => (
            <Card key={summary.id}>
              <CardHeader className="p-3 sm:p-6">
                <CardTitle className="text-sm sm:text-base">
                  {summary.branch?.name} - {format(new Date(summary.summary_date), 'MMM dd, yyyy')}
                </CardTitle>
                <CardDescription className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs sm:text-sm">
                  <div>Checked In: {summary.checked_in}/{summary.total_employees}</div>
                  <div>Checked Out: {summary.checked_out}/{summary.total_employees}</div>
                  <div>Late: {summary.late_count}</div>
                  <div>Flagged: {summary.flagged_count}</div>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="text-xs whitespace-pre-wrap font-mono bg-muted p-4 rounded-md">
                  {summary.summary_text}
                </pre>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
