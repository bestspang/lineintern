import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { PersonalityRadarChart } from './PersonalityRadarChart';
import { User, Brain, Heart, Clock } from 'lucide-react';

interface UserProfileCardProps {
  profile: any;
}

export function UserProfileCard({ profile }: UserProfileCardProps) {
  const confidenceScores = profile.confidence_scores || {};
  
  const getConfidenceBadge = (score: number) => {
    if (score >= 0.8) return <Badge variant="default">High</Badge>;
    if (score >= 0.5) return <Badge variant="outline">Medium</Badge>;
    return <Badge variant="secondary">Low</Badge>;
  };
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Avatar className="w-12 h-12">
            <AvatarImage src={profile.user?.avatar_url} />
            <AvatarFallback>
              {profile.user?.display_name?.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <CardTitle className="truncate">{profile.user?.display_name}</CardTitle>
            <CardDescription>
              {profile.observation_count} observations
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <Tabs defaultValue="demographics" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="demographics">
              <User className="w-4 h-4" />
            </TabsTrigger>
            <TabsTrigger value="personality">
              <Brain className="w-4 h-4" />
            </TabsTrigger>
            <TabsTrigger value="preferences">
              <Heart className="w-4 h-4" />
            </TabsTrigger>
            <TabsTrigger value="behavior">
              <Clock className="w-4 h-4" />
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="demographics" className="space-y-3 mt-4">
            {profile.inferred_age_range && (
              <div className="space-y-1">
                <Label className="text-xs">Age Range</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{profile.inferred_age_range}</span>
                  {confidenceScores.age_range && getConfidenceBadge(confidenceScores.age_range)}
                </div>
              </div>
            )}
            
            {profile.inferred_gender && (
              <div className="space-y-1">
                <Label className="text-xs">Gender</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm capitalize">{profile.inferred_gender}</span>
                  {confidenceScores.gender && getConfidenceBadge(confidenceScores.gender)}
                </div>
              </div>
            )}
            
            {profile.inferred_occupation && (
              <div className="space-y-1">
                <Label className="text-xs">Occupation</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{profile.inferred_occupation}</span>
                  {confidenceScores.occupation && getConfidenceBadge(confidenceScores.occupation)}
                </div>
              </div>
            )}
            
            {!profile.inferred_age_range && !profile.inferred_gender && !profile.inferred_occupation && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                Not enough data yet
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="personality" className="mt-4">
            {profile.personality_traits && Object.keys(profile.personality_traits).length > 0 ? (
              <PersonalityRadarChart traits={profile.personality_traits} userName={profile.user?.display_name} />
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Personality traits not yet analyzed</p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="preferences" className="space-y-3 mt-4">
            {profile.preferences && Object.keys(profile.preferences).length > 0 ? (
              Object.entries(profile.preferences).map(([category, items]: [string, any]) => (
                <div key={category} className="space-y-1">
                  <Label className="text-xs capitalize">{category.replace('_', ' ')}</Label>
                  <div className="flex flex-wrap gap-1">
                    {Array.isArray(items) ? (
                      items.map((item: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {item}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">{items}</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-sm text-muted-foreground">
                No preferences identified yet
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="behavior" className="space-y-3 mt-4">
            {profile.behavioral_patterns && Object.keys(profile.behavioral_patterns).length > 0 ? (
              Object.entries(profile.behavioral_patterns).map(([pattern, value]: [string, any]) => (
                <div key={pattern} className="space-y-1">
                  <Label className="text-xs capitalize">{pattern.replace('_', ' ')}</Label>
                  <div className="text-sm text-muted-foreground">
                    {typeof value === 'object' ? JSON.stringify(value) : value}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-sm text-muted-foreground">
                No behavioral patterns detected yet
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
