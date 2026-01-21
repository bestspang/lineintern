import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useCuteQuotesAdmin, CuteQuote } from '@/hooks/useCuteQuotes';
import { useFeatureFlag, useFeatureFlagsAdmin } from '@/hooks/useFeatureFlags';
import { Plus, Pencil, Trash2, Smile, Eye, EyeOff } from 'lucide-react';

const CATEGORIES = [
  { value: 'general', label: 'ทั่วไป', color: 'bg-gray-500' },
  { value: 'funny', label: 'ฮาๆ', color: 'bg-pink-500' },
  { value: 'motivational', label: 'ให้กำลังใจ', color: 'bg-green-500' },
];

const EMOJI_OPTIONS = ['😊', '😁', '😅', '🌟', '📸', '💪', '🤩', '🧊', '⏱️', '✊', '👏', '🎉', '❤️', '🔥', '✨'];

export default function CuteQuotesSettings() {
  const { toast } = useToast();
  const { quotes, isLoading, createQuote, updateQuote, deleteQuote, toggleQuote } = useCuteQuotesAdmin();
  const { isEnabled: featureEnabled, flag } = useFeatureFlag('cute_quotes_liveness');
  const { toggleFlag, isToggling } = useFeatureFlagsAdmin();
  
  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<CuteQuote | null>(null);
  const [previewQuote, setPreviewQuote] = useState<CuteQuote | null>(null);
  
  // Form states
  const [newText, setNewText] = useState('');
  const [newEmoji, setNewEmoji] = useState('😊');
  const [newCategory, setNewCategory] = useState('general');
  
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
      });
      
      setNewText('');
      setNewEmoji('😊');
      setNewCategory('general');
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
          <div className="text-2xl font-bold text-gray-400">
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
                    
                    {/* Preview */}
                    <div className="space-y-2">
                      <Label>ตัวอย่าง</Label>
                      <div className="bg-gradient-to-r from-pink-500/90 to-purple-500/90 text-white px-4 py-2 rounded-full text-center">
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
                    <Badge variant="outline" className="text-xs mt-1">
                      {getCategoryInfo(quote.category).label}
                    </Badge>
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
            <div className="bg-gradient-to-r from-pink-500/90 to-purple-500/90 text-white px-6 py-3 rounded-full text-lg font-medium shadow-lg animate-bounce">
              {previewQuote?.emoji} {previewQuote?.text}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingQuote} onOpenChange={() => setEditingQuote(null)}>
        <DialogContent>
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
              
              {/* Preview */}
              <div className="space-y-2">
                <Label>ตัวอย่าง</Label>
                <div className="bg-gradient-to-r from-pink-500/90 to-purple-500/90 text-white px-4 py-2 rounded-full text-center">
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
