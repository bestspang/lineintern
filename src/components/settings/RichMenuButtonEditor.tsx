import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Save, AlertCircle, CheckCircle, Link2, MessageSquare, ExternalLink } from 'lucide-react';

interface ButtonConfig {
  id: string;
  position: number;
  label: string;
  icon: string | null;
  action_type: 'uri' | 'message';
  action_value: string;
  description: string | null;
  is_enabled: boolean;
}

export default function RichMenuButtonEditor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editedConfigs, setEditedConfigs] = useState<Record<number, Partial<ButtonConfig>>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch button configs
  const { data: buttonConfigs, isLoading, error } = useQuery({
    queryKey: ['richmenu-button-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('richmenu_button_config')
        .select('*')
        .order('position');
      
      if (error) throw error;
      return data as ButtonConfig[];
    },
  });

  // Fetch LIFF ID for preview
  const { data: liffSetting } = useQuery({
    queryKey: ['liff-settings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('api_configurations')
        .select('key_value')
        .eq('key_name', 'LIFF_ID')
        .maybeSingle();
      return data?.key_value as string | null;
    },
  });

  // Reset edited configs when data loads
  useEffect(() => {
    if (buttonConfigs) {
      const initial: Record<number, Partial<ButtonConfig>> = {};
      buttonConfigs.forEach(config => {
        initial[config.position] = {
          label: config.label,
          action_type: config.action_type,
          action_value: config.action_value,
        };
      });
      setEditedConfigs(initial);
      setHasChanges(false);
    }
  }, [buttonConfigs]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates = Object.entries(editedConfigs).map(([position, changes]) => ({
        position: parseInt(position),
        ...changes,
        updated_at: new Date().toISOString(),
      }));

      // Update each button config
      for (const update of updates) {
        const { error } = await supabase
          .from('richmenu_button_config')
          .update({
            label: update.label,
            action_type: update.action_type,
            action_value: update.action_value,
            updated_at: update.updated_at,
          })
          .eq('position', update.position);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['richmenu-button-config'] });
      setHasChanges(false);
      toast({
        title: 'บันทึกสำเร็จ',
        description: 'การตั้งค่าปุ่ม Rich Menu ถูกบันทึกแล้ว ต้อง Redeploy เพื่อให้มีผลใน LINE',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save button config',
        variant: 'destructive',
      });
    },
  });

  // Handle field change
  const handleChange = (position: number, field: keyof ButtonConfig, value: string) => {
    setEditedConfigs(prev => ({
      ...prev,
      [position]: {
        ...prev[position],
        [field]: value,
      },
    }));
    setHasChanges(true);
  };

  // Default LIFF URL when action_value is empty
  const DEFAULT_LIFF_URL = 'https://liff.line.me/2008841252-SKfNa87Z';

  // Validate action value
  const validateActionValue = (type: 'uri' | 'message', value: string): { valid: boolean; message: string } => {
    // Empty is allowed for URI type (will use default LIFF URL)
    if (!value.trim()) {
      if (type === 'uri') {
        return { valid: true, message: '' }; // Empty URI is OK, will use default
      }
      return { valid: false, message: 'ต้องกรอกค่า command' };
    }
    if (type === 'uri') {
      if (!value.startsWith('/') && !value.startsWith('http')) {
        return { valid: false, message: 'URI ต้องเริ่มด้วย / หรือ https://' };
      }
    } else if (type === 'message') {
      if (!value.startsWith('/')) {
        return { valid: false, message: 'Command ต้องเริ่มด้วย /' };
      }
    }
    return { valid: true, message: '' };
  };

  // Build preview URL
  const getPreviewUrl = (config: Partial<ButtonConfig>) => {
    if (config.action_type === 'message') {
      return `ส่งข้อความ: ${config.action_value || '(ต้องกรอก)'}`;
    }
    // Empty URI -> default LIFF URL
    if (!config.action_value?.trim()) {
      return DEFAULT_LIFF_URL;
    }
    if (config.action_value?.startsWith('http')) {
      return config.action_value;
    }
    const liffBase = liffSetting ? `https://liff.line.me/${liffSetting}` : 'https://liff.line.me/[LIFF_ID]';
    return `${liffBase}${config.action_value}`;
  };

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-950/30 p-4 rounded-lg text-red-700 dark:text-red-400 flex items-center gap-2">
        <AlertCircle className="h-4 w-4" />
        <span>Failed to load button configuration</span>
      </div>
    );
  }

  const positionLabels = ['ซ้ายบน', 'กลางบน', 'ขวาบน', 'ซ้ายล่าง', 'กลางล่าง', 'ขวาล่าง'];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium flex items-center gap-2">
            ⚙️ แก้ไข Actions ของแต่ละปุ่ม
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            เปลี่ยน link หรือ command ที่ส่งเมื่อกดแต่ละปุ่ม
          </p>
        </div>
        {hasChanges && (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
            มีการเปลี่ยนแปลง
          </Badge>
        )}
      </div>

      {/* Button Config Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">ตำแหน่ง</TableHead>
              <TableHead className="w-[140px]">Label</TableHead>
              <TableHead className="w-[100px]">Type</TableHead>
              <TableHead>Action Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {buttonConfigs?.map((config, index) => {
              const edited = editedConfigs[config.position] || {};
              const currentType = (edited.action_type || config.action_type) as 'uri' | 'message';
              const currentValue = edited.action_value ?? config.action_value;
              const validation = validateActionValue(currentType, currentValue);
              
              return (
                <TableRow key={config.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">{positionLabels[index]}</span>
                      <span className="flex items-center gap-1">
                        <span>{config.icon}</span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={edited.label ?? config.label}
                      onChange={(e) => handleChange(config.position, 'label', e.target.value)}
                      className="h-8 text-sm"
                      placeholder="Label"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={currentType}
                      onValueChange={(v) => handleChange(config.position, 'action_type', v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="uri">
                          <span className="flex items-center gap-1">
                            <Link2 className="h-3 w-3" />
                            URI
                          </span>
                        </SelectItem>
                        <SelectItem value="message">
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            Message
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Input
                        value={currentValue}
                        onChange={(e) => handleChange(config.position, 'action_value', e.target.value)}
                        className={`h-8 text-sm font-mono ${!validation.valid ? 'border-red-300' : ''}`}
                        placeholder={currentType === 'uri' ? 'ว่าง = เปิดเมนูหลัก' : '/command'}
                      />
                      {!validation.valid && (
                        <p className="text-xs text-red-500">{validation.message}</p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Preview Section */}
      <div className="bg-muted/50 p-3 rounded-lg space-y-2">
        <Label className="text-xs font-medium flex items-center gap-1">
          <ExternalLink className="h-3 w-3" />
          Preview URLs
        </Label>
        <div className="space-y-1">
          {buttonConfigs?.map((config) => {
            const edited = editedConfigs[config.position] || {};
            const merged = { ...config, ...edited };
            return (
              <div key={config.id} className="flex items-center gap-2 text-xs">
                <span className="w-6">{config.icon}</span>
                <span className="font-medium w-24 truncate">{merged.label}</span>
                <code className="flex-1 bg-background px-2 py-1 rounded text-muted-foreground truncate">
                  {getPreviewUrl(merged)}
                </code>
              </div>
            );
          })}
        </div>
      </div>

      {/* Help Text */}
      <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg">
        <p className="font-medium mb-1">💡 คำแนะนำ</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li><strong>URI</strong> = เปิด LIFF App (เช่น /portal/checkin → เปิดหน้า Check-in)</li>
          <li><strong>URI ว่าง</strong> = เปิดเมนูหลัก ({DEFAULT_LIFF_URL})</li>
          <li><strong>Message</strong> = ส่งข้อความ command (เช่น /status → Bot ตอบสถานะ)</li>
          <li>หลังบันทึก ต้อง <strong>Redeploy Rich Menu</strong> ด้านบนเพื่อให้มีผลใน LINE</li>
        </ul>
      </div>

      {/* Save Button */}
      <Button 
        onClick={() => saveMutation.mutate()}
        disabled={!hasChanges || saveMutation.isPending}
        className="w-full sm:w-auto"
      >
        {saveMutation.isPending ? (
          <>Saving...</>
        ) : (
          <>
            <Save className="h-4 w-4 mr-2" />
            บันทึกการเปลี่ยนแปลง
          </>
        )}
      </Button>

      {/* Success message */}
      {saveMutation.isSuccess && (
        <div className="bg-green-50 dark:bg-green-950/30 p-3 rounded-lg text-green-700 dark:text-green-400 flex items-center gap-2 text-sm">
          <CheckCircle className="h-4 w-4" />
          <span>บันทึกสำเร็จ! อย่าลืม Redeploy Rich Menu เพื่อให้มีผลใน LINE</span>
        </div>
      )}
    </div>
  );
}
