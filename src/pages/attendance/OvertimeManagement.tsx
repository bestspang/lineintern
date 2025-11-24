import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Clock, AlertTriangle, Moon, Play, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function OvertimeManagement() {
  const queryClient = useQueryClient();
  const [isTestingWarning, setIsTestingWarning] = useState(false);
  const [isTestingCheckout, setIsTestingCheckout] = useState(false);

  // Fetch OT warnings from today
  const { data: warnings, isLoading: loadingWarnings } = useQuery({
    queryKey: ["ot-warnings"],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from("attendance_reminders")
        .select(`
          *,
          employees (
            full_name,
            code
          )
        `)
        .in('reminder_type', ['ot_warning', 'ot_exceeded'])
        .gte('reminder_date', today)
        .order('sent_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch auto-checkout logs
  const { data: autoCheckouts, isLoading: loadingCheckouts } = useQuery({
    queryKey: ["auto-checkouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_logs")
        .select(`
          *,
          employees (
            full_name,
            code
          )
        `)
        .eq('event_type', 'check_out')
        .eq('source', 'auto_checkout')
        .gte('server_time', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('server_time', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
  });

  // Test OT warning function
  const testWarningMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('overtime-warning');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`OT warnings checked: ${data.warnings_sent} warnings sent`);
      queryClient.invalidateQueries({ queryKey: ["ot-warnings"] });
    },
    onError: (error: Error) => {
      toast.error("Failed to check OT warnings: " + error.message);
    },
  });

  // Test auto-checkout function
  const testCheckoutMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('auto-checkout-midnight');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Auto-checkout completed: ${data.auto_checkouts} employees checked out`);
      queryClient.invalidateQueries({ queryKey: ["auto-checkouts"] });
    },
    onError: (error: Error) => {
      toast.error("Failed to run auto-checkout: " + error.message);
    },
  });

  const handleTestWarning = async () => {
    setIsTestingWarning(true);
    try {
      await testWarningMutation.mutateAsync();
    } finally {
      setIsTestingWarning(false);
    }
  };

  const handleTestCheckout = async () => {
    if (!confirm("ต้องการรัน Auto-Checkout ทดสอบหรือไม่? จะทำการ Check Out พนักงานที่ยังไม่ได้ Check Out จริง")) {
      return;
    }
    setIsTestingCheckout(true);
    try {
      await testCheckoutMutation.mutateAsync();
    } finally {
      setIsTestingCheckout(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Overtime System Testing</h1>
        <p className="text-muted-foreground">
          Test and debug overtime warnings and auto-checkout system
        </p>
      </div>

      {/* Info Banner */}
      <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-blue-900 dark:text-blue-100">
                Testing Tools Only
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                This page is for testing OT system functions. For managing OT requests, go to{' '}
                <a href="/attendance/overtime-requests" className="underline font-medium">
                  OT Requests page
                </a>.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Control Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            System Controls
          </CardTitle>
          <CardDescription>
            Manually trigger OT system functions for testing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleTestWarning}
              disabled={isTestingWarning}
              variant="outline"
            >
              {isTestingWarning ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Check OT Warnings Now
                </>
              )}
            </Button>

            <Button
              onClick={handleTestCheckout}
              disabled={isTestingCheckout}
              variant="outline"
            >
              {isTestingCheckout ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4 mr-2" />
                  Run Auto-Checkout Test
                </>
              )}
            </Button>
          </div>

          <div className="rounded-lg bg-muted p-4 text-sm space-y-1">
            <p className="font-medium">📋 Automated Schedule:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>OT Warning: Runs every 30 minutes (06:00-23:00)</li>
              <li>Auto-Checkout: Runs daily at 00:01</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* OT Warnings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            OT Warnings (Today)
          </CardTitle>
          <CardDescription>
            Recent overtime warnings sent to employees
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingWarnings ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : warnings && warnings.length > 0 ? (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Sent At</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {warnings.map((warning) => (
                    <TableRow key={warning.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {warning.employees?.full_name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {warning.employees?.code}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={warning.reminder_type === 'ot_exceeded' ? 'destructive' : 'default'}>
                          {warning.reminder_type === 'ot_warning' ? '⚠️ Warning' : '🚨 Exceeded'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {warning.sent_at ? new Date(warning.sent_at).toLocaleString('th-TH') : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{warning.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No OT warnings today
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto-Checkouts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Moon className="h-5 w-5" />
            Auto-Checkouts (Last 7 Days)
          </CardTitle>
          <CardDescription>
            Employees automatically checked out at midnight
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingCheckouts ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : autoCheckouts && autoCheckouts.length > 0 ? (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>OT Hours</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {autoCheckouts.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {log.employees?.full_name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {log.employees?.code}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(log.server_time).toLocaleDateString('th-TH')}
                      </TableCell>
                      <TableCell>
                        {log.overtime_hours ? (
                          <Badge variant={log.overtime_hours > 0 ? 'destructive' : 'secondary'}>
                            {log.overtime_hours.toFixed(1)} hrs
                          </Badge>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          <Clock className="h-3 w-3 mr-1" />
                          Auto
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No auto-checkouts in the last 7 days
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
