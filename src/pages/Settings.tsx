import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Smartphone, Menu, Loader2, CheckCircle, AlertCircle, ExternalLink, Upload, XCircle, Image } from 'lucide-react';
import { cn } from '@/lib/utils';
// Separate component for Portal Access Mode to manage its own state
function PortalAccessModeSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [portalMode, setPortalMode] = useState<'liff' | 'token' | 'both'>('liff');

  // Fetch portal access mode setting
  const { data: portalSetting, isLoading } = useQuery({
    queryKey: ['portal-access-mode'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'portal_access_mode')
        .maybeSingle();
      
      if (error) throw error;
      return data?.setting_value as { mode: string; available_modes: string[] } | null;
    },
  });

  useEffect(() => {
    if (portalSetting?.mode) {
      setPortalMode(portalSetting.mode as 'liff' | 'token' | 'both');
    }
  }, [portalSetting]);

  const savePortalModeMutation = useMutation({
    mutationFn: async (mode: 'liff' | 'token' | 'both') => {
      const newValue = { mode, available_modes: ['liff', 'token', 'both'] };
      
      const { data, error } = await supabase
        .from('system_settings')
        .update({ 
          setting_value: newValue,
          updated_at: new Date().toISOString()
        })
        .eq('setting_key', 'portal_access_mode')
        .select()
        .single();
      
      if (error) throw error;
      if (!data) throw new Error('ไม่สามารถบันทึกได้ กรุณาลองใหม่');
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-access-mode'] });
      toast({
        title: 'Success',
        description: 'Portal access mode updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  const handleModeChange = (mode: 'liff' | 'token' | 'both') => {
    setPortalMode(mode);
    savePortalModeMutation.mutate(mode);
  };

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <div className="space-y-4">
      <RadioGroup value={portalMode} onValueChange={handleModeChange as (value: string) => void} className="space-y-3">
        <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
          <RadioGroupItem value="liff" id="liff" className="mt-1" />
          <div className="flex-1">
            <Label htmlFor="liff" className="flex items-center gap-2 cursor-pointer">
              <span className="font-medium">LIFF Mode</span>
              <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">แนะนำ</Badge>
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              เข้าสู่ระบบอัตโนมัติผ่าน LINE App ไม่ต้องใช้ token
            </p>
            <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>Login อัตโนมัติ ไม่ต้อง copy link</li>
              <li>ปลอดภัยกว่า - ไม่มี token ใน URL</li>
              <li>ไม่หมดอายุ (ตราบใดที่ login LINE อยู่)</li>
              <li>แสดงรูปโปรไฟล์ LINE</li>
            </ul>
          </div>
        </div>

        <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
          <RadioGroupItem value="token" id="token" className="mt-1" />
          <div className="flex-1">
            <Label htmlFor="token" className="font-medium cursor-pointer">Token Link Mode</Label>
            <p className="text-sm text-muted-foreground mt-1">
              ส่งลิงก์พร้อม token ที่มีอายุ 30 นาที
            </p>
            <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>เปิดใน browser ภายนอกได้</li>
              <li>Token หมดอายุใน 30 นาที</li>
              <li>รองรับอุปกรณ์ที่ไม่มี LINE App</li>
            </ul>
          </div>
        </div>

        <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
          <RadioGroupItem value="both" id="both" className="mt-1" />
          <div className="flex-1">
            <Label htmlFor="both" className="flex items-center gap-2 cursor-pointer">
              <span className="font-medium">Both Mode (Hybrid)</span>
              <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">ใหม่</Badge>
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              ใช้ทั้ง LIFF และ Token Link ตามความเหมาะสม
            </p>
            <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>/menu → LIFF URL (auto-login)</li>
              <li>checkin/checkout → Token Link (แบบเดิม)</li>
              <li>เหมาะสำหรับใช้งานทั่วไป</li>
            </ul>
          </div>
        </div>
      </RadioGroup>

      <div className={`p-3 rounded-lg ${
        portalMode === 'liff' ? 'bg-green-50 dark:bg-green-950/30' : 
        portalMode === 'both' ? 'bg-purple-50 dark:bg-purple-950/30' :
        'bg-blue-50 dark:bg-blue-950/30'
      }`}>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={
            portalMode === 'liff' ? 'bg-green-100 text-green-700 border-green-300' : 
            portalMode === 'both' ? 'bg-purple-100 text-purple-700 border-purple-300' :
            'bg-blue-100 text-blue-700 border-blue-300'
          }>
            {portalMode === 'liff' ? 'LIFF Active' : portalMode === 'both' ? 'Both Active' : 'Token Active'}
          </Badge>
          <span className={`text-sm ${
            portalMode === 'liff' ? 'text-green-700 dark:text-green-400' : 
            portalMode === 'both' ? 'text-purple-700 dark:text-purple-400' :
            'text-blue-700 dark:text-blue-400'
          }`}>
            {portalMode === 'liff' 
              ? 'พนักงานจะได้รับ LIFF URL เมื่อพิมพ์ /menu' 
              : portalMode === 'both'
              ? '/menu ใช้ LIFF, checkin/checkout ใช้ Token Link'
              : 'พนักงานจะได้รับ Token Link เมื่อพิมพ์ /menu'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { toast: showToast } = useToast();
  const queryClient = useQueryClient();
  const [environmentName, setEnvironmentName] = useState('');
  const [defaultMode, setDefaultMode] = useState<any>('');
  const [defaultLanguage, setDefaultLanguage] = useState('');
  const [openaiModel, setOpenaiModel] = useState('');
  const [maxSummaryMessages, setMaxSummaryMessages] = useState('');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .maybeSingle();
      
      if (error) throw error;
      
      // Create default settings if none exist
      if (!data) {
        const { data: newSettings, error: insertError } = await supabase
          .from('app_settings')
          .insert({
            environment_name: 'Sandbox',
            default_mode: 'helper',
            default_language: 'auto',
            openai_model: 'gpt-4',
            max_summary_messages: 100,
          })
          .select()
          .single();
        
        if (insertError) throw insertError;
        return newSettings;
      }
      
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setEnvironmentName(settings.environment_name || '');
      setDefaultMode(settings.default_mode || '');
      setDefaultLanguage(settings.default_language || '');
      setOpenaiModel(settings.openai_model || '');
      setMaxSummaryMessages(settings.max_summary_messages?.toString() || '');
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!settings?.id) return;
      const { error } = await supabase
        .from('app_settings')
        .update({
          environment_name: environmentName,
          default_mode: defaultMode,
          default_language: defaultLanguage,
          openai_model: openaiModel,
          max_summary_messages: parseInt(maxSummaryMessages),
        })
        .eq('id', settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      showToast({ title: 'Settings updated successfully' });
    },
    onError: (error: any) => {
      showToast({
        variant: 'destructive',
        title: 'Failed to update settings',
        description: error.message,
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">General Settings</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Configure global bot behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="space-y-2">
            <Label htmlFor="env" className="text-sm">Environment Name</Label>
            <Input
              id="env"
              value={environmentName}
              onChange={(e) => setEnvironmentName(e.target.value)}
              placeholder="e.g., Sandbox, Production"
              className="text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mode" className="text-sm">Default Mode for New Groups</Label>
            <Select value={defaultMode} onValueChange={setDefaultMode}>
              <SelectTrigger id="mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="helper">Helper</SelectItem>
                <SelectItem value="faq">FAQ</SelectItem>
                <SelectItem value="report">Report</SelectItem>
                <SelectItem value="fun">Fun</SelectItem>
                <SelectItem value="safety">Safety</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lang" className="text-sm">Default Language</Label>
            <Select value={defaultLanguage} onValueChange={setDefaultLanguage}>
              <SelectTrigger id="lang">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-detect</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="th">Thai</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model" className="text-sm">OpenAI Model</Label>
            <Input
              id="model"
              value={openaiModel}
              onChange={(e) => setOpenaiModel(e.target.value)}
              placeholder="e.g., gpt-4, gpt-3.5-turbo"
              className="text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="max" className="text-sm">Max Messages for Summaries</Label>
            <Input
              id="max"
              type="number"
              value={maxSummaryMessages}
              onChange={(e) => setMaxSummaryMessages(e.target.value)}
              placeholder="100"
              className="text-sm"
            />
          </div>

          <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="w-full sm:w-auto">
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>

      {/* Portal Access Mode Configuration */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Smartphone className="h-4 w-4 sm:h-5 sm:w-5" />
            Portal Access Mode
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            วิธีเข้าใช้งาน Portal ของพนักงานเมื่อพิมพ์ /menu
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <PortalAccessModeSettings />
        </CardContent>
      </Card>

      {/* Rich Menu Setup */}
      <RichMenuSetup />

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Admin Accounts</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Manage dashboard access</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <p className="text-xs sm:text-sm text-muted-foreground">
            Admin management coming soon. Use authentication to control access.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// Rich Menu Setup Component with Image Upload
function RichMenuSetup() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<{ success: boolean; message: string; richMenuId?: string } | null>(null);
  
  // Image upload states
  const [imageSource, setImageSource] = useState<'default' | 'upload'>('default');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageValidation, setImageValidation] = useState<{
    valid: boolean;
    errors: string[];
    dimensions?: { width: number; height: number };
    fileSize?: number;
    fileType?: string;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch current deployed Rich Menu info
  const { data: currentRichMenu, isLoading: isLoadingRichMenu } = useQuery({
    queryKey: ['current-richmenu'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'current_richmenu')
        .maybeSingle();
      return data?.setting_value as {
        richmenu_id: string;
        image_url: string;
        image_source: 'default' | 'upload';
        deployed_at: string;
      } | null;
    },
  });

  // Validate image dimensions and type
  const validateImage = useCallback(async (file: File): Promise<typeof imageValidation> => {
    const errors: string[] = [];
    
    // Check file type
    const validTypes = ['image/jpeg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      errors.push(`ไฟล์ต้องเป็น JPEG หรือ PNG (ได้รับ: ${file.type})`);
    }
    
    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      errors.push(`ไฟล์ใหญ่เกิน 10MB (ขนาด: ${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    }
    
    // Check dimensions
    const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        resolve({ width: 0, height: 0 });
      };
      img.src = URL.createObjectURL(file);
    });
    
    if (dimensions.width !== 2500 || dimensions.height !== 1686) {
      errors.push(`Resolution ต้องเป็น 2500x1686 (ได้รับ: ${dimensions.width}x${dimensions.height})`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      dimensions,
      fileSize: file.size,
      fileType: file.type,
    };
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file);
    
    // Auto-switch to upload mode when file is selected
    setImageSource('upload');
    
    // Create preview
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    
    // Validate
    const validation = await validateImage(file);
    setImageValidation(validation);
  }, [validateImage]);

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Handle drag events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleFileSelect(file);
    }
  };

  // Clear selected file
  const clearSelectedFile = () => {
    setSelectedFile(null);
    setImagePreview(null);
    setImageValidation(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Upload to Supabase Storage
  const uploadToStorage = async (file: File): Promise<string> => {
    const ext = file.type === 'image/png' ? 'png' : 'jpg';
    const fileName = `richmenu-${Date.now()}.${ext}`;
    
    const { error } = await supabase.storage
      .from('richmenu-images')
      .upload(fileName, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: true
      });
      
    if (error) throw new Error(`Upload failed: ${error.message}`);
    
    const { data } = supabase.storage
      .from('richmenu-images')
      .getPublicUrl(fileName);
      
    return data.publicUrl;
  };

  const deployRichMenu = async () => {
    setIsDeploying(true);
    setDeployResult(null);
    
    try {
      let imageUrl: string;
      
      if (imageSource === 'upload' && selectedFile) {
        // Validate before uploading
        if (!imageValidation?.valid) {
          throw new Error('กรุณาแก้ไขปัญหาของรูปภาพก่อน deploy');
        }
        
        setIsUploading(true);
        imageUrl = await uploadToStorage(selectedFile);
        setIsUploading(false);
      } else {
        // Use default image
        const appUrl = window.location.origin;
        imageUrl = `${appUrl}/images/rich-menu.jpg`;
      }
      
      console.log('[RichMenuSetup] Deploying Rich Menu with image:', imageUrl);
      
      const { data, error } = await supabase.functions.invoke('line-richmenu-setup', {
        body: { action: 'create-full', image_url: imageUrl }
      });
      
      if (error) throw error;
      
      if (data?.success) {
        setDeployResult({
          success: true,
          message: 'Rich Menu deployed successfully! พนักงานจะเห็น menu ใหม่เมื่อเปิด LINE ใหม่',
          richMenuId: data.richmenu_id
        });
        // Invalidate to refetch current Rich Menu data
        queryClient.invalidateQueries({ queryKey: ['current-richmenu'] });
        toast({
          title: 'Success',
          description: 'Rich Menu 6 ปุ่ม deployed to LINE successfully!',
        });
      } else {
        throw new Error(data?.error || 'Unknown error');
      }
    } catch (error: any) {
      console.error('[RichMenuSetup] Deploy failed:', error);
      setDeployResult({
        success: false,
        message: error.message || 'Failed to deploy Rich Menu'
      });
      toast({
        title: 'Error',
        description: error.message || 'Failed to deploy Rich Menu',
        variant: 'destructive',
      });
    } finally {
      setIsDeploying(false);
      setIsUploading(false);
    }
  };

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const canDeploy = imageSource === 'default' || (imageSource === 'upload' && selectedFile && imageValidation?.valid);

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
          LINE Rich Menu
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Deploy Rich Menu 6 ปุ่มไปที่ LINE Bot
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-4">
        {/* Current Deployed Rich Menu */}
        {isLoadingRichMenu ? (
          <Skeleton className="h-20 w-full" />
        ) : currentRichMenu ? (
          <div className="bg-green-50 dark:bg-green-950/30 p-4 rounded-lg">
            <p className="text-sm font-medium mb-2 text-green-700 dark:text-green-400 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              📍 Rich Menu ปัจจุบัน
            </p>
            <div className="flex items-start gap-3">
              <img 
                src={currentRichMenu.image_url} 
                alt="Current Rich Menu" 
                className="h-16 w-24 object-cover rounded border shadow-sm"
                onError={(e) => {
                  // Fallback if image fails to load
                  (e.target as HTMLImageElement).src = '/images/rich-menu.jpg';
                }}
              />
              <div className="text-xs space-y-1">
                <p className="font-medium">
                  {currentRichMenu.image_source === 'upload' ? '📤 รูปที่ Upload' : '📁 รูป Default'}
                </p>
                <p className="text-muted-foreground">
                  Deploy: {new Date(currentRichMenu.deployed_at).toLocaleString('th-TH', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
                <p className="text-muted-foreground truncate max-w-[200px]" title={currentRichMenu.richmenu_id}>
                  ID: {currentRichMenu.richmenu_id.substring(0, 20)}...
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-lg">
            <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              ยังไม่มี Rich Menu - กรุณา deploy
            </p>
          </div>
        )}

        {/* Layout Preview */}
        <div className="bg-muted/50 p-4 rounded-lg">
          <p className="text-sm font-medium mb-2">Rich Menu Layout (6 ปุ่ม)</p>
          <div className="grid grid-cols-3 gap-1 text-xs text-center">
            <div className="bg-primary/10 p-2 rounded">✓ เช็คอิน/เอาท์</div>
            <div className="bg-primary/10 p-2 rounded">🕐 สถานะ</div>
            <div className="bg-primary/10 p-2 rounded">≡ เมนู</div>
            <div className="bg-primary/10 p-2 rounded">📅 ลางาน</div>
            <div className="bg-primary/10 p-2 rounded">+ ขอ OT</div>
            <div className="bg-primary/10 p-2 rounded">? ช่วยเหลือ</div>
          </div>
        </div>

        {/* Image Source Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">เลือกรูปภาพ Rich Menu</Label>
          <RadioGroup 
            value={imageSource} 
            onValueChange={(v) => setImageSource(v as 'default' | 'upload')}
            className="space-y-2"
          >
            <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
              <RadioGroupItem value="default" id="img-default" />
              <Label htmlFor="img-default" className="flex-1 cursor-pointer">
                <span className="font-medium">ใช้รูป Default</span>
                <span className="block text-xs text-muted-foreground">/images/rich-menu.jpg</span>
              </Label>
            </div>
            <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
              <RadioGroupItem value="upload" id="img-upload" />
              <Label htmlFor="img-upload" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-3">
                  {imagePreview && (
                    <img 
                      src={imagePreview} 
                      alt="Selected" 
                      className="h-10 w-16 object-cover rounded border"
                    />
                  )}
                  <div>
                    <span className="font-medium">Upload รูปใหม่</span>
                    <span className="block text-xs text-muted-foreground">
                      {selectedFile 
                        ? `${selectedFile.name} • ${imageValidation?.valid ? '✓ Valid' : '⚠ Invalid'}`
                        : 'JPEG หรือ PNG, 2500x1686px, ไม่เกิน 10MB'
                      }
                    </span>
                  </div>
                </div>
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Upload Area - Only show when upload is selected */}
        {imageSource === 'upload' && (
          <div className="space-y-3">
            {/* Drag & Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
                selectedFile && "border-solid"
              )}
            >
              {selectedFile && imagePreview ? (
                <div className="space-y-3">
                  <img 
                    src={imagePreview} 
                    alt="Preview" 
                    className="max-h-48 mx-auto rounded-lg shadow-sm"
                  />
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <span className="font-medium">{selectedFile.name}</span>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearSelectedFile();
                      }}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือก
                  </p>
                  <p className="text-xs text-muted-foreground">
                    JPEG หรือ PNG • 2500x1686px • ไม่เกิน 10MB
                  </p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {/* Validation Result */}
            {imageValidation && (
              <div className={cn(
                "p-3 rounded-lg text-sm",
                imageValidation.valid 
                  ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                  : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
              )}>
                <div className="flex items-start gap-2">
                  {imageValidation.valid ? (
                    <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    {imageValidation.valid ? (
                      <div>
                        <span className="font-medium">✓ พร้อม Deploy</span>
                        <span className="block text-xs opacity-75">
                          {imageValidation.fileType?.replace('image/', '').toUpperCase()} • 
                          {imageValidation.dimensions?.width}x{imageValidation.dimensions?.height} • 
                          {imageValidation.fileSize ? `${(imageValidation.fileSize / 1024).toFixed(0)} KB` : ''}
                        </span>
                      </div>
                    ) : (
                      <ul className="space-y-1">
                        {imageValidation.errors.map((err, i) => (
                          <li key={i}>✗ {err}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Deploy Result */}
        {deployResult && (
          <div className={cn(
            "p-3 rounded-lg flex items-start gap-2",
            deployResult.success 
              ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400' 
              : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'
          )}>
            {deployResult.success ? (
              <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className="text-sm">{deployResult.message}</p>
              {deployResult.richMenuId && (
                <p className="text-xs mt-1 opacity-75">ID: {deployResult.richMenuId}</p>
              )}
            </div>
          </div>
        )}

        {/* Deploy Button */}
        <Button 
          onClick={deployRichMenu} 
          disabled={isDeploying || !canDeploy}
          className="w-full sm:w-auto"
        >
          {isDeploying ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {isUploading ? 'Uploading...' : 'Deploying...'}
            </>
          ) : (
            <>
              <ExternalLink className="h-4 w-4 mr-2" />
              Deploy Rich Menu to LINE
            </>
          )}
        </Button>

        <div className="text-xs text-muted-foreground">
          {imageSource === 'default' ? (
            <p>
              ใช้รูปจาก <code className="bg-muted px-1 rounded">/images/rich-menu.jpg</code> (2500x1686px)
            </p>
          ) : selectedFile && imageValidation?.valid ? (
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>
                ใช้รูปที่ upload: <span className="font-medium">{selectedFile.name}</span> ({imageValidation.dimensions?.width}x{imageValidation.dimensions?.height})
              </span>
            </div>
          ) : selectedFile ? (
            <div className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-4 w-4" />
              <span>กรุณาแก้ไขปัญหารูปภาพก่อน deploy</span>
            </div>
          ) : (
            <p className="text-amber-600">กรุณาเลือกรูปภาพเพื่อ upload</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}