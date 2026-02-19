import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { usePortal } from '@/contexts/PortalContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  HelpCircle, Clock, Calendar, FileText, Gift, 
  MessageCircle, Phone, Mail, CheckCircle, Receipt, Star, User,
  CalendarDays, Wallet, Trophy, Banknote, History, CheckSquare, CalendarMinus,
  Activity, Package, Camera, MapPin, XCircle, Search, Backpack
} from 'lucide-react';

// Static fallback FAQs (used when database is empty or has errors)
// ⚠️ SYNC NOTE: Keep in sync with portal_faqs table content
// ⚠️ VERIFIED 2026-02-03: These are fallback FAQs - DB has 33+ items
const STATIC_FAQS_TH = [
  // Attendance
  { question: 'ฉันจะเช็คอินได้อย่างไร?', answer: 'กดปุ่ม "เช็คอิน/เอาท์" จาก Rich Menu หรือเมนูหลัก จากนั้นอนุญาตให้แอปเข้าถึงตำแหน่งและกล้อง แล้วถ่ายรูปยืนยัน' },
  { question: 'ฉันลืมเช็คเอาท์ ต้องทำอย่างไร?', answer: 'ไม่ต้องกังวล! ระบบจะ Check Out ให้อัตโนมัติ:\n• พนักงาน hours_based: หลัง grace period หมด\n• พนักงาน time_based: ตอนเที่ยงคืน (23:59)\n\nหากต้องการแก้ไขเวลาย้อนหลัง กรุณาติดต่อหัวหน้างานหรือ HR' },
  { question: 'ฉันจะ checkout นอกสถานที่ได้อย่างไร?', answer: 'ระบบจะแสดง dialog ให้กรอกเหตุผล ส่งคำขอไปยังหัวหน้าอนุมัติ เมื่ออนุมัติแล้วระบบจะ checkout ให้อัตโนมัติ' },
  { question: 'ฉันจะขอกลับก่อนได้อย่างไร?', answer: 'เมื่อเช็คเอาต์ก่อนครบเวลา ระบบจะให้เลือกเหตุผล แล้วส่งคำขอไปหัวหน้าอนุมัติ หากอนุมัติแล้วระบบจะบันทึกเวลาออกงานให้' },
  // Points
  { question: 'Happy Points คืออะไร?', answer: 'คะแนนสะสมจากการมาทำงานตรงเวลา ทำ OT และกิจกรรมต่างๆ สามารถนำไปแลกของรางวัลได้' },
  { question: 'Streak คืออะไร?', answer: 'Streak คือจำนวนวันที่คุณมาตรงเวลาติดต่อกัน เมื่อครบ 5 วันจะได้โบนัส 50 แต้ม และครบเดือนจะได้ 100 แต้ม' },
  { question: 'Streak Shield คืออะไร?', answer: 'โล่ป้องกัน Streak จะใช้อัตโนมัติเมื่อคุณมาสายหรือขาดงาน ช่วยให้ Streak ไม่หายไป ได้รับจากการมาครบเดือนหรือเป็นโบนัส' },
  // Leave/OT - ⚠️ Updated: clarify "DM only"
  { question: 'ฉันจะยกเลิกคำขอ OT ได้อย่างไร?', answer: 'ไปที่ Portal > ประวัติการทำงาน กดปุ่ม "ยกเลิก" หรือพิมพ์ /cancel-ot ใน DM (แชทส่วนตัว) กับบอท' },
  { question: 'ฉันจะยกเลิกคำขอวันหยุดได้อย่างไร?', answer: 'ไปที่ Portal > ประวัติการทำงาน กดปุ่ม "ยกเลิก" หรือพิมพ์ /cancel-dayoff ใน DM (แชทส่วนตัว) กับบอท' },
  { question: 'ฉันจะยกเลิกคำขอลางานได้อย่างไร?', answer: 'ไปที่ Portal > ประวัติการทำงาน กดปุ่ม "ยกเลิก" ได้เลย ไม่สามารถยกเลิกคำขอที่อนุมัติแล้วได้' },
  // Bag
  { question: 'กระเป๋าของฉัน (My Bag) คืออะไร?', answer: 'กระเป๋าเป็นที่เก็บไอเทมที่คุณแลกมาจากร้านค้ารางวัล สามารถเก็บไว้ใช้ทีหลังได้ ไอเทมบางชิ้นจะใช้อัตโนมัติเมื่อถึงเงื่อนไข (เช่น Streak Shield) บางชิ้นต้องกดใช้เอง และทุกไอเทมมีวันหมดอายุ หากไม่ใช้ภายในกำหนดจะหมดอายุไปโดยอัตโนมัติ' },
  { question: 'รางวัลมีกี่แบบ?', answer: 'รางวัลมี 3 แบบ:\n• ใช้เลย - เปิดใช้ทันทีหลังแลก\n• เก็บอย่างเดียว - เก็บในกระเป๋าไว้ใช้ทีหลัง\n• เลือกได้ - เลือกว่าจะใช้เลยหรือเก็บในกระเป๋า\n\nบางรางวัลต้องรอหัวหน้าอนุมัติก่อนถึงจะใช้ได้' },
  // General
  { question: 'ทำไมฉันถึงไม่ต้อง Track เวลาหรือแต้ม?', answer: 'บางตำแหน่ง เช่น ผู้จัดการหรือเจ้าของกิจการ ถูกตั้งค่าให้ไม่ต้อง Track เวลาทำงาน หากมีข้อสงสัยกรุณาติดต่อ HR' },
  // Cross-Group Query
  { question: 'ถามข้อมูลข้ามกลุ่มได้อย่างไร?', answer: 'ใน LINE กลุ่มที่มีบอท ให้ @mention บอทแล้วพิมพ์คำถาม เช่น "@bot สาขา X มีใครเข้างานวันนี้" ระบบจะค้นข้อมูลจากกลุ่มที่อนุญาตแล้วตอบ' },
  { question: 'ถามข้ามกลุ่มได้ข้อมูลอะไรบ้าง?', answer: 'ถามได้เรื่อง: การลงเวลา, ข้อความในกลุ่ม, พนักงาน, คะแนน Happy Points, วันเกิด, รางวัล, วันลา/OT และงานที่มอบหมาย ขึ้นอยู่กับสิทธิ์ที่ผู้ดูแลตั้งค่าไว้' },
];

