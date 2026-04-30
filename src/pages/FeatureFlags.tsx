/**
 * Feature Flags Management Page
 * 
 * Allows admins to toggle features, set rollout percentages, and manage feature flags.
 */
import { useState } from 'react';
import { useFeatureFlags, useFeatureFlagsAdmin, FeatureFlag } from '@/hooks/useFeatureFlags';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  Flag, 
  Plus, 
  Trash2, 
  ToggleLeft, 
  Users, 
  Percent,
  Settings,
  Clock,
  Shield
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { th } from 'date-fns/locale';

const CATEGORIES = [
  { value: 'portal', label: 'Portal', labelTh: 'พอร์ทัล', color: 'bg-blue-100 text-blue-800' },
  { value: 'dashboard', label: 'Dashboard', labelTh: 'แดชบอร์ด', color: 'bg-purple-100 text-purple-800' },
  { value: 'attendance', label: 'Attendance', labelTh: 'การลงเวลา', color: 'bg-green-100 text-green-800' },
  { value: 'deposit', label: 'Deposit', labelTh: 'เงินมัดจำ', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'bot', label: 'Bot', labelTh: 'บอท', color: 'bg-pink-100 text-pink-800' },
  { value: 'general', label: 'General', labelTh: 'ทั่วไป', color: 'bg-gray-100 text-gray-800' },
];

function CreateFlagDialog() {
  const { createFlag, isCreating } = useFeatureFlagsAdmin();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    flag_key: '',
    display_name: '',
    description: '',
    category: 'general',
    is_enabled: false,
    rollout_percentage: 100,
  });

  const handleSubmit = () => {
    if (!form.flag_key || !form.display_name) return;
    createFlag(form);
    setOpen(false);
    setForm({
      flag_key: '',
      display_name: '',
      description: '',
      category: 'general',
      is_enabled: false,
      rollout_percentage: 100,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          สร้าง Flag ใหม่
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>สร้าง Feature Flag ใหม่</DialogTitle>
          <DialogDescription>
            สร้าง flag เพื่อควบคุมการเปิด/ปิดฟีเจอร์
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="flag_key">Flag Key (ไม่มีเว้นวรรค)</Label>
            <Input
              id="flag_key"
              value={form.flag_key}
              onChange={(e) => setForm({ ...form, flag_key: e.target.value.replace(/\s/g, '_').toLowerCase() })}
              placeholder="my_new_feature"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="display_name">ชื่อแสดงผล</Label>
            <Input
              id="display_name"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              placeholder="My New Feature"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">คำอธิบาย</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="อธิบายว่าฟีเจอร์นี้ทำอะไร..."
            />
          </div>
          <div className="space-y-2">
            <Label>หมวดหมู่</Label>
            <Select 
              value={form.category} 
              onValueChange={(v) => setForm({ ...form, category: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.labelTh}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            ยกเลิก
          </Button>
          <Button onClick={handleSubmit} disabled={isCreating || !form.flag_key || !form.display_name}>
            สร้าง
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FlagCard({ flag }: { flag: FeatureFlag }) {
  const { toggleFlag, updateRollout, deleteFlag, isToggling } = useFeatureFlagsAdmin();
  const [rollout, setRollout] = useState(flag.rollout_percentage);
  const category = CATEGORIES.find((c) => c.value === flag.category) || CATEGORIES[5];

  return (
    <Card className={flag.is_enabled ? 'border-green-500/30' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={category.color}>{category.labelTh}</Badge>
              <Badge variant={flag.is_enabled ? 'default' : 'secondary'}>
                {flag.is_enabled ? 'เปิด' : 'ปิด'}
              </Badge>
            </div>
            <CardTitle className="text-lg mt-2">{flag.display_name}</CardTitle>
            <code className="text-xs text-muted-foreground bg-muted px-1 py-0.5 rounded">
              {flag.flag_key}
            </code>
          </div>
          <Switch
            checked={flag.is_enabled}
            onCheckedChange={(checked) => toggleFlag({ flagKey: flag.flag_key, isEnabled: checked })}
            disabled={isToggling}
          />
        </div>
        {flag.description && (
          <CardDescription className="mt-2">{flag.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Rollout Percentage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1">
              <Percent className="h-4 w-4" />
              Rollout
            </span>
            <span className="font-medium">{rollout}%</span>
          </div>
          <Slider
            value={[rollout]}
            onValueChange={([value]) => setRollout(value)}
            onValueCommit={([value]) => updateRollout({ flagKey: flag.flag_key, percentage: value })}
            max={100}
            step={5}
            className="w-full"
          />
        </div>

        {/* Last Updated */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            อัปเดตล่าสุด
          </span>
          <span>
            {formatDistanceToNow(new Date(flag.updated_at), { addSuffix: true, locale: th })}
          </span>
        </div>

        {/* Actions */}
        <div className="flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>ลบ Feature Flag?</AlertDialogTitle>
                <AlertDialogDescription>
                  การลบ "{flag.display_name}" จะไม่สามารถเรียกคืนได้ 
                  ฟีเจอร์ที่ใช้ flag นี้จะปิดโดยอัตโนมัติ
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={() => deleteFlag(flag.flag_key)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  ลบ
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FeatureFlagsPage() {
  const { data: flags, isLoading } = useFeatureFlags();
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const filteredFlags = flags?.filter((flag) => 
    categoryFilter === 'all' || flag.category === categoryFilter
  ) || [];

  const enabledCount = flags?.filter((f) => f.is_enabled).length || 0;
  const totalCount = flags?.length || 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Flag className="h-7 w-7" />
            Feature Flags
          </h1>
          <p className="text-muted-foreground mt-1">
            เปิด/ปิดฟีเจอร์ได้ทันทีโดยไม่ต้อง deploy ใหม่
          </p>
        </div>
        <CreateFlagDialog />
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Flags ทั้งหมด</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <ToggleLeft className="h-4 w-4 text-green-600" />
              เปิดใช้งาน
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{enabledCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <Shield className="h-4 w-4 text-gray-600" />
              ปิดใช้งาน
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{totalCount - enabledCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={categoryFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setCategoryFilter('all')}
        >
          ทั้งหมด
        </Button>
        {CATEGORIES.map((cat) => (
          <Button
            key={cat.value}
            variant={categoryFilter === cat.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategoryFilter(cat.value)}
          >
            {cat.labelTh}
          </Button>
        ))}
      </div>

      {/* Flags Grid */}
      {filteredFlags.length === 0 ? (
        <Card className="p-8 text-center">
          <Flag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">ไม่พบ Feature Flags</h3>
          <p className="text-muted-foreground">สร้าง flag ใหม่เพื่อเริ่มต้นใช้งาน</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredFlags.map((flag) => (
            <FlagCard key={flag.id} flag={flag} />
          ))}
        </div>
      )}
    </div>
  );
}
