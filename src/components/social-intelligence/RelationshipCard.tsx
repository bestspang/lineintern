import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { ArrowLeftRight, Heart, Home, Briefcase, Users, Building, HelpCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface RelationshipCardProps {
  relationship: any;
}

const relationshipIcons: Record<string, any> = {
  romantic: Heart,
  family: Home,
  'boss-employee': Briefcase,
  friends: Users,
  colleagues: Building,
  unknown: HelpCircle,
};

const relationshipColors: Record<string, string> = {
  romantic: 'bg-pink-500',
  family: 'bg-red-500',
  'boss-employee': 'bg-blue-500',
  friends: 'bg-green-500',
  colleagues: 'bg-purple-500',
  unknown: 'bg-muted',
};

const getLearningStatus = (rel: any) => {
  const daysSinceCreated = (Date.now() - new Date(rel.created_at).getTime()) / (1000 * 60 * 60 * 24);
  const wasRecentlyUpdated = (Date.now() - new Date(rel.updated_at).getTime()) / (1000 * 60 * 60 * 24) < 1;
  
  if (rel.confidence_score < 0.3) return { label: "Initial guess", variant: "secondary" as const };
  if (rel.confidence_score < 0.6) return { label: "Still learning", variant: "outline" as const };
  if (wasRecentlyUpdated) return { label: "Recently updated", variant: "default" as const };
  if (rel.confidence_score >= 0.8) return { label: "High confidence", variant: "default" as const };
  return { label: "Stable understanding", variant: "default" as const };
};

export function RelationshipCard({ relationship }: RelationshipCardProps) {
  const Icon = relationshipIcons[relationship.relationship_type] || HelpCircle;
  const learningStatus = getLearningStatus(relationship);
  const confidencePercent = (relationship.confidence_score * 100).toFixed(0);
  
  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="pb-3 p-3 sm:p-6 sm:pb-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <Avatar className="w-8 h-8 sm:w-10 sm:h-10 shrink-0">
              <AvatarImage src={relationship.user_a?.avatar_url} />
              <AvatarFallback>{relationship.user_a?.display_name?.charAt(0)}</AvatarFallback>
            </Avatar>
            <span className="font-medium truncate text-xs sm:text-sm">{relationship.user_a?.display_name}</span>
          </div>
          
          <ArrowLeftRight className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0 self-center sm:self-auto" />
          
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 justify-end">
            <span className="font-medium truncate text-xs sm:text-sm">{relationship.user_b?.display_name}</span>
            <Avatar className="w-8 h-8 sm:w-10 sm:h-10 shrink-0">
              <AvatarImage src={relationship.user_b?.avatar_url} />
              <AvatarFallback>{relationship.user_b?.display_name?.charAt(0)}</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-2 sm:space-y-3 p-3 sm:p-6">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full ${relationshipColors[relationship.relationship_type]} flex items-center justify-center`}>
            <Icon className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
          </div>
          <Badge variant="outline" className="capitalize text-[10px] sm:text-xs h-4 sm:h-5">
            {relationship.relationship_type?.replace('-', ' ') || 'Unknown'}
          </Badge>
          <Badge variant={learningStatus.variant} className="text-[10px] sm:text-xs h-4 sm:h-5">
            {learningStatus.label}
          </Badge>
        </div>
        
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <Label className="text-xs sm:text-sm">Confidence</Label>
            <span className="text-muted-foreground">{confidencePercent}%</span>
          </div>
          <Progress value={relationship.confidence_score * 100} />
        </div>
        
        {relationship.inferred_data?.evidence && relationship.inferred_data.evidence.length > 0 && (
          <div className="space-y-1">
            <Label className="text-[10px] sm:text-xs">Evidence</Label>
            <ul className="list-disc pl-3 sm:pl-4 text-[10px] sm:text-xs text-muted-foreground space-y-1">
              {relationship.inferred_data.evidence.slice(0, 3).map((ev: string, i: number) => (
                <li key={i}>{ev}</li>
              ))}
            </ul>
          </div>
        )}
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 text-[10px] sm:text-xs text-muted-foreground pt-2 border-t">
          <span>{relationship.interaction_count} interactions</span>
          <span>
            Updated {formatDistanceToNow(new Date(relationship.updated_at), { addSuffix: true })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
