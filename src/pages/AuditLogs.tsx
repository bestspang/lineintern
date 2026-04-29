import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Search, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AuditRow {
  id: string;
  action_type: string;
  resource_type: string;
  resource_id: string | null;
  performed_by_user_id: string | null;
  performed_by_employee_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const PAGE_SIZE = 100;

export default function AuditLogs() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Filters (applied on Search)
  const [functionName, setFunctionName] = useState("");
  const [callerUserId, setCallerUserId] = useState("");
  const [action, setAction] = useState("");
  const [resource, setResource] = useState("");
  const [from, setFrom] = useState(""); // datetime-local
  const [to, setTo] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("audit_logs")
        .select(
          "id,action_type,resource_type,resource_id,performed_by_user_id,performed_by_employee_id,reason,metadata,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (action.trim()) q = q.ilike("action_type", `%${action.trim()}%`);
      if (resource.trim()) q = q.ilike("resource_type", `%${resource.trim()}%`);
      if (callerUserId.trim()) q = q.eq("performed_by_user_id", callerUserId.trim());
      if (functionName.trim()) {
        // metadata.function is set by writeAuditLog
        q = q.eq("metadata->>function", functionName.trim());
      }
      if (from) q = q.gte("created_at", new Date(from).toISOString());
      if (to) q = q.lte("created_at", new Date(to).toISOString());

      const { data, error } = await q;
      if (error) throw error;
      setRows((data ?? []) as AuditRow[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Failed to load audit logs", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clear = () => {
    setFunctionName("");
    setCallerUserId("");
    setAction("");
    setResource("");
    setFrom("");
    setTo("");
  };

  const knownFunctions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const fn = (r.metadata as { function?: string } | null)?.function;
      if (fn) set.add(fn);
    }
    return Array.from(set).sort();
  }, [rows]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">
          Search and filter security-sensitive actions written by guarded edge functions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <Label htmlFor="fn">Function name</Label>
            <Input
              id="fn"
              placeholder="e.g. remote-checkout-approval"
              value={functionName}
              onChange={(e) => setFunctionName(e.target.value)}
              list="known-functions"
            />
            <datalist id="known-functions">
              {knownFunctions.map((fn) => (
                <option key={fn} value={fn} />
              ))}
            </datalist>
          </div>
          <div>
            <Label htmlFor="caller">Caller user id (uuid)</Label>
            <Input
              id="caller"
              placeholder="performed_by_user_id"
              value={callerUserId}
              onChange={(e) => setCallerUserId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="action">Action</Label>
            <Input
              id="action"
              placeholder="approve / reject / backfill / send"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="resource">Resource type</Label>
            <Input
              id="resource"
              placeholder="employee / points / broadcast"
              value={resource}
              onChange={(e) => setResource(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <Input id="to" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          <div className="flex items-end gap-2 md:col-span-3">
            <Button onClick={fetchLogs} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Search
            </Button>
            <Button variant="outline" onClick={clear} disabled={loading}>
              <X className="mr-2 h-4 w-4" />
              Clear
            </Button>
            <Button variant="ghost" onClick={fetchLogs} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              Showing latest {rows.length} of max {PAGE_SIZE}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Results</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[170px]">Time (UTC)</TableHead>
                  <TableHead>Function</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Caller</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      No audit log entries match these filters.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => {
                  const meta = (r.metadata ?? {}) as {
                    function?: string;
                    caller_role?: string;
                  };
                  const isOpen = expanded === r.id;
                  return (
                    <Fragment key={r.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => setExpanded(isOpen ? null : r.id)}
                      >
                        <TableCell className="font-mono text-xs">
                          {new Date(r.created_at).toISOString().replace("T", " ").slice(0, 19)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{meta.function ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{r.action_type}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{r.resource_type}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.performed_by_user_id ? r.performed_by_user_id.slice(0, 8) + "…" : "—"}
                        </TableCell>
                        <TableCell className="text-xs">{meta.caller_role ?? "—"}</TableCell>
                        <TableCell className="max-w-[280px] truncate text-xs" title={r.reason ?? ""}>
                          {r.reason ?? "—"}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-muted/40">
                            <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs">
                              {JSON.stringify(
                                {
                                  id: r.id,
                                  resource_id: r.resource_id,
                                  performed_by_user_id: r.performed_by_user_id,
                                  performed_by_employee_id: r.performed_by_employee_id,
                                  metadata: r.metadata,
                                },
                                null,
                                2,
                              )}
                            </pre>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
