-- เพิ่ม FAQs สำหรับ features ใหม่: Remote Checkout, Cancel OT, Cancel Day-Off
INSERT INTO portal_faqs (question_th, question_en, answer_th, answer_en, category, sort_order, is_active) VALUES
('ฉันจะ checkout นอกสถานที่ได้อย่างไร?', 
 'How can I check out from outside the office?',
 'หากคุณอยู่นอกพื้นที่สาขา ระบบจะแสดง dialog ให้กรอกเหตุผล จากนั้นส่งคำขอไปยังหัวหน้าเพื่ออนุมัติ เมื่ออนุมัติแล้วระบบจะ checkout ให้อัตโนมัติ',
 'If you are outside the branch area, the system will show a dialog to enter your reason. The request will be sent to your manager for approval. Once approved, the system will automatically check you out.',
 'attendance', 4.5, true),

('ฉันจะยกเลิกคำขอ OT ได้อย่างไร?',
 'How can I cancel an OT request?',
 'พิมพ์ /cancel-ot หรือ ยกเลิกโอที ใน LINE Chat กับบอท ระบบจะแสดงรายการ OT ที่รออนุมัติให้เลือกยกเลิก',
 'Type /cancel-ot in LINE Chat with the bot. The system will show pending OT requests to cancel.',
 'leave-ot', 9.5, true),

('ฉันจะยกเลิกคำขอวันหยุดได้อย่างไร?',
 'How can I cancel a day-off request?',
 'พิมพ์ /cancel-dayoff หรือ ยกเลิกวันหยุด ใน LINE Chat กับบอท ระบบจะแสดงรายการวันหยุดที่รออนุมัติให้เลือกยกเลิก',
 'Type /cancel-dayoff in LINE Chat with the bot. The system will show pending day-off requests to cancel.',
 'leave-ot', 9.6, true);