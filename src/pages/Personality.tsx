import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Smile, Frown, Meh, Sparkles, Battery, Users, Heart, Lightbulb, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

export default function Personality() {
  const [selectedGroupId, setSelectedGroupId] = useState<string>("all");

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
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                    {state.groups?.display_name || "Unknown Group"}
                  </CardTitle>
                  <CardDescription>
                    Last updated: {new Date(state.updated_at).toLocaleString()}
                  </CardDescription>
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
    </div>
  );
}
