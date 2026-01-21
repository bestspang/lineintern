import { useState, useEffect } from 'react';
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
import { Plus, Pencil, Trash2, Smile, Eye, EyeOff, LogIn, LogOut, Sunrise, Sunset, Sun } from 'lucide-react';

const CATEGORIES = [
  { value: 'general', label: 'ทั่วไป', color: 'bg-gray-500' },
  { value: 'funny', label: 'ฮาๆ', color: 'bg-pink-500' },
  { value: 'motivational', label: 'ให้กำลังใจ', color: 'bg-green-500' },
];

const EMOJI_OPTIONS = ['😊', '😁', '😅', '🌟', '📸', '💪', '🤩', '🧊', '⏱️', '✊', '👏', '🎉', '❤️', '🔥', '✨'];

const SHOW_TIME_OPTIONS = [
  { value: 'both', label: 'ทั้งเช้าและเย็น', icon: Sun },
  { value: 'check_in', label: 'เช้า (Check-in)', icon: Sunrise },
  { value: 'check_out', label: 'เย็น (Check-out)', icon: Sunset },
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

export default function CuteQuotesSettings() {
  const { toast } = useToast();
  const { quotes, isLoading, createQuote, updateQuote, deleteQuote, toggleQuote } = useCuteQuotesAdmin();
  const { isEnabled: featureEnabled, flag } = useFeatureFlag('cute_quotes_liveness');
  const { toggleFlag, isToggling } = useFeatureFlagsAdmin();
  
  // % Chance settings
  const [checkInChance, setCheckInChance] = useState(100);
  const [checkOutChance, setCheckOutChance] = useState(100);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  
  // Load settings from flag
  useEffect(() => {
    if (flag?.settings) {
      const s = flag.settings as { check_in_chance?: number; check_out_chance?: number };
      setCheckInChance(s.check_in_chance ?? 100);
      setCheckOutChance(s.check_out_chance ?? 100);
    }
  }, [flag?.settings]);
  
  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<CuteQuote | null>(null);
  const [previewQuote, setPreviewQuote] = useState<CuteQuote | null>(null);
  
  // Form states
  const [newText, setNewText] = useState('');
  const [newEmoji, setNewEmoji] = useState('😊');
  const [newCategory, setNewCategory] = useState('general');
  const [newShowTime, setNewShowTime] = useState<'check_in' | 'check_out' | 'both'>('both');
  const [newBgColor, setNewBgColor] = useState('pink-purple');
  
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
      });
      
      setNewText('');
      setNewEmoji('😊');
      setNewCategory('general');
      setNewShowTime('both');
      setNewBgColor('pink-purple');
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
      });
      
      setEditingQuote(null);
      toast({ title: 'แก้ไขสำเร็จ' });
    } catch (error) {
      toast({ title: 'เกิดข้อผิดพลาด', description: String(error), variant: 'destructive' });
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
    return '🌗';
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
                <DialogContent>
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
                    <div className="flex items-center gap-2 mt-1">
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
