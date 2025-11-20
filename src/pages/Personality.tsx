import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Smile, Frown, Meh, Sparkles, Battery, Users, Heart, Lightbulb, MessageCircle, RotateCcw, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const getMoodEmoji = (mood: string) => {
  const moodMap: Record<string, { icon: typeof Smile; color: string }> = {
    happy: { icon: Smile, color: "text-green-500" },
    excited: { icon: Sparkles, color: "text-yellow-500" },
    neutral: { icon: Meh, color: "text-gray-500" },
    thoughtful: { icon: Lightbulb, color: "text-blue-500" },
    tired: { icon: Battery, color: "text-orange-500" },
    sad: { icon: Frown, color: "text-red-500" },
  };
  return moodMap[mood] || moodMap.neutral;
};

const getMoodScore = (mood: string): number => {
  const moodScoreMap: Record<string, number> = {
    excited: 95,
    happy: 85,
    thoughtful: 65,
    neutral: 50,
    tired: 35,
    sad: 20,
  };
  return moodScoreMap[mood] || 50;
};

export default function Personality() {
  const [selectedGroupId, setSelectedGroupId] = useState<string>("all");
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Check if user is admin
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin", user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch magic mode groups
  const { data: magicGroups, isLoading: loadingGroups } = useQuery({
    queryKey: ["magic-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("groups")
        .select("id, display_name, line_group_id")
        .eq("mode", "magic")
        .eq("status", "active")
        .order("display_name");

      if (error) throw error;
      return data;
    },
  });

  // Fetch personality state
  const { data: personalityStates, isLoading: loadingPersonality } = useQuery({
    queryKey: ["personality-states", selectedGroupId],
    queryFn: async () => {
      let query = supabase
        .from("personality_state")
        .select(`
          *,
          groups (
            id,
            display_name,
            line_group_id
          )
        `)
        .order("updated_at", { ascending: false });

      if (selectedGroupId !== "all") {
        query = query.eq("group_id", selectedGroupId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!magicGroups,
  });

  // Fetch mood history for the selected group
  const { data: moodHistory, isLoading: loadingHistory } = useQuery({
    queryKey: ["mood-history", selectedGroupId],
    queryFn: async () => {
      if (selectedGroupId === "all") return [];

      const { data, error } = await supabase
        .from("mood_history")
        .select("*")
        .eq("group_id", selectedGroupId)
        .order("recorded_at", { ascending: true })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    enabled: selectedGroupId !== "all" && !!magicGroups,
  });

  // Reset personality mutation
  const resetPersonalityMutation = useMutation({
    mutationFn: async (personalityId: string) => {
      const { error } = await supabase
        .from("personality_state")
        .update({
          mood: "neutral",
          energy_level: 50,
          personality_traits: { humor: 50, curiosity: 70, helpfulness: 80 },
          current_interests: [],
          recent_topics: [],
          relationship_map: {},
          last_mood_change: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", personalityId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personality-states"] });
      toast.success("Personality state reset to default values");
      setResetDialogOpen(false);
      setResetTargetId(null);
    },
    onError: (error) => {
      console.error("Reset personality error:", error);
      toast.error("Failed to reset personality state");
    },
  });

  const handleResetClick = (personalityId: string) => {
    setResetTargetId(personalityId);
    setResetDialogOpen(true);
  };

  const handleResetConfirm = () => {
    if (resetTargetId) {
      resetPersonalityMutation.mutate(resetTargetId);
    }
  };

  if (loadingGroups) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Personality Dashboard</h1>
          <p className="text-muted-foreground">Loading magic mode groups...</p>
        </div>
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  if (!magicGroups || magicGroups.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Personality Dashboard</h1>
          <p className="text-muted-foreground">View AI mood, energy, interests, and relationships for magic mode groups</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>No Magic Mode Groups</CardTitle>
            <CardDescription>
              There are no groups currently in Magic Mode. Switch a group to "magic" mode to enable personality tracking.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Personality Dashboard</h1>
        <p className="text-muted-foreground">View AI mood, energy, interests, and relationships for magic mode groups</p>
      </div>

      {/* Group Filter */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">Filter by Group:</label>
        <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
          <SelectTrigger className="w-[300px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Magic Mode Groups</SelectItem>
            {magicGroups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Mood History Chart (only for single group selection) */}
      {selectedGroupId !== "all" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              Mood & Energy History
            </CardTitle>
            <CardDescription>
              Track how the AI's mood and energy have evolved over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <Skeleton className="h-[300px] w-full" />
            ) : !moodHistory || moodHistory.length === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No mood history recorded yet. The AI will start tracking mood changes after messages in magic mode.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={moodHistory.map(h => ({
                  time: new Date(h.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' }),
                  energy: h.energy_level,
                  moodScore: getMoodScore(h.mood),
                  moodLabel: h.mood,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="time" 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    domain={[0, 100]}
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                            <p className="text-sm font-medium mb-2">{payload[0].payload.time}</p>
                            <div className="space-y-1">
                              <p className="text-sm flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--primary))' }}></span>
                                <span>Energy: {payload[0].payload.energy}%</span>
                              </p>
                              <p className="text-sm flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-2))' }}></span>
                                <span>Mood: {payload[0].payload.moodLabel} ({payload[0].payload.moodScore})</span>
                              </p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="energy" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    name="Energy Level"
                    dot={{ fill: 'hsl(var(--primary))' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="moodScore" 
                    stroke="hsl(var(--chart-2))" 
                    strokeWidth={2}
                    name="Mood Sentiment"
                    dot={{ fill: 'hsl(var(--chart-2))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Personality States */}
      {loadingPersonality ? (
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-[300px]" />
          <Skeleton className="h-[300px]" />
        </div>
      ) : !personalityStates || personalityStates.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Personality Data</CardTitle>
            <CardDescription>
              No personality data found for the selected group(s). The AI will start learning after the first message in a magic mode group.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-6">
          {personalityStates.map((state) => {
            const moodInfo = getMoodEmoji(state.mood);
            const MoodIcon = moodInfo.icon;
            const traits = state.personality_traits as { humor: number; helpfulness: number; curiosity: number } || { humor: 50, helpfulness: 50, curiosity: 50 };
            const interests = (state.current_interests as string[]) || [];
            const recentTopics = (state.recent_topics as { topic: string; count: number }[]) || [];
            const relationshipMap = (state.relationship_map as Record<string, { familiarity: number; tone: string }>) || {};

            return (
              <Card key={state.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-purple-500" />
                        {state.groups?.display_name || "Unknown Group"}
                      </CardTitle>
                      <CardDescription>
                        Last updated: {new Date(state.updated_at).toLocaleString()}
                      </CardDescription>
                    </div>
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResetClick(state.id)}
                        disabled={resetPersonalityMutation.isPending}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Reset
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Mood & Energy Row */}
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Mood */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Current Mood</span>
                        <MoodIcon className={`h-6 w-6 ${moodInfo.color}`} />
                      </div>
                      <Badge variant="outline" className="text-lg capitalize">
                        {state.mood}
                      </Badge>
                      {state.last_mood_change && (
                        <p className="text-xs text-muted-foreground">
                          Changed: {new Date(state.last_mood_change).toLocaleString()}
                        </p>
                      )}
                    </div>

                    {/* Energy Level */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Energy Level</span>
                        <Battery className="h-5 w-5 text-yellow-500" />
                      </div>
                      <Progress value={state.energy_level} className="h-3" />
                      <p className="text-sm text-muted-foreground">{state.energy_level}%</p>
                    </div>
                  </div>

                  {/* Personality Traits */}
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Heart className="h-4 w-4 text-pink-500" />
                      Personality Traits
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Humor</span>
                          <span className="text-muted-foreground">{traits.humor}%</span>
                        </div>
                        <Progress value={traits.humor} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Helpfulness</span>
                          <span className="text-muted-foreground">{traits.helpfulness}%</span>
                        </div>
                        <Progress value={traits.helpfulness} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Curiosity</span>
                          <span className="text-muted-foreground">{traits.curiosity}%</span>
                        </div>
                        <Progress value={traits.curiosity} className="h-2" />
                      </div>
                    </div>
                  </div>

                  {/* Current Interests */}
                  <div className="space-y-2">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-blue-500" />
                      Current Interests
                    </h3>
                    {interests.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {interests.map((interest, idx) => (
                          <Badge key={idx} variant="secondary">
                            {interest}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No interests tracked yet</p>
                    )}
                  </div>

                  {/* Recent Topics */}
                  {recentTopics.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-semibold flex items-center gap-2">
                        <MessageCircle className="h-4 w-4 text-green-500" />
                        Recent Topics
                      </h3>
                      <div className="space-y-1">
                        {recentTopics.slice(0, 5).map((topic, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span>{topic.topic}</span>
                            <Badge variant="outline" className="text-xs">
                              {topic.count}x
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Relationship Map */}
                  <div className="space-y-2">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4 text-purple-500" />
                      Top Relationships
                    </h3>
                    {Object.keys(relationshipMap).length > 0 ? (
                      <div className="space-y-2">
                        {Object.entries(relationshipMap)
                          .sort(([, a], [, b]) => b.familiarity - a.familiarity)
                          .slice(0, 5)
                          .map(([userId, rel]) => (
                            <div key={userId} className="flex items-center justify-between">
                              <span className="text-sm truncate max-w-[200px]">{userId}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs capitalize">
                                  {rel.tone}
                                </Badge>
                                <Progress value={rel.familiarity} className="h-2 w-20" />
                                <span className="text-xs text-muted-foreground w-10 text-right">
                                  {rel.familiarity}%
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No relationships tracked yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Personality State?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset the AI's personality back to default values:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Mood: Neutral</li>
                <li>Energy Level: 50%</li>
                <li>Personality Traits: Default values</li>
                <li>Clear all interests and recent topics</li>
                <li>Clear all relationship data</li>
              </ul>
              <p className="mt-3 font-medium">
                The group will remain in Magic Mode and will start learning again from new messages.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetConfirm}>
              Reset Personality
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
