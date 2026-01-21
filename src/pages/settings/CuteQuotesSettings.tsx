import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useCuteQuotesAdmin, CuteQuote } from '@/hooks/useCuteQuotes';
import { useFeatureFlag, useFeatureFlagsAdmin } from '@/hooks/useFeatureFlags';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Pencil, Trash2, Smile, Eye, EyeOff, LogIn, LogOut, Sunrise, Sunset, Sun, Cake, Calendar, CalendarDays, Banknote } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

const CATEGORIES = [
  { value: 'general', label: 'ทั่วไป', color: 'bg-gray-500' },
  { value: 'funny', label: 'ฮาๆ', color: 'bg-pink-500' },
  { value: 'motivational', label: 'ให้กำลังใจ', color: 'bg-green-500' },
];

const EMOJI_OPTIONS = ['😊', '😁', '😅', '🌟', '📸', '💪', '🤩', '🧊', '⏱️', '✊', '👏', '🎉', '❤️', '🔥', '✨', '🎂', '🎊', '🎁'];

const SHOW_TIME_OPTIONS = [
  { value: 'both', label: 'ทั้งเช้าและเย็น', icon: Sun },
  { value: 'check_in', label: 'เช้า (Check-in)', icon: Sunrise },
  { value: 'check_out', label: 'เย็น (Check-out)', icon: Sunset },
  { value: 'deposit', label: 'ฝากเงิน (Deposit)', icon: Banknote },
];

const BG_COLOR_OPTIONS = [
  { value: 'pink-purple', label: 'ชมพู-ม่วง', class: 'from-pink-500/90 to-purple-500/90' },
  { value: 'blue-cyan', label: 'ฟ้า-น้ำเงิน', class: 'from-blue-500/90 to-cyan-500/90' },
  { value: 'green-teal', label: 'เขียว', class: 'from-green-500/90 to-teal-500/90' },
  { value: 'orange-yellow', label: 'ส้ม-เหลือง', class: 'from-orange-500/90 to-yellow-500/90' },
  { value: 'red-pink', label: 'แดง-ชมพู', class: 'from-red-500/90 to-pink-500/90' },
  { value: 'indigo-purple', label: 'คราม-ม่วง', class: 'from-indigo-500/90 to-purple-500/90' },
  { value: 'gray', label: 'เทา', class: 'from-gray-600/90 to-gray-500/90' },
];

const SPECIAL_DAY_OPTIONS = [
  { value: 'none', label: 'ไม่จำกัด (แสดงทุกวัน)', icon: CalendarDays },
  { value: 'birthday', label: 'วันเกิดพนักงาน', icon: Cake },
  { value: 'holiday', label: 'วันหยุด', icon: Calendar },
  { value: 'custom', label: 'วันที่กำหนดเอง', icon: CalendarDays },
];

