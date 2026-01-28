-- Fix duplicate sort_order values in portal_faqs
-- This ensures consistent ordering in FAQ list display

UPDATE portal_faqs SET sort_order = 4.5 
WHERE question_th = 'ฉันจะ checkout นอกสถานที่ได้อย่างไร?';

UPDATE portal_faqs SET sort_order = 10.1 
WHERE question_th = 'ฉันจะยกเลิกคำขอ OT ได้อย่างไร?';

UPDATE portal_faqs SET sort_order = 10.2 
WHERE question_th = 'ฉันจะยกเลิกคำขอวันหยุดได้อย่างไร?';

UPDATE portal_faqs SET sort_order = 10.3 
WHERE question_th = 'ฉันจะยกเลิกคำขอลางานได้อย่างไร?';