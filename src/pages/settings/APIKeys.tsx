import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useState } from 'react';
import { Key, Map, MessageSquare, ExternalLink, Eye, EyeOff, Info, CheckCircle2, AlertCircle, Save } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface APIConfig {
  id: string;
  key_name: string;
  key_value: string | null;
  description: string;
  description_th: string;
  source_url: string;
  is_required: boolean;
  category: string;
}

const categoryIcons: Record<string, React.ReactNode> = {
  maps: <Map className="h-5 w-5" />,
  line: <MessageSquare className="h-5 w-5" />,
  general: <Key className="h-5 w-5" />,
};

const categoryLabels: Record<string, string> = {
  maps: '🗺️ Maps',
  line: '📱 LINE',
  general: '⚙️ General',
};

export default function APIKeys() {
  const queryClient = useQueryClient();
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});

  const { data: configs, isLoading } = useQuery({
    queryKey: ['api-configurations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('api_configurations')
        .select('*')
        .order('category', { ascending: true })
        .order('is_required', { ascending: false });
      
      if (error) throw error;
      return data as APIConfig[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      const { error } = await supabase
        .from('api_configurations')
        .update({ key_value: value.trim() || null })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-configurations'] });
      toast.success('API key saved successfully');
    },
    onError: (error: any) => {
      toast.error('Failed to save API key', { description: error.message });
    },
  });

  const handleSave = (config: APIConfig) => {
    const value = editValues[config.id] ?? config.key_value ?? '';
    updateMutation.mutate({ id: config.id, value });
  };

  const toggleShow = (id: string) => {
    setShowValues(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getValue = (config: APIConfig) => {
    return editValues[config.id] ?? config.key_value ?? '';
  };

  const hasChanges = (config: APIConfig) => {
    const editValue = editValues[config.id];
    if (editValue === undefined) return false;
    return editValue !== (config.key_value ?? '');
  };

  const isConfigured = (config: APIConfig) => {
    const value = getValue(config);
    return value.length > 0;
  };

  // Group configs by category
  const groupedConfigs = configs?.reduce((acc, config) => {
    const category = config.category || 'general';
    if (!acc[category]) acc[category] = [];
    acc[category].push(config);
    return acc;
  }, {} as Record<string, APIConfig[]>) || {};

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">API Keys Configuration</h2>
        <p className="text-sm text-muted-foreground">
          จัดการ API Keys และ Tokens สำหรับ External Services ที่ระบบใช้งาน
        </p>
      </div>

      {Object.entries(groupedConfigs).map(([category, categoryConfigs]) => (
        <Card key={category}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {categoryIcons[category]}
              {categoryLabels[category] || category}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {categoryConfigs.map((config) => (
              <div
                key={config.id}
                className="p-4 border rounded-lg space-y-3 bg-muted/30"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{config.key_name}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>{config.description_th || config.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex items-center gap-2">
                    {isConfigured(config) ? (
                      <Badge variant="default" className="bg-green-500/20 text-green-700 border-green-500/30">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Configured
                      </Badge>
                    ) : config.is_required ? (
                      <Badge variant="destructive">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Required
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        Optional
                      </Badge>
                    )}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  {config.description_th || config.description}
                </p>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showValues[config.id] ? 'text' : 'password'}
                      value={getValue(config)}
                      onChange={(e) => setEditValues(prev => ({ ...prev, [config.id]: e.target.value }))}
                      placeholder={`Enter ${config.key_name}...`}
                      className="pr-10 font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                      onClick={() => toggleShow(config.id)}
                    >
                      {showValues[config.id] ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="shrink-0"
                  >
                    <a
                      href={config.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Get Key
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleSave(config)}
                    disabled={!hasChanges(config) || updateMutation.isPending}
                    className="shrink-0"
                  >
                    <Save className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Card className="border-dashed">
        <CardContent className="py-6">
          <div className="text-center text-sm text-muted-foreground">
            <Info className="h-5 w-5 mx-auto mb-2 opacity-50" />
            <p>API Keys จะถูกเก็บอย่างปลอดภัยในระบบและใช้งานได้ทุก feature</p>
            <p className="text-xs mt-1">ข้อมูลจะถูก sync ข้าม browser/device สำหรับ Admin ทุกคน</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