const STATIC_FAQS_EN = [
  // Attendance
  { question: 'How do I check in?', answer: 'Press "Check In/Out" from Rich Menu or main menu, allow location and camera access, then take a photo to confirm.' },
  { question: 'I forgot to check out, what should I do?', answer: 'Don\'t worry! The system will auto check-out:\n• Hours-based employees: after grace period expires\n• Time-based employees: at midnight (23:59)\n\nIf you need to modify the time retroactively, please contact your supervisor or HR.' },
  { question: 'How can I check out from outside the office?', answer: 'The system will show a dialog to enter your reason. The request will be sent to your manager for approval. Once approved, the system will automatically check you out.' },
  { question: 'How can I request early leave?', answer: 'When checking out early, the system will ask you to select a reason. The request will be sent to your manager for approval.' },
  // Points
  { question: 'What are Happy Points?', answer: 'Points earned from on-time attendance, OT, and various activities. Can be redeemed for rewards.' },
  { question: 'What is Streak?', answer: 'Streak is the number of consecutive days you arrive on time. You get 50 bonus points at 5 days and 100 points for a full month.' },
  { question: 'What is Streak Shield?', answer: 'A protective shield that automatically activates when you are late or absent, preventing your streak from resetting. Earned from monthly attendance or as bonuses.' },
  // Leave/OT - ⚠️ Updated: clarify "DM only"
  { question: 'How can I cancel an OT request?', answer: 'Go to Portal > Work History, click "Cancel" button, or type /cancel-ot in DM (direct message) with the bot.' },
  { question: 'How can I cancel a day-off request?', answer: 'Go to Portal > Work History, click "Cancel" button, or type /cancel-dayoff in DM (direct message) with the bot.' },
  { question: 'How can I cancel a leave request?', answer: 'Go to Portal > Work History and click the "Cancel" button. Already approved requests cannot be cancelled.' },
  // Bag
  { question: 'What is My Bag?', answer: 'My Bag is your personal inventory for storing redeemed reward items. You can save items for later use. Some items activate automatically when conditions are met (e.g., Streak Shield), while others require manual activation. All items have an expiration date and will expire if not used in time.' },
  { question: 'What are the reward types?', answer: 'There are 3 types:\n• Use Now - Activates immediately after redemption\n• Bag Only - Stored in your bag for later use\n• Choose - You decide whether to use now or save to bag\n\nSome rewards require manager approval before they can be used.' },
  // General
  { question: 'Why don\'t I need to track time or points?', answer: 'Some positions such as managers or business owners are configured to not require time tracking. Please contact HR if you have questions.' },
  // Cross-Group Query
  { question: 'How do I ask cross-group questions?', answer: 'In a LINE group with the bot, @mention the bot and type your question, e.g. "@bot who checked in at branch X today?" The system will search allowed groups and respond.' },
  { question: 'What data can I ask about across groups?', answer: 'You can ask about: attendance, group messages, employees, Happy Points, birthdays, rewards, leave/OT, and work assignments — depending on permissions set by your admin.' },
];

// ⚠️ PORTAL AUDIT: Verified 2026-01-28
// Quick Actions: 20 items, FAQs: 33+, All paths valid
// DO NOT modify paths unless adding new features

