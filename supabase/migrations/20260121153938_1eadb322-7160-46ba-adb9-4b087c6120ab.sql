-- Create portal_faqs table for dynamic FAQ management
CREATE TABLE public.portal_faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_th TEXT NOT NULL,
  question_en TEXT NOT NULL,
  answer_th TEXT NOT NULL,
  answer_en TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for performance
CREATE INDEX idx_portal_faqs_active_order ON public.portal_faqs(is_active, sort_order);

-- Enable RLS
ALTER TABLE public.portal_faqs ENABLE ROW LEVEL SECURITY;

-- Anyone can read active FAQs (for Portal users)
CREATE POLICY "Anyone can read active portal faqs" ON public.portal_faqs
  FOR SELECT USING (is_active = true);

-- Authenticated users can read all FAQs (for admin page)
CREATE POLICY "Authenticated users can read all portal faqs" ON public.portal_faqs
  FOR SELECT TO authenticated USING (true);

-- Authenticated users can manage FAQs (admin functionality)
CREATE POLICY "Authenticated users can insert portal faqs" ON public.portal_faqs
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update portal faqs" ON public.portal_faqs
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete portal faqs" ON public.portal_faqs
  FOR DELETE TO authenticated USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_portal_faqs_updated_at
  BEFORE UPDATE ON public.portal_faqs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial FAQs (migrated from hardcoded Help.tsx)
INSERT INTO public.portal_faqs (question_th, question_en, answer_th, answer_en, category, sort_order) VALUES
-- Attendance category
('ฉันจะเช็คอินได้อย่างไร?', 'How do I check in?', 'กดเมนู "เช็คอิน/เอาท์" แล้วเลือก "เช็คอิน" ระบบจะขอตำแหน่งและถ่ายรูป', 'Go to "Check In/Out" menu and select "Check In". The system will request your location and photo.', 'attendance', 1),
('ฉันลืมเช็คเอาท์ ทำอย่างไร?', 'I forgot to check out, what should I do?', 'แจ้งหัวหน้างานหรือ HR เพื่อขอแก้ไขเวลาเช็คเอาท์ย้อนหลัง', 'Contact your supervisor or HR to request a retroactive check-out time correction.', 'attendance', 2),
('ทำไมเช็คอินไม่ได้?', 'Why can''t I check in?', 'อาจเกิดจาก: 1) อยู่นอกพื้นที่สาขา 2) GPS ไม่ถูกต้อง 3) เช็คอินซ้ำ ลองรีเฟรชหน้าหรือติดต่อ HR', 'Possible reasons: 1) Outside branch area 2) GPS inaccurate 3) Duplicate check-in. Try refreshing or contact HR.', 'attendance', 3),
('ฉันสามารถเช็คอินจากที่ไหนก็ได้หรือไม่?', 'Can I check in from anywhere?', 'ไม่ได้ คุณต้องอยู่ในรัศมีที่กำหนดของสาขาที่คุณสังกัด ระบบจะตรวจสอบตำแหน่ง GPS', 'No, you must be within the designated radius of your assigned branch. The system verifies GPS location.', 'attendance', 4),

-- Leave/OT category
('ฉันจะขอลาอย่างไร?', 'How do I request leave?', 'กดเมนู "ขอลา" เลือกประเภทการลา วันที่ และเหตุผล จากนั้นส่งคำขอรออนุมัติ', 'Go to "Request Leave" menu, select leave type, dates, and reason. Then submit for approval.', 'leave-ot', 5),
('การลาประเภทไหนบ้างที่ขอได้?', 'What types of leave can I request?', 'มีลาป่วย ลากิจ ลาพักร้อน และลาประเภทอื่นๆ ตามนโยบายบริษัท', 'Sick leave, personal leave, vacation, and other types as per company policy.', 'leave-ot', 6),
('ฉันจะตรวจสอบวันลาคงเหลือได้ที่ไหน?', 'Where can I check my remaining leave balance?', 'กดเมนู "วันลาคงเหลือ" จะแสดงจำนวนวันลาแต่ละประเภทที่เหลือ', 'Go to "Leave Balance" menu to see remaining days for each leave type.', 'leave-ot', 7),
('ฉันจะขอ OT อย่างไร?', 'How do I request overtime (OT)?', 'กดเมนู "ขอ OT" เลือกวันและเวลาที่ต้องการทำ OT พร้อมเหตุผล แล้วส่งคำขอ', 'Go to "Request OT" menu, select date, time, and provide a reason. Then submit for approval.', 'leave-ot', 8),
('OT ที่ขอไว้จะได้รับการอนุมัติเมื่อไหร่?', 'When will my OT request be approved?', 'ขึ้นอยู่กับหัวหน้างาน โดยปกติจะอนุมัติภายใน 1-2 วันทำการ คุณจะได้รับแจ้งผ่าน LINE', 'Depends on your supervisor. Usually approved within 1-2 working days. You will be notified via LINE.', 'leave-ot', 9),

