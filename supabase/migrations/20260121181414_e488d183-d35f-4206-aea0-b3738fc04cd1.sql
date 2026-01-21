-- Drop old constraint that only allows check_in, check_out, both
ALTER TABLE cute_quotes DROP CONSTRAINT IF EXISTS cute_quotes_show_time_check;

-- Add new constraint with 'deposit' included
ALTER TABLE cute_quotes ADD CONSTRAINT cute_quotes_show_time_check 
  CHECK (show_time = ANY (ARRAY['check_in'::text, 'check_out'::text, 'both'::text, 'deposit'::text]));

-- Insert deposit-specific quotes
INSERT INTO cute_quotes (text, text_en, emoji, category, show_time, bg_color, is_active, display_order)
VALUES 
('ฝากเงินเรียบร้อย! ขอบคุณค่ะ', 'Deposit complete! Thank you!', '💰', 'general', 'deposit', 'green-teal', true, 100),
('เงินสดเข้าตู้เซฟเรียบร้อย!', 'Cash secured safely!', '🏦', 'motivational', 'deposit', 'blue-cyan', true, 101),
('ยอดเยี่ยม! บันทึกเงินสดแล้ว', 'Excellent! Cash recorded!', '✅', 'general', 'deposit', 'green-teal', true, 102),
('วันนี้ยอดขายเท่าไหร่น้า?', 'How much sales today?', '📊', 'fun', 'deposit', 'orange-yellow', true, 103);