export default function CuteQuotesSettings() {
  const { toast } = useToast();
  const { quotes, isLoading, createQuote, updateQuote, deleteQuote, toggleQuote } = useCuteQuotesAdmin();
  const { isEnabled: featureEnabled, flag } = useFeatureFlag('cute_quotes_liveness');
  const { toggleFlag, isToggling } = useFeatureFlagsAdmin();
  
  // Fetch holidays for selection
  const { data: holidays } = useQuery({
    queryKey: ['holidays-for-quotes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('holidays')
        .select('id, name, date')
        .order('date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
  
  // % Chance settings
  const [checkInChance, setCheckInChance] = useState(100);
  const [checkOutChance, setCheckOutChance] = useState(100);
  const [depositChance, setDepositChance] = useState(100);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  
  // Load settings from flag
  useEffect(() => {
    if (flag?.settings) {
      const s = flag.settings as { check_in_chance?: number; check_out_chance?: number; deposit_chance?: number };
      setCheckInChance(s.check_in_chance ?? 100);
      setCheckOutChance(s.check_out_chance ?? 100);
      setDepositChance(s.deposit_chance ?? 100);
    }
  }, [flag?.settings]);
  
  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<CuteQuote | null>(null);
  
  // Preview mode states
  const [previewDayType, setPreviewDayType] = useState<'normal' | 'birthday' | 'holiday'>('normal');
  const [previewEventType, setPreviewEventType] = useState<'check_in' | 'check_out'>('check_in');
  const [previewResult, setPreviewResult] = useState<CuteQuote | null>(null);
  const [previewQuote, setPreviewQuote] = useState<CuteQuote | null>(null);
  
  // Form states
  const [newText, setNewText] = useState('');
  const [newEmoji, setNewEmoji] = useState('😊');
  const [newCategory, setNewCategory] = useState('general');
  const [newShowTime, setNewShowTime] = useState<'check_in' | 'check_out' | 'both'>('both');
  const [newBgColor, setNewBgColor] = useState('pink-purple');
  const [newSpecialDayType, setNewSpecialDayType] = useState<'none' | 'birthday' | 'holiday' | 'custom'>('none');
  const [newHolidayId, setNewHolidayId] = useState<string>('');
  const [newSpecialDayDate, setNewSpecialDayDate] = useState<string>('');
  
  // Filter
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const filteredQuotes = filterCategory === 'all' 
    ? quotes 
    : quotes.filter(q => q.category === filterCategory);

  const handleCreate = async () => {
    if (!newText.trim()) {
      toast({ title: 'กรุณากรอกข้อความ', variant: 'destructive' });
      return;
    }
    
    try {
      await createQuote({
        text: newText.trim(),
        emoji: newEmoji,
        category: newCategory,
        show_time: newShowTime,
        bg_color: newBgColor,
        special_day_type: newSpecialDayType === 'none' ? null : newSpecialDayType,
        special_day_date: newSpecialDayType === 'custom' ? newSpecialDayDate : null,
        holiday_id: newSpecialDayType === 'holiday' ? newHolidayId : null,
      });
      
      // Reset form
      setNewText('');
      setNewEmoji('😊');
      setNewCategory('general');
      setNewShowTime('both');
      setNewBgColor('pink-purple');
      setNewSpecialDayType('none');
      setNewHolidayId('');
      setNewSpecialDayDate('');
      setIsCreateOpen(false);
      
      toast({ title: 'เพิ่มข้อความสำเร็จ' });
    } catch (error) {
      toast({ title: 'เกิดข้อผิดพลาด', description: String(error), variant: 'destructive' });
    }
  };

  const handleUpdate = async () => {
    if (!editingQuote) return;
    
    try {
      await updateQuote(editingQuote.id, {
        text: editingQuote.text,
        emoji: editingQuote.emoji,
        category: editingQuote.category,
        show_time: editingQuote.show_time,
        bg_color: editingQuote.bg_color,
        special_day_type: editingQuote.special_day_type,
        special_day_date: editingQuote.special_day_date,
        holiday_id: editingQuote.holiday_id,
      });
      
      setEditingQuote(null);
      toast({ title: 'แก้ไขสำเร็จ' });
    } catch (error) {
      toast({ title: 'เกิดข้อผิดพลาด', description: String(error), variant: 'destructive' });
    }
  };

  const getHolidayName = (holidayId: string | null) => {
    if (!holidayId || !holidays) return null;
    return holidays.find(h => h.id === holidayId)?.name || null;
  };

  const getSpecialDayBadge = (quote: CuteQuote) => {
    if (!quote.special_day_type) return null;
    
    switch (quote.special_day_type) {
      case 'birthday':
        return <Badge variant="secondary" className="text-xs bg-pink-100 text-pink-700">🎂 วันเกิด</Badge>;
      case 'holiday':
        const holidayName = getHolidayName(quote.holiday_id);
        return <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">📅 {holidayName || 'วันหยุด'}</Badge>;
      case 'custom':
        const dateStr = quote.special_day_date ? format(new Date(quote.special_day_date), 'd MMM', { locale: th }) : '';
        return <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700">🗓️ {dateStr}</Badge>;
      default:
        return null;
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteQuote(id);
      toast({ title: 'ลบสำเร็จ' });
    } catch (error) {
      toast({ title: 'เกิดข้อผิดพลาด', description: String(error), variant: 'destructive' });
    }
  };

  const handleToggle = async (id: string, currentState: boolean) => {
    try {
      await toggleQuote(id, !currentState);
    } catch (error) {
      toast({ title: 'เกิดข้อผิดพลาด', description: String(error), variant: 'destructive' });
    }
  };

  const handleFeatureToggle = () => {
    if (flag) {
      toggleFlag({ flagKey: flag.flag_key, isEnabled: !featureEnabled });
    }
  };

  const getCategoryInfo = (category: string) => {
    return CATEGORIES.find(c => c.value === category) || CATEGORIES[0];
  };

  const getBgColorClass = (colorKey: string) => {
    const color = BG_COLOR_OPTIONS.find(c => c.value === colorKey);
    return color?.class || BG_COLOR_OPTIONS[0].class;
  };

  const getShowTimeIcon = (showTime: string) => {
    const opt = SHOW_TIME_OPTIONS.find(o => o.value === showTime);
    return opt?.icon || Sun;
  };

  const getShowTimeLabel = (showTime: string) => {
    if (showTime === 'check_in') return '🌅';
    if (showTime === 'check_out') return '🌆';
    if (showTime === 'deposit') return '💵';
    return '🌗';
  };

  // Preview mode: simulate random quote selection
  const handleRandomPreview = () => {
    if (!quotes || quotes.length === 0) {
      setPreviewResult(null);
      return;
    }

    const today = new Date();
    const todayMMDD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const todayISO = today.toISOString().split('T')[0];

    // Filter by show_time first
    const timeFiltered = quotes.filter(q => 
      q.is_active && (q.show_time === 'both' || q.show_time === previewEventType)
    );

    let candidates: CuteQuote[] = [];

    if (previewDayType === 'birthday') {
      // Simulate birthday match
      candidates = timeFiltered.filter(q => q.special_day_type === 'birthday');
    } else if (previewDayType === 'holiday') {
      // Simulate holiday match (use any holiday quote)
      candidates = timeFiltered.filter(q => q.special_day_type === 'holiday');
    } else {
      // Normal day - only regular quotes
      candidates = timeFiltered.filter(q => q.special_day_type === null);
    }

    if (candidates.length === 0) {
      // Fallback to regular quotes
      candidates = timeFiltered.filter(q => q.special_day_type === null);
    }

    if (candidates.length === 0) {
      setPreviewResult(null);
      return;
    }

    // Random select
    const randomIndex = Math.floor(Math.random() * candidates.length);
    setPreviewResult(candidates[randomIndex]);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Smile className="h-6 w-6 text-pink-500" />
          Cute Quotes Settings
        </h1>
        <p className="text-muted-foreground">
          จัดการข้อความน่ารักที่จะแสดงตอนตรวจสอบใบหน้า
        </p>
      </div>

      {/* Feature Toggle */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">สถานะฟีเจอร์</CardTitle>
          <CardDescription>เปิด/ปิด การแสดงข้อความใน Liveness Camera</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${featureEnabled ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className="font-medium">{featureEnabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span>
            </div>
            <Switch
              checked={featureEnabled}
              onCheckedChange={handleFeatureToggle}
              disabled={isToggling || !flag}
            />
          </div>
        </CardContent>
      </Card>

      {/* % Chance Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <span>🎲</span> โอกาสแสดง Quote
          </CardTitle>
          <CardDescription>ตั้งค่าเปอร์เซ็นต์โอกาสที่จะแสดงข้อความแยกตาม Check-in / Check-out</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Check-in Chance */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LogIn className="h-4 w-4 text-green-600" />
                <Label>Check-in</Label>
              </div>
              <span className="text-lg font-bold text-green-600">{checkInChance}%</span>
            </div>
            <Slider
              value={[checkInChance]}
              onValueChange={(value) => setCheckInChance(value[0])}
              max={100}
              min={0}
              step={5}
              className="w-full"
            />
          </div>

          {/* Check-out Chance */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LogOut className="h-4 w-4 text-orange-600" />
                <Label>Check-out</Label>
              </div>
              <span className="text-lg font-bold text-orange-600">{checkOutChance}%</span>
            </div>
            <Slider
              value={[checkOutChance]}
              onValueChange={(value) => setCheckOutChance(value[0])}
              max={100}
              min={0}
              step={5}
              className="w-full"
            />
          </div>

          {/* Deposit Chance */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Banknote className="h-4 w-4 text-blue-600" />
                <Label>ฝากเงิน (Deposit)</Label>
              </div>
              <span className="text-lg font-bold text-blue-600">{depositChance}%</span>
            </div>
            <Slider
              value={[depositChance]}
              onValueChange={(value) => setDepositChance(value[0])}
              max={100}
              min={0}
              step={5}
              className="w-full"
            />
          </div>

          <Button
            onClick={async () => {
              setIsSavingSettings(true);
              try {
                const { error } = await supabase
                  .from('feature_flags')
                  .update({ 
                    settings: {
                      check_in_chance: checkInChance,
                      check_out_chance: checkOutChance,
                      deposit_chance: depositChance,
                    },
                    updated_at: new Date().toISOString(),
                  })
                  .eq('flag_key', 'cute_quotes_liveness');
                
                if (error) throw error;
                toast({ title: 'บันทึกการตั้งค่าสำเร็จ' });
              } catch (error) {
                toast({ title: 'เกิดข้อผิดพลาด', description: String(error), variant: 'destructive' });
              } finally {
                setIsSavingSettings(false);
              }
            }}
            disabled={isSavingSettings}
            className="w-full"
          >
            {isSavingSettings ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
          </Button>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold">{quotes.length}</div>
          <div className="text-sm text-muted-foreground">ทั้งหมด</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-green-600">
            {quotes.filter(q => q.is_active).length}
          </div>
          <div className="text-sm text-muted-foreground">เปิดใช้งาน</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-muted-foreground">
            {quotes.filter(q => !q.is_active).length}
          </div>
          <div className="text-sm text-muted-foreground">ปิดใช้งาน</div>
        </Card>
      </div>

      {/* Preview Mode Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Eye className="h-5 w-5" />
            ทดสอบ Quote
          </CardTitle>
          <CardDescription>จำลองการสุ่ม Quote ตามสถานการณ์ต่างๆ</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Day Type Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">ประเภทวัน</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'normal', label: 'วันปกติ', icon: CalendarDays },
                  { value: 'birthday', label: 'วันเกิด', icon: Cake },
                  { value: 'holiday', label: 'วันหยุด', icon: Calendar },
                ].map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setPreviewDayType(opt.value as typeof previewDayType)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 text-sm transition-all ${
                        previewDayType === opt.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-muted hover:border-primary/50'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Event Type Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">เวลาลงเวลา</Label>
              <div className="flex gap-2">
                {[
                  { value: 'check_in', label: 'เข้างาน', icon: LogIn },
                  { value: 'check_out', label: 'ออกงาน', icon: LogOut },
                ].map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setPreviewEventType(opt.value as typeof previewEventType)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 text-sm transition-all ${
                        previewEventType === opt.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-muted hover:border-primary/50'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <Button onClick={handleRandomPreview} className="w-full">
            🎲 สุ่ม Quote
          </Button>

          {/* Preview Result */}
          {previewResult && (
            <div className="space-y-3">
              <div className={`p-6 rounded-xl bg-gradient-to-br ${getBgColorClass(previewResult.bg_color)} text-white text-center`}>
                <div className="text-4xl mb-2">{previewResult.emoji}</div>
                <div className="text-lg font-medium">{previewResult.text}</div>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">{getCategoryInfo(previewResult.category).label}</Badge>
                <span>{getShowTimeLabel(previewResult.show_time)}</span>
                {getSpecialDayBadge(previewResult)}
              </div>
            </div>
          )}

          {previewResult === null && quotes.length > 0 && (
            <div className="text-center text-sm text-muted-foreground py-4">
              กดปุ่ม "สุ่ม Quote" เพื่อดูตัวอย่าง
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quotes List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">รายการข้อความ</CardTitle>
            <div className="flex gap-2">
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="หมวดหมู่" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    เพิ่มใหม่
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>เพิ่มข้อความใหม่</DialogTitle>
                    <DialogDescription>สร้างข้อความน่ารักสำหรับแสดงใน Liveness Camera</DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>ข้อความ</Label>
                      <Input
                        value={newText}
                        onChange={(e) => setNewText(e.target.value)}
                        placeholder="เช่น ยิ้มกว้างๆๆๆๆๆค่ะ"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Emoji</Label>
                      <div className="flex flex-wrap gap-2">
                        {EMOJI_OPTIONS.map(emoji => (
                          <button
                            key={emoji}
                            onClick={() => setNewEmoji(emoji)}
                            className={`w-10 h-10 text-xl rounded-lg border-2 transition-all ${
                              newEmoji === emoji 
                                ? 'border-primary bg-primary/10' 
                                : 'border-transparent hover:border-muted-foreground/30'
                            }`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>หมวดหมู่</Label>
                      <Select value={newCategory} onValueChange={setNewCategory}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map(cat => (
                            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Show Time Selection */}
                    <div className="space-y-2">
                      <Label>🕐 เวลาที่จะแสดง</Label>
                      <div className="flex flex-wrap gap-2">
                        {SHOW_TIME_OPTIONS.map(opt => {
                          const Icon = opt.icon;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setNewShowTime(opt.value as typeof newShowTime)}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all text-sm ${
                                newShowTime === opt.value 
                                  ? 'border-primary bg-primary/10' 
                                  : 'border-transparent bg-muted hover:border-muted-foreground/30'
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    
                    {/* Background Color Selection */}
                    <div className="space-y-2">
                      <Label>🎨 สีพื้นหลัง</Label>
                      <div className="flex flex-wrap gap-2">
                        {BG_COLOR_OPTIONS.map(color => (
                          <button
                            key={color.value}
                            type="button"
                            onClick={() => setNewBgColor(color.value)}
                            className={`w-10 h-10 rounded-lg border-2 transition-all bg-gradient-to-r ${color.class} ${
                              newBgColor === color.value 
                                ? 'border-foreground ring-2 ring-foreground ring-offset-2' 
                                : 'border-transparent hover:scale-110'
                            }`}
                            title={color.label}
                          />
                        ))}
                      </div>
                    </div>
                    
                    {/* Special Day Selection */}
                    <div className="space-y-2">
                      <Label>📅 แสดงเฉพาะวันพิเศษ</Label>
                      <div className="flex flex-wrap gap-2">
                        {SPECIAL_DAY_OPTIONS.map(opt => {
                          const Icon = opt.icon;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setNewSpecialDayType(opt.value as typeof newSpecialDayType)}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all text-sm ${
                                newSpecialDayType === opt.value 
                                  ? 'border-primary bg-primary/10' 
                                  : 'border-transparent bg-muted hover:border-muted-foreground/30'
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      
                      {/* Holiday selector */}
                      {newSpecialDayType === 'holiday' && (
                        <Select value={newHolidayId} onValueChange={setNewHolidayId}>
                          <SelectTrigger>
                            <SelectValue placeholder="เลือกวันหยุด..." />
                          </SelectTrigger>
                          <SelectContent>
                            {holidays?.map(h => (
                              <SelectItem key={h.id} value={h.id}>
                                {h.name} ({format(new Date(h.date), 'd MMM yyyy', { locale: th })})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      
                      {/* Custom date picker */}
                      {newSpecialDayType === 'custom' && (
                        <Input
                          type="date"
                          value={newSpecialDayDate}
                          onChange={(e) => setNewSpecialDayDate(e.target.value)}
                        />
                      )}
                    </div>
                    
                    {/* Preview */}
                    <div className="space-y-2">
                      <Label>ตัวอย่าง</Label>
                      <div className={`bg-gradient-to-r ${getBgColorClass(newBgColor)} text-white px-4 py-2 rounded-full text-center`}>
                        {newEmoji} {newText || 'ข้อความจะแสดงตรงนี้'}
                      </div>
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>ยกเลิก</Button>
                    <Button onClick={handleCreate}>บันทึก</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredQuotes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                ยังไม่มีข้อความ กดปุ่ม "เพิ่มใหม่" เพื่อสร้าง
              </div>
            ) : (
              filteredQuotes.map(quote => (
                <div
                  key={quote.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    quote.is_active ? 'bg-background' : 'bg-muted/50 opacity-60'
                  }`}
                >
                  <span className="text-2xl">{quote.emoji}</span>
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{quote.text}</div>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {getCategoryInfo(quote.category).label}
                      </Badge>
                      <span className="text-sm" title={SHOW_TIME_OPTIONS.find(o => o.value === quote.show_time)?.label || 'ทั้งวัน'}>
                        {getShowTimeLabel(quote.show_time)}
                      </span>
                      <div 
                        className={`w-4 h-4 rounded-full bg-gradient-to-r ${getBgColorClass(quote.bg_color)}`}
                        title={BG_COLOR_OPTIONS.find(c => c.value === quote.bg_color)?.label || 'ชมพู-ม่วง'}
                      />
                      {getSpecialDayBadge(quote)}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPreviewQuote(quote)}
                      className="h-8 w-8"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggle(quote.id, quote.is_active)}
                      className="h-8 w-8"
                    >
                      {quote.is_active ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-green-600" />
                      )}
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingQuote({ ...quote })}
                      className="h-8 w-8"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(quote.id)}
                      className="h-8 w-8 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={!!previewQuote} onOpenChange={() => setPreviewQuote(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>ตัวอย่างการแสดงผล</DialogTitle>
          </DialogHeader>
          <div className="py-8 flex justify-center">
            <div className={`bg-gradient-to-r ${getBgColorClass(previewQuote?.bg_color || 'pink-purple')} text-white px-6 py-3 rounded-full text-lg font-medium shadow-lg animate-bounce`}>
              {previewQuote?.emoji} {previewQuote?.text}
            </div>
          </div>
          <div className="text-center text-sm text-muted-foreground">
            {previewQuote && (
              <>
                {getShowTimeLabel(previewQuote.show_time)} {SHOW_TIME_OPTIONS.find(o => o.value === previewQuote.show_time)?.label}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingQuote} onOpenChange={() => setEditingQuote(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>แก้ไขข้อความ</DialogTitle>
          </DialogHeader>
          
          {editingQuote && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>ข้อความ</Label>
                <Input
                  value={editingQuote.text}
                  onChange={(e) => setEditingQuote({ ...editingQuote, text: e.target.value })}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Emoji</Label>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_OPTIONS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => setEditingQuote({ ...editingQuote, emoji })}
                      className={`w-10 h-10 text-xl rounded-lg border-2 transition-all ${
                        editingQuote.emoji === emoji 
                          ? 'border-primary bg-primary/10' 
                          : 'border-transparent hover:border-muted-foreground/30'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>หมวดหมู่</Label>
                <Select
                  value={editingQuote.category}
                  onValueChange={(value) => setEditingQuote({ ...editingQuote, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Show Time Selection */}
              <div className="space-y-2">
                <Label>🕐 เวลาที่จะแสดง</Label>
                <div className="flex flex-wrap gap-2">
                  {SHOW_TIME_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEditingQuote({ ...editingQuote, show_time: opt.value as 'check_in' | 'check_out' | 'both' })}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all text-sm ${
                          editingQuote.show_time === opt.value 
                            ? 'border-primary bg-primary/10' 
                            : 'border-transparent bg-muted hover:border-muted-foreground/30'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              
              {/* Background Color Selection */}
              <div className="space-y-2">
                <Label>🎨 สีพื้นหลัง</Label>
                <div className="flex flex-wrap gap-2">
                  {BG_COLOR_OPTIONS.map(color => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setEditingQuote({ ...editingQuote, bg_color: color.value })}
                      className={`w-10 h-10 rounded-lg border-2 transition-all bg-gradient-to-r ${color.class} ${
                        editingQuote.bg_color === color.value 
                          ? 'border-foreground ring-2 ring-foreground ring-offset-2' 
                          : 'border-transparent hover:scale-110'
                      }`}
                      title={color.label}
                    />
                  ))}
                </div>
              </div>
              
              {/* Special Day Selection */}
              <div className="space-y-2">
                <Label>📅 แสดงเฉพาะวันพิเศษ</Label>
                <div className="flex flex-wrap gap-2">
                  {SPECIAL_DAY_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    const currentValue = editingQuote.special_day_type || 'none';
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEditingQuote({ 
                          ...editingQuote, 
                          special_day_type: opt.value === 'none' ? null : opt.value as 'birthday' | 'holiday' | 'custom',
                          // Reset related fields when changing type
                          holiday_id: opt.value === 'holiday' ? editingQuote.holiday_id : null,
                          special_day_date: opt.value === 'custom' ? editingQuote.special_day_date : null,
                        })}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all text-sm ${
                          currentValue === opt.value 
                            ? 'border-primary bg-primary/10' 
                            : 'border-transparent bg-muted hover:border-muted-foreground/30'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                
                {/* Holiday selector */}
                {editingQuote.special_day_type === 'holiday' && (
                  <Select 
                    value={editingQuote.holiday_id || ''} 
                    onValueChange={(value) => setEditingQuote({ ...editingQuote, holiday_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="เลือกวันหยุด..." />
                    </SelectTrigger>
                    <SelectContent>
                      {holidays?.map(h => (
                        <SelectItem key={h.id} value={h.id}>
                          {h.name} ({format(new Date(h.date), 'd MMM yyyy', { locale: th })})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                
                {/* Custom date picker */}
                {editingQuote.special_day_type === 'custom' && (
                  <Input
                    type="date"
                    value={editingQuote.special_day_date || ''}
                    onChange={(e) => setEditingQuote({ ...editingQuote, special_day_date: e.target.value })}
                  />
                )}
              </div>
              
              {/* Preview */}
              <div className="space-y-2">
                <Label>ตัวอย่าง</Label>
                <div className={`bg-gradient-to-r ${getBgColorClass(editingQuote.bg_color)} text-white px-4 py-2 rounded-full text-center`}>
                  {editingQuote.emoji} {editingQuote.text}
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingQuote(null)}>ยกเลิก</Button>
            <Button onClick={handleUpdate}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
