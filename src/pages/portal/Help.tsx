import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { usePortal } from '@/contexts/PortalContext';
import { 
  HelpCircle, Clock, Calendar, FileText, Gift, 
  MessageCircle, Phone, Mail, CheckCircle, Receipt, Star, User,
  CalendarDays, Wallet, Trophy, Banknote, History, CheckSquare, CalendarMinus
} from 'lucide-react';

export default function Help() {
  const { locale } = usePortal();

  const faqs = locale === 'th' ? [
    {
      question: 'ฉันจะเช็คอินได้อย่างไร?',
      answer: 'กดปุ่ม "เช็คอิน/เอาท์" จาก Rich Menu หรือเมนูหลัก จากนั้นอนุญาตให้แอปเข้าถึงตำแหน่งและกล้อง แล้วถ่ายรูปยืนยัน'
    },
    {
      question: 'ฉันลืมเช็คเอาท์ ต้องทำอย่างไร?',
      answer: 'ระบบจะเช็คเอาท์อัตโนมัติตอนเที่ยงคืน แต่ถ้าต้องการแก้ไขเวลา กรุณาติดต่อหัวหน้างานหรือ HR'
    },
    {
      question: 'ฉันจะขอ OT ได้อย่างไร?',
      answer: 'กดเมนู "ขอ OT" เลือกวันที่และเวลาที่ต้องการ พร้อมระบุเหตุผล รอการอนุมัติจากหัวหน้างาน'
    },
    {
      question: 'ฉันจะขอลาได้อย่างไร?',
      answer: 'กดเมนู "ลางาน" เลือกประเภทการลา วันที่ และเหตุผล รอการอนุมัติจากหัวหน้างาน'
    },
    {
      question: 'Happy Points คืออะไร?',
      answer: 'คะแนนสะสมจากการมาทำงานตรงเวลา ทำ OT และกิจกรรมต่างๆ สามารถนำไปแลกของรางวัลได้'
    },
    {
      question: 'ฉันได้แต้ม Happy Points จากอะไรบ้าง?',
      answer: 'มาตรงเวลา (+10), ยืนยันตัวตนสำเร็จ (+5), คะแนนการตอบรายวัน (คำนวณจากความเร็วเฉลี่ย สูงสุด +8), streak 5 วันติด (+50), และโบนัสสุขภาพต้นเดือน (+100)'
    },
    {
      question: 'Streak คืออะไร และนับอย่างไร?',
      answer: 'Streak คือจำนวนวันที่มาตรงเวลาติดต่อกัน ระบบข้ามวันหยุดและวันลาอัตโนมัติ ถ้าสาย 1 วัน streak จะรีเซ็ตเป็น 0 ครบ 5 วันติดได้โบนัส +50 แต้ม'
    },
    {
      question: 'ถ้ามาตรงเวลาทั้งเดือนได้โบนัสไหม?',
      answer: 'ได้ครับ! ถ้า streak ถึง 20 วันขึ้นไปในเดือนนั้น จะได้โบนัส Monthly Streak +100 แต้ม เพิ่มจากโบนัส 5 วันติดอีกด้วย'
    },
    {
      question: 'Streak Shield (โล่ป้องกัน) คืออะไร?',
      answer: 'โล่ป้องกันที่ใช้อัตโนมัติเมื่อคุณมาสายหรือขาดงาน เพื่อรักษา streak ของคุณไว้ ซื้อได้ในร้านแลกรางวัลด้วย 200 แต้ม'
    },
    {
      question: 'แต้มถูกหักได้ไหม?',
      answer: 'ได้ จากโบนัสสุขภาพ 100 แต้มที่ได้ต้นเดือน หากลาป่วยไม่มีใบรับรองแพทย์หัก -30 หรือมีใบรับรองหัก -5'
    },
    {
      question: 'ฉันเช็คอินไม่ได้ แสดง "นอกพื้นที่"',
      answer: 'ตรวจสอบว่าอยู่ในพื้นที่ที่กำหนดและเปิด GPS แล้ว ถ้ายังมีปัญหาให้ติดต่อ HR'
    },
    {
      question: 'วันหยุดยืดหยุ่น (Flexible Day-Off) คืออะไร?',
      answer: 'ระบบวันหยุดพิเศษที่ให้คุณเลือกวันหยุดได้ตามต้องการ โดยต้องแจ้งล่วงหน้าตามที่บริษัทกำหนด'
    },
    {
      question: 'ระบบใบเสร็จใช้งานอย่างไร?',
      answer: 'ถ่ายรูปใบเสร็จส่งในแชท LINE หรือเพิ่มใบเสร็จด้วยตนเองในเมนู "ใบเสร็จ" AI จะดึงข้อมูลให้อัตโนมัติ'
    },
    {
      question: 'ยกเลิกคำขอ OT/ลา ได้ไหม?',
      answer: 'ได้ ถ้าคำขอยังไม่ได้รับการอนุมัติ ใช้คำสั่ง "ยกเลิก OT" หรือ "ยกเลิกลา" ในแชท LINE'
    },
    {
      question: 'ฉันดู Payroll ของตัวเองได้อย่างไร?',
      answer: 'กดเมนู "Payroll ของฉัน" เพื่อดูรายได้ประมาณการ ชั่วโมงทำงาน OT และรายละเอียดต่างๆ'
    },
    {
      question: 'ตารางกะคืออะไร และดูได้ที่ไหน?',
      answer: 'กดเมนู "ตารางกะ" เพื่อดูตารางการทำงานของคุณในแต่ละสัปดาห์ รวมถึงเวลาเข้า-ออกงาน และวันหยุด'
    },
    {
      question: 'Leaderboard คืออะไร?',
      answer: 'แสดงอันดับ Happy Points ของพนักงานในสาขาเดียวกัน แข่งขันกับเพื่อนร่วมงานเพื่อรับรางวัล'
    },
    {
      question: 'ฉันจะส่งใบฝากเงินได้อย่างไร?',
      answer: 'กดเมนู "ฝากเงิน" ถ่ายรูปหน้าเพื่อยืนยันตัวตน แล้วถ่ายรูปใบฝากเงิน ระบบจะดึงข้อมูลให้อัตโนมัติ'
    },
    {
      question: 'ฉันจะยกเลิกคำขอ OT ได้อย่างไร?',
      answer: 'ใช้คำสั่ง "/cancel-ot" หรือ "ยกเลิกโอที" ในแชท LINE หากคำขอยังรออนุมัติ'
    },
    {
      question: 'ดูประวัติการเข้างานได้ที่ไหน?',
      answer: 'กดเมนู "ประวัติการเข้างาน" เพื่อดูบันทึกการเช็คอิน/เอาท์ และสถานะการทำงานย้อนหลัง'
    },
    {
      question: 'หน้าอนุมัติใช้ทำอะไร?',
      answer: 'สำหรับหัวหน้างาน ใช้อนุมัติ/ปฏิเสธคำขอลา, OT, การลาก่อนเวลา และการแลกของรางวัลของทีม'
    }
  ] : [
    {
      question: 'How do I check in?',
      answer: 'Press "Check In/Out" from Rich Menu or main menu, allow location and camera access, then take a photo to confirm.'
    },
    {
      question: 'I forgot to check out, what should I do?',
      answer: 'The system will auto check-out at midnight. If you need to modify the time, please contact your supervisor or HR.'
    },
    {
      question: 'How do I request OT?',
      answer: 'Press "Request OT" menu, select date and time, provide a reason. Wait for supervisor approval.'
    },
    {
      question: 'How do I request leave?',
      answer: 'Press "Request Leave" menu, select leave type, dates, and reason. Wait for supervisor approval.'
    },
    {
      question: 'What are Happy Points?',
      answer: 'Points earned from on-time attendance, OT, and various activities. Can be redeemed for rewards.'
    },
    {
      question: 'How do I earn Happy Points?',
      answer: 'On-time check-in (+10), identity verification (+5), daily response score (based on avg speed, max +8), 5-day streak (+50), and monthly health bonus (+100).'
    },
    {
      question: 'What is a Streak and how is it counted?',
      answer: 'Streak is consecutive on-time days. System skips holidays and approved leaves. Being late once resets streak to 0. Every 5 days gives +50 bonus.'
    },
    {
      question: 'Do I get a bonus for being on-time all month?',
      answer: 'Yes! If your streak reaches 20+ days in a month, you get a Monthly Streak Bonus of +100 points, on top of the 5-day bonuses.'
    },
    {
      question: 'What is a Streak Shield?',
      answer: 'A protection item that automatically saves your streak if you are late or miss a day. Purchase in the Reward Shop for 200 points.'
    },
    {
      question: 'Can points be deducted?',
      answer: 'Yes, from your 100-point monthly health bonus. Sick leave without certificate deducts -30, with certificate deducts -5.'
    },
    {
      question: 'I cannot check in, shows "Out of area"',
      answer: 'Make sure you are within the designated area and GPS is enabled. If still having issues, contact HR.'
    },
    {
      question: 'What is Flexible Day-Off?',
      answer: 'A special leave system that lets you choose your own days off, with advance notice as required by company policy.'
    },
    {
      question: 'How do I use the receipts feature?',
      answer: 'Take a photo of the receipt in LINE chat, or add receipts manually in "Receipts" menu. AI will extract data automatically.'
    },
    {
      question: 'Can I cancel OT/leave requests?',
      answer: 'Yes, if the request is still pending. Use "ยกเลิก OT" or "ยกเลิกลา" commands in LINE chat.'
    },
    {
      question: 'How do I view my payroll?',
      answer: 'Press "My Payroll" menu to see estimated earnings, work hours, OT, and other details.'
    },
    {
      question: 'What is My Schedule and where can I view it?',
      answer: 'Press "My Schedule" menu to view your weekly work schedule including shift times and days off.'
    },
    {
      question: 'What is the Leaderboard?',
      answer: 'Shows Happy Points rankings of employees in your branch. Compete with colleagues to earn rewards.'
    },
    {
      question: 'How do I submit a deposit slip?',
      answer: 'Press "Deposit" menu, take a face photo for verification, then capture the deposit slip. System will auto-extract data.'
    },
    {
      question: 'How do I cancel an OT request?',
      answer: 'Use "/cancel-ot" or "ยกเลิกโอที" command in LINE chat if the request is still pending.'
    },
    {
      question: 'Where can I view my work history?',
      answer: 'Press "Work History" menu to see your check-in/out records and attendance status.'
    },
    {
      question: 'What is the Approvals page for?',
      answer: 'For supervisors to approve/reject leave requests, OT, early leave, and reward redemptions from their team.'
    }
  ];

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
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, idx) => (
              <AccordionItem key={idx} value={`item-${idx}`}>
                <AccordionTrigger className="text-left text-sm">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
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
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {locale === 'th' 
              ? 'หากมีปัญหาหรือข้อสงสัยเพิ่มเติม กรุณาติดต่อ:'
              : 'If you have any issues or questions, please contact:'
            }
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Phone className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">{locale === 'th' ? 'โทรศัพท์' : 'Phone'}</p>
                <p className="text-sm text-muted-foreground">HR Department</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Mail className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">{locale === 'th' ? 'อีเมล' : 'Email'}</p>
                <p className="text-sm text-muted-foreground">hr@company.com</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