-- Points category
('Happy Points คืออะไร?', 'What are Happy Points?', 'คะแนนสะสมจากการทำงาน เช่น เข้างานตรงเวลา เช็คอินต่อเนื่อง สามารถแลกของรางวัลได้', 'Points earned from work activities like punctuality and consistent check-ins. Redeemable for rewards.', 'points', 10),
('ฉันจะดูแต้มสะสมได้ที่ไหน?', 'Where can I see my points?', 'กดเมนู "Happy Points" จะแสดงแต้มปัจจุบัน ประวัติ และสถานะ Streak', 'Go to "Happy Points" menu to see current points, history, and streak status.', 'points', 11),
('Streak คืออะไร?', 'What is a Streak?', 'การเช็คอินต่อเนื่องทุกวัน ยิ่ง Streak ยาว ยิ่งได้โบนัสแต้มมากขึ้น', 'Consecutive daily check-ins. Longer streaks earn more bonus points.', 'points', 12),
('ทำไม Streak ของฉันหายไป?', 'Why did my Streak disappear?', 'Streak จะรีเซ็ตเมื่อขาดงานหรือไม่เช็คอินในวันทำงาน (ไม่รวมวันหยุด)', 'Streak resets when you miss work or don''t check in on a working day (excludes holidays).', 'points', 13),
('ฉันจะแลกของรางวัลอย่างไร?', 'How do I redeem rewards?', 'กดเมนู "ร้านค้ารางวัล" เลือกของรางวัลที่ต้องการ กด "แลก" รอการอนุมัติจาก HR', 'Go to "Reward Shop" menu, select a reward, click "Redeem", and wait for HR approval.', 'points', 14),
('ของรางวัลที่แลกไปแล้วจะได้รับเมื่อไหร่?', 'When will I receive my redeemed rewards?', 'หลังจาก HR อนุมัติ คุณจะได้รับแจ้งและรับของรางวัลตามช่องทางที่กำหนด', 'After HR approval, you will be notified and receive the reward through the designated channel.', 'points', 15),
('Streak Shield คืออะไร?', 'What is a Streak Shield?', 'Shield ป้องกัน Streak ไม่ให้รีเซ็ตเมื่อขาดงาน 1 วัน ใช้ 200 แต้มแลก', 'Shield protects your streak from resetting when you miss 1 day. Costs 200 points to redeem.', 'points', 16),

-- Receipts category
('ฉันจะส่งใบเสร็จอย่างไร?', 'How do I submit a receipt?', 'กดเมนู "ใบเสร็จ" แล้วเลือก "เพิ่มใบเสร็จใหม่" ถ่ายรูปหรืออัพโหลดใบเสร็จ กรอกรายละเอียด', 'Go to "Receipts" menu, select "Add New Receipt", take/upload photo, and fill in details.', 'receipts', 17),
('ใบเสร็จต้องมีข้อมูลอะไรบ้าง?', 'What information must a receipt have?', 'ต้องมี: วันที่ ร้านค้า/บริษัท รายการสินค้า ยอดรวม และเลขที่ใบเสร็จ (ถ้ามี)', 'Must include: Date, store/company name, items, total amount, and receipt number (if any).', 'receipts', 18),
('ฉันจะตรวจสอบสถานะใบเสร็จได้ที่ไหน?', 'Where can I check my receipt status?', 'กดเมนู "ใบเสร็จ" จะเห็นรายการใบเสร็จทั้งหมดพร้อมสถานะ (รอตรวจ/อนุมัติ/ปฏิเสธ)', 'Go to "Receipts" menu to see all receipts with status (pending/approved/rejected).', 'receipts', 19),
('ฉันจะฝากเงินอย่างไร?', 'How do I submit a deposit?', 'กดเมนู "ฝากเงิน" ถ่ายรูปสลิปโอนเงิน กรอกจำนวนเงินและรายละเอียด แล้วส่ง', 'Go to "Deposit Upload" menu, take a photo of transfer slip, enter amount and details, then submit.', 'receipts', 20),

-- General category
('ฉันจะแก้ไขข้อมูลส่วนตัวได้ที่ไหน?', 'Where can I edit my personal information?', 'ติดต่อ HR เพื่อขอแก้ไขข้อมูลส่วนตัว เช่น ชื่อ เบอร์โทร หรือที่อยู่', 'Contact HR to request changes to personal information such as name, phone, or address.', 'general', 21),
('ฉันจะติดต่อ HR ได้อย่างไร?', 'How can I contact HR?', 'โทร 02-XXX-XXXX หรือส่งอีเมลไปที่ hr@company.com ในเวลาทำการ', 'Call 02-XXX-XXXX or email hr@company.com during business hours.', 'general', 22);