import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { usePortal } from '@/contexts/PortalContext';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  HelpCircle, Clock, Calendar, FileText, Gift, 
  MessageCircle, Phone, Mail, CheckCircle, Receipt, Star, User,
  CalendarDays, Wallet, Trophy, Banknote, History, CheckSquare, CalendarMinus,
  Activity, Package, Camera
} from 'lucide-react';

// Static fallback FAQs (used when database is empty or has errors)
const STATIC_FAQS_TH = [
  { question: 'ฉันจะเช็คอินได้อย่างไร?', answer: 'กดปุ่ม "เช็คอิน/เอาท์" จาก Rich Menu หรือเมนูหลัก จากนั้นอนุญาตให้แอปเข้าถึงตำแหน่งและกล้อง แล้วถ่ายรูปยืนยัน' },
  { question: 'ฉันลืมเช็คเอาท์ ต้องทำอย่างไร?', answer: 'ระบบจะเช็คเอาท์อัตโนมัติตอนเที่ยงคืน แต่ถ้าต้องการแก้ไขเวลา กรุณาติดต่อหัวหน้างานหรือ HR' },
  { question: 'Happy Points คืออะไร?', answer: 'คะแนนสะสมจากการมาทำงานตรงเวลา ทำ OT และกิจกรรมต่างๆ สามารถนำไปแลกของรางวัลได้' },
];

const STATIC_FAQS_EN = [
  { question: 'How do I check in?', answer: 'Press "Check In/Out" from Rich Menu or main menu, allow location and camera access, then take a photo to confirm.' },
  { question: 'I forgot to check out, what should I do?', answer: 'The system will auto check-out at midnight. If you need to modify the time, please contact your supervisor or HR.' },
  { question: 'What are Happy Points?', answer: 'Points earned from on-time attendance, OT, and various activities. Can be redeemed for rewards.' },
];

export default function Help() {
  const { locale } = usePortal();

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
  const faqs = dbFaqs && dbFaqs.length > 0
    ? dbFaqs.map(faq => ({
        question: locale === 'th' ? faq.question_th : faq.question_en,
        answer: locale === 'th' ? faq.answer_th : faq.answer_en,
      }))
    : (locale === 'th' ? STATIC_FAQS_TH : STATIC_FAQS_EN);

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
      icon: FileText,
      title: locale === 'th' ? 'สรุปประจำวัน' : 'Daily Summary',
      description: locale === 'th' ? 'ดูสรุปการทำงานประจำวัน' : 'View daily work summary',
      path: '/portal/daily-summary'
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
        <CardContent>
          {isLoadingFaqs ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
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