// FAQ Categories for filter
const FAQ_CATEGORIES = [
  { value: 'all', label: { th: 'ทั้งหมด', en: 'All' } },
  { value: 'attendance', label: { th: 'เช็คอิน/เอาท์', en: 'Check In/Out' } },
  { value: 'leave-ot', label: { th: 'ลา/OT', en: 'Leave/OT' } },
  { value: 'points', label: { th: 'แต้ม', en: 'Points' } },
  { value: 'receipts', label: { th: 'ใบเสร็จ', en: 'Receipts' } },
  { value: 'general', label: { th: 'ทั่วไป', en: 'General' } },
];

export default function Help() {
  const { locale } = usePortal();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Fetch FAQs from database
  const { data: dbFaqs, isLoading: isLoadingFaqs } = useQuery({
    queryKey: ['portal-faqs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('portal_faqs')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  // Transform database FAQs based on locale
  const allFaqs = dbFaqs && dbFaqs.length > 0
    ? dbFaqs.map(faq => ({
        question: locale === 'th' ? faq.question_th : faq.question_en,
        answer: locale === 'th' ? faq.answer_th : faq.answer_en,
        category: faq.category || 'general',
      }))
    : (locale === 'th' ? STATIC_FAQS_TH : STATIC_FAQS_EN).map(f => ({ ...f, category: 'general' }));

  // Filter FAQs by search and category
  const faqs = allFaqs.filter(faq => {
    const matchesSearch = searchQuery === '' || 
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || faq.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const quickActions = [
    {
      icon: Clock,
      title: locale === 'th' ? 'เช็คอิน/เอาท์' : 'Check In/Out',
      description: locale === 'th' ? 'บันทึกเวลาเข้า-ออกงาน' : 'Record attendance',
      path: '/portal/checkin'
    },
    {
      icon: Calendar,
      title: locale === 'th' ? 'ขอลางาน' : 'Request Leave',
      description: locale === 'th' ? 'ส่งคำขอลาหยุด' : 'Submit leave request',
      path: '/portal/request-leave'
    },
    {
      icon: CalendarMinus,
      title: locale === 'th' ? 'วันลาคงเหลือ' : 'Leave Balance',
      description: locale === 'th' ? 'ตรวจสอบวันลาที่เหลือ' : 'Check remaining leave days',
      path: '/portal/my-leave'
    },
    {
      icon: FileText,
      title: locale === 'th' ? 'ขอ OT' : 'Request OT',
      description: locale === 'th' ? 'ส่งคำขอทำงานล่วงเวลา' : 'Submit overtime request',
      path: '/portal/request-ot'
    },
    {
      icon: Gift,
      title: locale === 'th' ? 'แลกของรางวัล' : 'Redeem Rewards',
      description: locale === 'th' ? 'ใช้คะแนนแลกของรางวัล' : 'Use points for rewards',
      path: '/portal/rewards'
    },
    {
      icon: Star,
      title: locale === 'th' ? 'คะแนนของฉัน' : 'My Points',
      description: locale === 'th' ? 'ดู Happy Points และประวัติ' : 'View points and history',
      path: '/portal/my-points'
    },
    {
      icon: Receipt,
      title: locale === 'th' ? 'ใบเสร็จ' : 'Receipts',
      description: locale === 'th' ? 'จัดการใบเสร็จและค่าใช้จ่าย' : 'Manage receipts & expenses',
      path: '/portal/my-receipts'
    },
    {
      icon: CalendarDays,
      title: locale === 'th' ? 'ตารางกะ' : 'My Schedule',
      description: locale === 'th' ? 'ดูตารางการทำงาน' : 'View work schedule',
      path: '/portal/my-schedule'
    },
    {
      icon: Wallet,
      title: locale === 'th' ? 'Payroll ของฉัน' : 'My Payroll',
      description: locale === 'th' ? 'ดูรายได้และเงินเดือน' : 'View earnings & salary',
      path: '/portal/my-payroll'
    },
    {
      icon: Trophy,
      title: locale === 'th' ? 'Leaderboard' : 'Leaderboard',
      description: locale === 'th' ? 'อันดับแต้มในทีม' : 'Team point rankings',
      path: '/portal/leaderboard'
    },
    {
      icon: User,
      title: locale === 'th' ? 'โปรไฟล์' : 'My Profile',
      description: locale === 'th' ? 'ดูข้อมูลส่วนตัว' : 'View your profile',
      path: '/portal/my-profile'
    },
    {
      icon: Banknote,
      title: locale === 'th' ? 'ฝากเงิน' : 'Deposit',
      description: locale === 'th' ? 'ส่งใบฝากเงินประจำวัน' : 'Submit daily deposit slip',
      path: '/portal/deposit-upload'
    },
    {
      icon: History,
      title: locale === 'th' ? 'ประวัติการเข้างาน' : 'Work History',
      description: locale === 'th' ? 'ดูบันทึกการเข้างานย้อนหลัง' : 'View attendance history',
      path: '/portal/my-history'
    },
    {
      icon: CheckSquare,
      title: locale === 'th' ? 'อนุมัติ' : 'Approvals',
      description: locale === 'th' ? 'อนุมัติคำขอของทีม' : 'Approve team requests',
      path: '/portal/approvals'
    },
    {
      icon: Activity,
      title: locale === 'th' ? 'สถานะวันนี้' : 'Today Status',
      description: locale === 'th' ? 'ดูสถานะการทำงานวันนี้' : 'View today\'s work status',
      path: '/portal/status'
    },
    {
      icon: Package,
      title: locale === 'th' ? 'ประวัติการแลก' : 'My Redemptions',
      description: locale === 'th' ? 'ดูประวัติการแลกของรางวัล' : 'View redemption history',
      path: '/portal/my-redemptions'
    },
    {
      icon: Camera,
      title: locale === 'th' ? 'ภาพถ่ายวันนี้' : 'Today Photos',
      description: locale === 'th' ? 'ดูภาพถ่ายพนักงานวันนี้' : 'View today employee photos',
      path: '/portal/photos'
    },
    {
      icon: MapPin,
      title: locale === 'th' ? 'อนุมัติ Checkout นอกสถานที่' : 'Approve Remote Checkout',
      description: locale === 'th' ? 'อนุมัติคำขอ checkout นอกพื้นที่' : 'Approve remote checkout requests',
      path: '/portal/approvals/remote-checkout'
    },
    {
      icon: FileText,
      title: locale === 'th' ? 'สรุปประจำวัน' : 'Daily Summary',
      description: locale === 'th' ? 'ดูสรุปการทำงานประจำวัน' : 'View daily work summary',
      path: '/portal/daily-summary'
    },
    {
      icon: XCircle,
      title: locale === 'th' ? 'ยกเลิกคำขอ' : 'Cancel Requests',
      description: locale === 'th' ? 'ยกเลิก OT/วันหยุด/ลางาน ที่รอ' : 'Cancel pending OT/leave requests',
      path: '/portal/my-history'
    },
    {
      icon: Backpack,
      title: locale === 'th' ? 'กระเป๋าของฉัน' : 'My Bag',
      description: locale === 'th' ? 'ดูไอเทมที่เก็บไว้' : 'View stored items',
      path: '/portal/my-bag'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {locale === 'th' ? '❓ ช่วยเหลือ' : '❓ Help'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {locale === 'th' ? 'คำถามที่พบบ่อยและวิธีใช้งาน' : 'FAQ and how to use'}
        </p>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            {locale === 'th' ? 'ทำอะไรได้บ้าง' : 'Quick Actions'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action, idx) => (
              <Link
                key={idx}
                to={action.path}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-center"
              >
                <action.icon className="h-6 w-6 text-primary" />
                <div>
                  <p className="font-medium text-sm">{action.title}</p>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            {locale === 'th' ? 'คำถามที่พบบ่อย' : 'Frequently Asked Questions'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={locale === 'th' ? 'ค้นหาคำถาม...' : 'Search questions...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Category Tabs */}
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
            <TabsList className="w-full h-auto flex-wrap justify-start gap-1">
              {FAQ_CATEGORIES.map(cat => (
                <TabsTrigger key={cat.value} value={cat.value} className="text-xs px-2 py-1">
                  {locale === 'th' ? cat.label.th : cat.label.en}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {isLoadingFaqs ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : faqs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {locale === 'th' ? 'ไม่พบคำถามที่ตรงกับการค้นหา' : 'No questions match your search'}
              </p>
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, idx) => (
                <AccordionItem key={idx} value={`faq-${idx}`}>
                  <AccordionTrigger className="text-left text-sm">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-sm">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
          
          {/* Results count */}
          {!isLoadingFaqs && searchQuery && (
            <p className="text-xs text-muted-foreground text-center">
              {locale === 'th' 
                ? `พบ ${faqs.length} คำถาม` 
                : `Found ${faqs.length} question${faqs.length !== 1 ? 's' : ''}`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            {locale === 'th' ? 'ติดต่อเรา' : 'Contact Us'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Phone className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium text-sm">
                {locale === 'th' ? 'โทรหา HR' : 'Call HR'}
              </p>
              <p className="text-sm text-muted-foreground">02-XXX-XXXX</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Mail className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium text-sm">
                {locale === 'th' ? 'ส่งอีเมล' : 'Send Email'}
              </p>
              <p className="text-sm text-muted-foreground">hr@company.com</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
