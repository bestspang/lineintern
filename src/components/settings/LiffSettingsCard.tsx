import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Link2, RefreshCw, Save, CheckCircle, AlertCircle, ExternalLink, Loader2, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface LiffInfo {
  success: boolean;
  liffId?: string;
  endpointUrl?: string;
  viewType?: string;
  error?: string;
  message?: string;
  missing?: string[];
}

export default function LiffSettingsCard() {
  const queryClient = useQueryClient();
  const [endpointUrl, setEndpointUrl] = useState('');
  const [hasEdited, setHasEdited] = useState(false);

  // Fetch LIFF ID from api_configurations
  const { data: liffIdConfig, isLoading: isLoadingLiffId } = useQuery({
    queryKey: ['liff-id-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('api_configurations')
        .select('key_value')
        .eq('key_name', 'LIFF_ID')
        .maybeSingle();
      
      if (error) throw error;
      return data?.key_value || null;
    },
  });

  // Fetch current LIFF info from LINE API
  const { data: liffInfo, isLoading: isLoadingLiff, refetch: refetchLiff, isRefetching } = useQuery({
    queryKey: ['liff-settings'],
    queryFn: async (): Promise<LiffInfo> => {
      const { data, error } = await supabase.functions.invoke('liff-settings', {
        body: null,
      });

      // Add action as query param by using a direct fetch
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/liff-settings?action=get`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );

      const result = await response.json();
      return result;
    },
    enabled: !!liffIdConfig,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Update endpoint URL mutation
  const updateEndpointMutation = useMutation({
    mutationFn: async (newEndpointUrl: string) => {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/liff-settings?action=update-endpoint`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ endpointUrl: newEndpointUrl }),
        }
      );

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to update endpoint');
      }
      return result;
    },
    onSuccess: (data) => {
      toast.success('อัพเดท Endpoint URL สำเร็จ', {
        description: data.endpointUrl,
      });
      setHasEdited(false);
      queryClient.invalidateQueries({ queryKey: ['liff-settings'] });
    },
    onError: (error: any) => {
      toast.error('ไม่สามารถอัพเดทได้', {
        description: error.message,
      });
    },
  });

  // Update local state when liffInfo changes
  const handleFetch = async () => {
    const result = await refetchLiff();
    if (result.data?.success && result.data.endpointUrl) {
      setEndpointUrl(result.data.endpointUrl);
      setHasEdited(false);
      toast.success('ดึงข้อมูล LIFF สำเร็จ');
    } else if (result.data?.error === 'missing_credentials') {
      toast.error('ยังไม่ได้ตั้งค่า LINE Login credentials', {
        description: result.data.message,
      });
    }
  };

  const handleEndpointChange = (value: string) => {
    setEndpointUrl(value);
    setHasEdited(true);
  };

  const handleSave = () => {
    if (!endpointUrl.trim()) {
      toast.error('กรุณากรอก Endpoint URL');
      return;
    }
    updateEndpointMutation.mutate(endpointUrl.trim());
  };

  // Show skeleton while loading LIFF ID
  if (isLoadingLiffId) {
    return (
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Show warning if LIFF ID is not configured
  if (!liffIdConfig) {
    return (
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Link2 className="h-4 w-4 sm:h-5 sm:w-5" />
            LIFF Settings
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            ตั้งค่า LIFF Endpoint URL จากที่นี่
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              กรุณาตั้งค่า <strong>LIFF_ID</strong> ในหน้า{' '}
              <a href="/settings/api-keys" className="underline text-primary">
                API Keys
              </a>{' '}
              ก่อนใช้งาน
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Show missing credentials warning
  if (liffInfo?.error === 'missing_credentials') {
    return (
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Link2 className="h-4 w-4 sm:h-5 sm:w-5" />
            LIFF Settings
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            ตั้งค่า LIFF Endpoint URL จากที่นี่
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-muted-foreground">LIFF ID:</span>
            <code className="text-xs bg-muted px-2 py-1 rounded">{liffIdConfig}</code>
          </div>
          
          <Alert variant="default" className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700 dark:text-amber-400">
              <p className="font-medium mb-1">ต้องตั้งค่า LINE Login Credentials</p>
              <p className="text-sm mb-2">
                กรุณาตั้งค่า {liffInfo.missing?.join(', ')} ใน{' '}
                <a href="/settings/api-keys" className="underline font-medium">
                  API Keys
                </a>
              </p>
              <p className="text-xs text-muted-foreground">
                ข้อมูลนี้อยู่ใน LINE Developers Console → LINE Login Channel (ไม่ใช่ Messaging API)
              </p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Link2 className="h-4 w-4 sm:h-5 sm:w-5" />
          LIFF Settings
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          ตั้งค่า LIFF Endpoint URL จากที่นี่ (ไม่ต้องไป LINE Developers Console)
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-4">
        {/* LIFF ID Display */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">LIFF ID:</span>
            <code className="text-xs bg-muted px-2 py-1 rounded">{liffIdConfig}</code>
          </div>
          {liffInfo?.success && (
            <Badge variant="default" className="bg-green-500/20 text-green-700 border-green-500/30">
              <CheckCircle className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          )}
        </div>

        {/* Current Endpoint from LINE */}
        {liffInfo?.success && liffInfo.endpointUrl && !hasEdited && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Info className="h-3 w-3" />
              Endpoint URL ปัจจุบันบน LINE
            </div>
            <code className="text-xs break-all">{liffInfo.endpointUrl}</code>
          </div>
        )}

        {/* Endpoint URL Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Endpoint URL</label>
          <Input
            value={endpointUrl || liffInfo?.endpointUrl || ''}
            onChange={(e) => handleEndpointChange(e.target.value)}
            placeholder="https://your-domain.com"
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            ต้องเป็น HTTPS และไม่มี trailing slash (เช่น https://intern.gem.me)
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleFetch}
            disabled={isRefetching}
          >
            {isRefetching ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            ดึงข้อมูล
          </Button>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasEdited || updateEndpointMutation.isPending}
          >
            {updateEndpointMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            อัพเดท Endpoint
          </Button>

          <Button
            variant="ghost"
            size="sm"
            asChild
          >
            <a
              href="https://developers.line.biz/console/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              LINE Console
            </a>
          </Button>
        </div>

        {/* Help Text */}
        <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
          <p className="font-medium mb-1">💡 วิธีใช้งาน</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>กด "ดึงข้อมูล" เพื่อดู Endpoint URL ปัจจุบัน</li>
            <li>แก้ไข URL ในช่องด้านบน</li>
            <li>กด "อัพเดท Endpoint" เพื่อบันทึกไปยัง LINE</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
