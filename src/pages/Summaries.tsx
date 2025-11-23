import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Search, Calendar, MessageSquare, ListChecks, HelpCircle, Sparkles, Brain, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface ChatSummary {
  id: string;
  group_id: string;
  from_time: string;
  to_time: string;
  summary_text: string;
  main_topics: string[];
  decisions: any;
  action_items: any;
  open_questions: string[];
  message_count: number;
  created_at: string;
  groups?: {
    display_name: string;
  };
}

interface Group {
  id: string;
  display_name: string;
  line_group_id: string;
}

interface SummaryStats {
  total_messages: number;
  clean_messages: number;
  threads: number;
  selected_messages: number;
  decisions: number;
  actions: number;
  questions: number;
  context?: {
    working_memories: number;
    long_term_memories: number;
    user_profiles: number;
    business_topics: string[];
  };
  quality?: {
    completeness: number;
    actionability: number;
    insightfulness: number;
    confidence: number;
    coverage: {
      messagesAnalyzed: number;
      threadsAnalyzed: number;
      usersInvolved: number;
      importantTopicsCovered: number;
    };
  };
}

export default function Summaries() {
  const [summaries, setSummaries] = useState<ChatSummary[]>([]);
  const [filteredSummaries, setFilteredSummaries] = useState<ChatSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSummary, setSelectedSummary] = useState<ChatSummary | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [messageLimit, setMessageLimit] = useState<string>("200");
  const [lastStats, setLastStats] = useState<SummaryStats | null>(null);
  const { toast } = useToast();

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchSummaries();
      setLastUpdated(new Date());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchSummaries();
    fetchGroups();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredSummaries(summaries);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = summaries.filter(
        (summary) =>
          summary.summary_text.toLowerCase().includes(query) ||
          summary.main_topics.some((topic) => topic.toLowerCase().includes(query)) ||
          summary.groups?.display_name.toLowerCase().includes(query)
      );
      setFilteredSummaries(filtered);
    }
  }, [searchQuery, summaries]);

  const fetchSummaries = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("chat_summaries")
        .select("*, groups(display_name)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setSummaries(data || []);
      setFilteredSummaries(data || []);

      // Fetch total message count for all groups
      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true });
      setMessageCount(count || 0);
    } catch (error: any) {
      console.error("Error fetching summaries:", error);
      toast({
        title: "Error",
        description: "Failed to load summaries",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      const { data, error } = await supabase
        .from("groups")
        .select("id, display_name, line_group_id")
        .eq("status", "active")
        .order("display_name");

      if (error) throw error;
      setGroups(data || []);
      
      // Auto-select first group
      if (data && data.length > 0 && !selectedGroupId) {
        setSelectedGroupId(data[0].id);
      }
    } catch (error: any) {
      console.error("Error fetching groups:", error);
    }
  };

  const generateSummaryNow = async () => {
    if (!selectedGroupId) {
      toast({
        title: "Error",
        description: "Please select a group first",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsGenerating(true);
      const { data, error } = await supabase.functions.invoke("report-generator", {
        body: { 
          type: "auto_summary",
          groupId: selectedGroupId,
          messageLimit: parseInt(messageLimit)
        },
      });

      if (error) throw error;

      // Store stats if available
      if (data?.stats) {
        setLastStats(data.stats);
      }

      toast({
        title: "Success",
        description: data?.message || "Summary generated successfully",
      });

      await fetchSummaries();
    } catch (error: any) {
      console.error("Error generating summary:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate summary",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const formatDateRange = (from: string, to: string) => {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    
    if (format(fromDate, "yyyy-MM-dd") === format(toDate, "yyyy-MM-dd")) {
      return `${format(fromDate, "MMM d, yyyy")} ${format(fromDate, "HH:mm")} - ${format(toDate, "HH:mm")}`;
    }
    return `${format(fromDate, "MMM d, HH:mm")} - ${format(toDate, "MMM d, HH:mm")}`;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold mb-2">Chat Summaries</h1>
          <p className="text-muted-foreground">
            Intelligent conversation summaries with context enrichment and multi-stage analysis
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Total messages: {messageCount} • Last updated: {lastUpdated.toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* Generate New Summary Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Generate New Summary
          </CardTitle>
          <CardDescription>
            Create an intelligent summary with importance scoring, thread clustering, and context enrichment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Select Group</Label>
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a group" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Message Limit</Label>
              <Select value={messageLimit} onValueChange={setMessageLimit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100">Last 100 messages</SelectItem>
                  <SelectItem value="200">Last 200 messages</SelectItem>
                  <SelectItem value="300">Last 300 messages</SelectItem>
                  <SelectItem value="500">Last 500 messages</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button 
                onClick={generateSummaryNow} 
                disabled={isGenerating || !selectedGroupId}
                className="w-full"
              >
                {isGenerating ? "Generating..." : "Generate Summary"}
              </Button>
            </div>
          </div>

          {/* Stats Display */}
          {lastStats && (
            <div className="mt-4 p-4 bg-background rounded-lg border space-y-3">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-primary" />
                <h4 className="font-semibold text-sm">Last Generation Stats</h4>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">Total Messages</div>
                  <div className="font-bold">{lastStats.total_messages}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">After Filtering</div>
                  <div className="font-bold text-green-600">{lastStats.clean_messages}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Threads Detected</div>
                  <div className="font-bold text-blue-600">{lastStats.threads}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Important Messages</div>
                  <div className="font-bold text-purple-600">{lastStats.selected_messages}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm pt-2 border-t">
                <div>
                  <div className="text-muted-foreground text-xs">Decisions</div>
                  <div className="font-bold text-orange-600">{lastStats.decisions}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Action Items</div>
                  <div className="font-bold text-cyan-600">{lastStats.actions}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Questions</div>
                  <div className="font-bold text-pink-600">{lastStats.questions}</div>
                </div>
              </div>

              {lastStats.context && (
                <div className="pt-2 border-t space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Users className="w-3 h-3" />
                    <span>Context Enrichment</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Working Memory:</span> {lastStats.context.working_memories}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Long-term:</span> {lastStats.context.long_term_memories}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Profiles:</span> {lastStats.context.user_profiles}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Topics:</span> {lastStats.context.business_topics.join(', ') || 'General'}
                    </div>
                  </div>
                  
                  <div className="mt-2">
                    <div className="text-xs text-muted-foreground mb-1">Selection Quality</div>
                    <Progress value={(lastStats.selected_messages / lastStats.total_messages) * 100} className="h-2" />
                    <div className="text-xs text-muted-foreground mt-1">
                      {Math.round((lastStats.selected_messages / lastStats.total_messages) * 100)}% of messages selected as important
                    </div>
                  </div>
                </div>
              )}

              {/* Phase 4: Quality Metrics Display */}
              {lastStats.quality && (
                <div className="mt-4 p-4 bg-gradient-to-r from-primary/5 to-purple-500/5 rounded-lg border border-primary/20 space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <h4 className="font-semibold text-sm">Summary Quality Assessment</h4>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {/* Completeness */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium">Completeness</span>
                        <span className="text-xs font-bold text-blue-600">{lastStats.quality.completeness}%</span>
                      </div>
                      <Progress value={lastStats.quality.completeness} className="h-2" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Coverage of key content</p>
                    </div>
                    
                    {/* Actionability */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium">Actionability</span>
                        <span className="text-xs font-bold text-green-600">{lastStats.quality.actionability}%</span>
                      </div>
                      <Progress value={lastStats.quality.actionability} className="h-2" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Clarity of action items</p>
                    </div>
                    
                    {/* Insightfulness */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium">Insightfulness</span>
                        <span className="text-xs font-bold text-purple-600">{lastStats.quality.insightfulness}%</span>
                      </div>
                      <Progress value={lastStats.quality.insightfulness} className="h-2" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Depth of analysis</p>
                    </div>
                    
                    {/* Confidence */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium">Confidence</span>
                        <span className="text-xs font-bold text-orange-600">{lastStats.quality.confidence}%</span>
                      </div>
                      <Progress value={lastStats.quality.confidence} className="h-2" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Overall reliability</p>
                    </div>
                  </div>
                  
                  {/* Overall Quality Score */}
                  <div className="pt-2 border-t">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-semibold">Overall Quality</span>
                      <span className="text-sm font-bold text-primary">
                        {Math.round((
                          lastStats.quality.completeness + 
                          lastStats.quality.actionability + 
                          lastStats.quality.insightfulness + 
                          lastStats.quality.confidence
                        ) / 4)}%
                      </span>
                    </div>
                    <Progress 
                      value={(
                        lastStats.quality.completeness + 
                        lastStats.quality.actionability + 
                        lastStats.quality.insightfulness + 
                        lastStats.quality.confidence
                      ) / 4} 
                      className="h-3"
                    />
                  </div>
                  
                  {/* Coverage Details */}
                  <div className="pt-2 border-t text-xs">
                    <div className="text-muted-foreground mb-1">Coverage Details:</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>📊 Messages: {lastStats.quality.coverage.messagesAnalyzed}</div>
                      <div>🧵 Threads: {lastStats.quality.coverage.threadsAnalyzed}</div>
                      <div>👥 Users: {lastStats.quality.coverage.usersInvolved}</div>
                      <div>🏷️ Topics: {lastStats.quality.coverage.importantTopicsCovered}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search summaries, topics, or groups..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" onClick={fetchSummaries}>
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* List View */}
        <Card>
          <CardHeader>
            <CardTitle>All Summaries ({filteredSummaries.length})</CardTitle>
            <CardDescription>Click on a summary to view details</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-4">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-32 w-full" />
                  ))}
                </div>
              ) : filteredSummaries.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg text-muted-foreground mb-2">No summaries found</p>
                  {searchQuery ? (
                    <p className="text-sm text-muted-foreground mt-2">Try a different search term</p>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Chat summaries are automatically generated after 20 messages in a group
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Current message count: {messageCount}
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSummaries.map((summary) => (
                    <Card
                      key={summary.id}
                      className={`cursor-pointer transition-colors hover:bg-accent ${
                        selectedSummary?.id === summary.id ? "border-primary" : ""
                      }`}
                      onClick={() => setSelectedSummary(summary)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <p className="font-medium">
                              {summary.groups?.display_name || "Unknown Group"}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              <Calendar className="h-3 w-3" />
                              <span>{formatDateRange(summary.from_time, summary.to_time)}</span>
                            </div>
                          </div>
                          <Badge variant="secondary">
                            {summary.message_count} msgs
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {summary.main_topics.slice(0, 3).map((topic, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {topic}
                            </Badge>
                          ))}
                          {summary.main_topics.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{summary.main_topics.length - 3}
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Detail View */}
        <Card>
          <CardHeader>
            <CardTitle>Summary Details</CardTitle>
            <CardDescription>
              {selectedSummary
                ? `${selectedSummary.groups?.display_name || "Unknown Group"} - ${formatDateRange(
                    selectedSummary.from_time,
                    selectedSummary.to_time
                  )}`
                : "Select a summary to view details"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedSummary ? (
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-6">
                  {/* Summary Text */}
                  <div>
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Summary
                    </h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedSummary.summary_text}
                    </p>
                  </div>

                  {/* Main Topics */}
                  {selectedSummary.main_topics.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2 flex items-center gap-2">
                        <ListChecks className="h-4 w-4" />
                        Main Topics
                      </h3>
                      <ul className="space-y-1">
                        {selectedSummary.main_topics.map((topic, idx) => (
                          <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-primary">•</span>
                            <span>{topic}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Decisions */}
                  {Array.isArray(selectedSummary.decisions) && selectedSummary.decisions.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2 flex items-center gap-2">
                        <ListChecks className="h-4 w-4" />
                        Decisions Made
                      </h3>
                      <ul className="space-y-1">
                        {selectedSummary.decisions.map((decision, idx) => (
                          <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-primary">•</span>
                            <span>{decision.text || JSON.stringify(decision)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Action Items */}
                  {Array.isArray(selectedSummary.action_items) && selectedSummary.action_items.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2 flex items-center gap-2">
                        <ListChecks className="h-4 w-4" />
                        Action Items
                      </h3>
                      <ul className="space-y-1">
                        {selectedSummary.action_items.map((item, idx) => (
                          <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-primary">•</span>
                            <span>{item.text || JSON.stringify(item)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Open Questions */}
                  {selectedSummary.open_questions.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2 flex items-center gap-2">
                        <HelpCircle className="h-4 w-4" />
                        Open Questions
                      </h3>
                      <ul className="space-y-1">
                        {selectedSummary.open_questions.map((question, idx) => (
                          <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-primary">•</span>
                            <span>{question}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="pt-4 border-t">
                    <p className="text-xs text-muted-foreground">
                      Summary created: {format(new Date(selectedSummary.created_at), "PPpp")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Based on {selectedSummary.message_count} messages
                    </p>
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="h-[600px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select a summary from the list to view details</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
