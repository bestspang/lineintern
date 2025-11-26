import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Shield, AlertTriangle, Copy, Clock, MapPin, User, Calendar } from "lucide-react";
import { format } from "date-fns";

interface FraudLog {
  id: string;
  employee_id: string;
  event_type: string;
  server_time: string;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  fraud_score: number;
  fraud_reasons: string[];
  photo_hash: string | null;
  exif_data: any;
  employee: {
    full_name: string;
    code: string;
  };
  branch: {
    name: string;
  } | null;
}

interface FraudStats {
  total_logs: number;
  flagged_logs: number;
  high_risk_logs: number;
  duplicate_photos: number;
  suspicious_timing: number;
}

export default function FraudDetection() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<string>("all");
  const [selectedLog, setSelectedLog] = useState<FraudLog | null>(null);
  const [comparisonLog, setComparisonLog] = useState<FraudLog | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  // Fetch fraud statistics
  const { data: stats } = useQuery({
    queryKey: ["fraud-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_fraud_detection_stats");
      if (error) throw error;
      return data[0] as FraudStats;
    },
  });

  // Fetch flagged logs
  const { data: flaggedLogs, isLoading } = useQuery({
    queryKey: ["fraud-logs", selectedRiskLevel],
    queryFn: async () => {
      let query = supabase
        .from("attendance_logs")
        .select(`
          *,
          employee:employees!attendance_logs_employee_id_fkey(full_name, code),
          branch:branches!attendance_logs_branch_id_fkey(name)
        `)
        .gt("fraud_score", 0)
        .order("fraud_score", { ascending: false })
        .order("server_time", { ascending: false })
        .limit(100);

      if (selectedRiskLevel === "high") {
        query = query.gte("fraud_score", 70);
      } else if (selectedRiskLevel === "medium") {
        query = query.gte("fraud_score", 40).lt("fraud_score", 70);
      } else if (selectedRiskLevel === "low") {
        query = query.lt("fraud_score", 40);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as FraudLog[];
    },
  });

  const filteredLogs = flaggedLogs?.filter(log =>
    log.employee.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.employee.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRiskColor = (score: number) => {
    if (score >= 70) return "destructive";
    if (score >= 40) return "default";
    return "secondary";
  };

  const getRiskLabel = (score: number) => {
    if (score >= 70) return "High Risk";
    if (score >= 40) return "Medium Risk";
    return "Low Risk";
  };

  const handleViewDetails = async (log: FraudLog) => {
    setSelectedLog(log);
    
    // If it's a duplicate, try to find the original
    if (log.fraud_reasons?.includes("duplicate_photo") && log.photo_hash) {
      const { data } = await supabase
        .from("attendance_logs")
        .select(`
          *,
          employee:employees!attendance_logs_employee_id_fkey(full_name, code),
          branch:branches!attendance_logs_branch_id_fkey(name)
        `)
        .eq("photo_hash", log.photo_hash)
        .neq("id", log.id)
        .order("server_time", { ascending: true })
        .limit(1)
        .maybeSingle();
      
      if (data) {
        setComparisonLog(data as FraudLog);
      } else {
        setComparisonLog(null);
      }
    }
  };

  // Generate signed URLs when logs load
  useEffect(() => {
    if (!flaggedLogs) return;

    const generateUrls = async () => {
      const urls: Record<string, string> = {};
      
      for (const log of flaggedLogs) {
        if (log.photo_url) {
          const { data, error } = await supabase.storage
            .from("attendance-photos")
            .createSignedUrl(log.photo_url, 3600);
          
          if (data && !error) {
            urls[log.id] = data.signedUrl;
          }
        }
      }
      
      setPhotoUrls(urls);
    };

    generateUrls();
  }, [flaggedLogs]);

  // Generate signed URL for comparison log when it's set
  useEffect(() => {
    if (!comparisonLog || !comparisonLog.photo_url) return;

    const generateUrl = async () => {
      const { data, error } = await supabase.storage
        .from("attendance-photos")
        .createSignedUrl(comparisonLog.photo_url!, 3600);
      
      if (data && !error) {
        setPhotoUrls(prev => ({ ...prev, [comparisonLog.id]: data.signedUrl }));
      }
    };

    generateUrl();
  }, [comparisonLog]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Fraud Detection Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor and investigate suspicious attendance patterns
          </p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Logs (30d)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_logs || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Flagged</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats?.flagged_logs || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>High Risk</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats?.high_risk_logs || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Duplicates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats?.duplicate_photos || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Suspicious Timing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats?.suspicious_timing || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="Search by employee name or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Select value={selectedRiskLevel} onValueChange={setSelectedRiskLevel}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Risk Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="high">High Risk</SelectItem>
                <SelectItem value="medium">Medium Risk</SelectItem>
                <SelectItem value="low">Low Risk</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Flagged Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Flagged Attendance Logs</CardTitle>
          <CardDescription>
            Showing {filteredLogs?.length || 0} suspicious logs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : filteredLogs && filteredLogs.length > 0 ? (
            <div className="space-y-4">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent cursor-pointer"
                  onClick={() => handleViewDetails(log)}
                >
                  {log.photo_url && photoUrls[log.id] && (
                    <img
                      src={photoUrls[log.id]}
                      alt="Attendance"
                      className="w-16 h-16 rounded object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{log.employee.full_name}</span>
                      <Badge variant="outline">{log.employee.code}</Badge>
                      <Badge variant={getRiskColor(log.fraud_score)}>
                        {getRiskLabel(log.fraud_score)} ({log.fraud_score})
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(log.server_time), "MMM dd, yyyy HH:mm")}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {log.branch?.name || "Unknown"}
                      </span>
                      <span className="capitalize">{log.event_type}</span>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {log.fraud_reasons?.map((reason, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {reason.replace(/_/g, " ")}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    View Details
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No flagged logs found</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={!!selectedLog} onOpenChange={() => { setSelectedLog(null); setComparisonLog(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Fraud Investigation Details
            </DialogTitle>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-6">
              {/* Risk Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Risk Assessment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <Badge variant={getRiskColor(selectedLog.fraud_score)} className="text-lg px-4 py-2">
                      {getRiskLabel(selectedLog.fraud_score)} - Score: {selectedLog.fraud_score}
                    </Badge>
                    <div className="flex-1">
                      <div className="text-sm text-muted-foreground">Detected Issues:</div>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {selectedLog.fraud_reasons?.map((reason, idx) => (
                          <Badge key={idx} variant="outline">
                            {reason.replace(/_/g, " ")}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Employee & Event Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Event Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{selectedLog.employee.full_name}</span>
                    <Badge variant="outline">{selectedLog.employee.code}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{format(new Date(selectedLog.server_time), "MMMM dd, yyyy 'at' HH:mm:ss")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedLog.branch?.name || "Unknown Branch"}</span>
                    {selectedLog.latitude && selectedLog.longitude && (
                      <a
                        href={`https://www.google.com/maps?q=${selectedLog.latitude},${selectedLog.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        View on Map
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Photo Comparison */}
              {comparisonLog ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Copy className="h-4 w-4" />
                      Duplicate Photo Detected
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm font-semibold mb-2">Original Photo</div>
                        {photoUrls[comparisonLog.id] ? (
                          <img
                            src={photoUrls[comparisonLog.id]}
                            alt="Original"
                            className="w-full rounded-lg border"
                          />
                        ) : (
                          <div className="w-full h-48 bg-muted rounded-lg border flex items-center justify-center">
                            <span className="text-muted-foreground">Loading...</span>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-2">
                          {format(new Date(comparisonLog.server_time), "MMM dd, yyyy HH:mm")}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-semibold mb-2">Current Photo</div>
                        {photoUrls[selectedLog.id] ? (
                          <img
                            src={photoUrls[selectedLog.id]}
                            alt="Current"
                            className="w-full rounded-lg border"
                          />
                        ) : (
                          <div className="w-full h-48 bg-muted rounded-lg border flex items-center justify-center">
                            <span className="text-muted-foreground">Loading...</span>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-2">
                          {format(new Date(selectedLog.server_time), "MMM dd, yyyy HH:mm")}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : selectedLog.photo_url && photoUrls[selectedLog.id] ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Photo Evidence</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <img
                      src={photoUrls[selectedLog.id]}
                      alt="Attendance"
                      className="w-full max-w-md mx-auto rounded-lg border"
                    />
                  </CardContent>
                </Card>
              ) : null}

              {/* Technical Details */}
              {selectedLog.exif_data && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Technical Metadata</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-40">
                      {JSON.stringify(selectedLog.exif_data, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
