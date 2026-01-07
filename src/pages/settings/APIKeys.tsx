import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useState, useCallback } from 'react';
import { Key, Map, MessageSquare, ExternalLink, Eye, EyeOff, Info, CheckCircle2, AlertCircle, Save, AlertTriangle, Loader2, Zap, X, Check, Play } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// API Test functions for each key type
const apiTestFunctions: Record<string, (token: string) => Promise<{ success: boolean; message: string }>> = {
  'MAPBOX_PUBLIC_TOKEN': async (token: string) => {
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/Bangkok.json?access_token=${token}&limit=1`
      );
      if (response.ok) {
        return { success: true, message: 'Mapbox API connected successfully' };
      }
      const data = await response.json();
      return { success: false, message: data.message || 'Invalid token' };
    } catch (e) {
      return { success: false, message: 'Connection failed' };
    }
  },
  'LINE_CHANNEL_ACCESS_TOKEN': async (token: string) => {
    try {
      const response = await fetch('https://api.line.me/v2/bot/info', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        return { success: true, message: `Connected: ${data.displayName || 'LINE Bot'}` };
      }
      return { success: false, message: 'Invalid token or unauthorized' };
    } catch (e) {
      return { success: false, message: 'Connection failed' };
    }
  },
  'GOOGLE_MAPS_API_KEY': async (key: string) => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=Bangkok&key=${key}`
      );
      const data = await response.json();
      if (data.status === 'OK') {
        return { success: true, message: 'Google Maps API connected' };
      } else if (data.status === 'REQUEST_DENIED') {
        return { success: false, message: data.error_message || 'Request denied' };
      }
      return { success: false, message: data.status };
    } catch (e) {
      return { success: false, message: 'Connection failed' };
    }
  },
  'OPENAI_API_KEY': async (key: string) => {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` }
      });
      if (response.ok) {
        return { success: true, message: 'OpenAI API connected' };
      }
      return { success: false, message: 'Invalid API key' };
    } catch (e) {
      return { success: false, message: 'Connection failed' };
    }
  },
  'GOOGLE_CLIENT_ID': async (clientId: string) => {
    // Just verify format - actual OAuth test requires redirect
    if (clientId.endsWith('.apps.googleusercontent.com')) {
      return { success: true, message: 'Valid Google Client ID format' };
    }
    return { success: false, message: 'Invalid Client ID format' };
  },
  'LIFF_ID': async (liffId: string) => {
    // Verify LIFF ID format (typically numeric)
    if (/^\d+-\w+$/.test(liffId) || /^\d{10,}$/.test(liffId)) {
      return { success: true, message: 'Valid LIFF ID format' };
    }
    return { success: false, message: 'Invalid LIFF ID format' };
  },
};

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
  const [testResults, setTestResults] = useState<Record<string, { status: 'idle' | 'loading' | 'success' | 'error'; message?: string }>>({});

  const handleTestConnection = useCallback(async (config: APIConfig) => {
    const value = editValues[config.id] ?? config.key_value ?? '';
    if (!value) {
      toast.error('No value to test', { description: 'Enter an API key first' });
      return;
    }

    const testFn = apiTestFunctions[config.key_name];
    if (!testFn) {
      toast.info('Test not available for this key');
      return;
    }

    setTestResults(prev => ({ ...prev, [config.id]: { status: 'loading' } }));
    
    try {
      const result = await testFn(value);
      setTestResults(prev => ({ 
        ...prev, 
        [config.id]: { status: result.success ? 'success' : 'error', message: result.message } 
      }));
      if (result.success) {
        toast.success('Connection successful', { description: result.message });
      } else {
        toast.error('Connection failed', { description: result.message });
      }
    } catch (e: any) {
      setTestResults(prev => ({ 
        ...prev, 
        [config.id]: { status: 'error', message: e.message || 'Test failed' } 
      }));
      toast.error('Test failed', { description: e.message });
    }
  }, [editValues]);

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

  // Check if MAPBOX is missing in database but might exist in secrets
  const mapboxConfig = configs?.find(c => c.key_name === 'MAPBOX_PUBLIC_TOKEN');
  const showMapboxWarning = mapboxConfig && !mapboxConfig.key_value;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">API Keys Configuration</h2>
        <p className="text-sm text-muted-foreground">
          จัดการ API Keys และ Tokens สำหรับ External Services ที่ระบบใช้งาน
        </p>
      </div>

      {showMapboxWarning && (
        <Alert variant="default" className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-700 dark:text-amber-400">Mapbox Token ต้องการการตั้งค่า</AlertTitle>
          <AlertDescription className="text-amber-600/90 dark:text-amber-400/80">
            หากคุณได้ตั้งค่า Mapbox Token ไว้ใน Supabase Secrets แล้ว กรุณากรอกค่าอีกครั้งในช่อง MAPBOX_PUBLIC_TOKEN ด้านล่าง 
            เพื่อให้ระบบ Map features ทำงานได้ถูกต้อง
          </AlertDescription>
        </Alert>
      )}

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
                  {apiTestFunctions[config.key_name] && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestConnection(config)}
                      disabled={!isConfigured(config) || testResults[config.id]?.status === 'loading'}
                      className="shrink-0"
                    >
                      {testResults[config.id]?.status === 'loading' ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : testResults[config.id]?.status === 'success' ? (
                        <Check className="h-4 w-4 mr-1 text-green-600" />
                      ) : testResults[config.id]?.status === 'error' ? (
                        <X className="h-4 w-4 mr-1 text-red-600" />
                      ) : (
                        <Play className="h-4 w-4 mr-1" />
                      )}
                      Test
                    </Button>
                  )}
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
