import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { usePortal } from '@/contexts/PortalContext';
import { 
  HelpCircle, Clock, Calendar, FileText, Gift, 
  MessageCircle, Phone, Mail, CheckCircle
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
      question: 'ฉันเช็คอินไม่ได้ แสดง "นอกพื้นที่"',
      answer: 'ตรวจสอบว่าอยู่ในพื้นที่ที่กำหนดและเปิด GPS แล้ว ถ้ายังมีปัญหาให้ติดต่อ HR'
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
      question: 'I cannot check in, shows "Out of area"',
      answer: 'Make sure you are within the designated area and GPS is enabled. If still having issues, contact HR.'
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
              <a
                key={idx}
                href={action.path}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-center"
              >
                <action.icon className="h-6 w-6 text-primary" />
                <div>
                  <p className="font-medium text-sm">{action.title}</p>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </div>
              </a>
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
