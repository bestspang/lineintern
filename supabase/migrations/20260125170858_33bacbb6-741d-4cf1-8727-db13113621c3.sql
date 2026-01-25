-- Create table for Rich Menu button configuration
CREATE TABLE public.richmenu_button_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position INTEGER NOT NULL UNIQUE CHECK (position BETWEEN 1 AND 6),
  label TEXT NOT NULL,
  icon TEXT,
  action_type TEXT NOT NULL CHECK (action_type IN ('uri', 'message')),
  action_value TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Insert default values (matches current hardcoded config)
INSERT INTO public.richmenu_button_config (position, label, icon, action_type, action_value, description) VALUES
(1, 'เช็คอิน/เอาท์', '✓', 'uri', '/portal/checkin', 'เปิดหน้า Check-in/Check-out ผ่าน LIFF'),
(2, 'สถานะ', '🕐', 'message', '/status', 'แสดงสถานะการทำงานปัจจุบัน'),
(3, 'เมนู', '≡', 'uri', '/portal', 'เปิดหน้า Portal หลัก'),
(4, 'ลางาน', '📅', 'uri', '/portal/request-leave', 'เปิดหน้าขอลา/วันหยุดยืดหยุ่น'),
(5, 'ขอ OT', '+', 'uri', '/portal/request-ot', 'เปิดหน้าขอ OT'),
(6, 'ช่วยเหลือ', '?', 'message', '/help', 'แสดงคำสั่งทั้งหมดที่ใช้ได้');

-- Enable RLS
ALTER TABLE public.richmenu_button_config ENABLE ROW LEVEL SECURITY;

-- Everyone can view
CREATE POLICY "Anyone can view richmenu config" 
ON public.richmenu_button_config FOR SELECT 
USING (true);

-- Only admin/owner can update
CREATE POLICY "Admin can update richmenu config" 
ON public.richmenu_button_config FOR UPDATE 
USING (public.has_admin_access(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_richmenu_button_config_updated_at
BEFORE UPDATE ON public.richmenu_button_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment
COMMENT ON TABLE public.richmenu_button_config IS 'Configuration for LINE Rich Menu buttons - editable by admin';