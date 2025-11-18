import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Calendar, MessageSquare, ListChecks, HelpCircle } from "lucide-react";
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

export default function Summaries() {
  const [summaries, setSummaries] = useState<ChatSummary[]>([]);
  const [filteredSummaries, setFilteredSummaries] = useState<ChatSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSummary, setSelectedSummary] = useState<ChatSummary | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchSummaries();
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
      <div>
        <h1 className="text-3xl font-bold mb-2">Chat Summaries</h1>
        <p className="text-muted-foreground">
          Browse and search past conversation summaries from all groups
        </p>
      </div>

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
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No summaries found</p>
                  {searchQuery && (
                    <p className="text-sm mt-2">Try a different search term</p>
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
