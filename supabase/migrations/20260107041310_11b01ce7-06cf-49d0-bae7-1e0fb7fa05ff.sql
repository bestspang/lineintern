-- Create api_configurations table for centralized API key management
CREATE TABLE public.api_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_name TEXT UNIQUE NOT NULL,
  key_value TEXT,
  description TEXT,
  description_th TEXT,
  source_url TEXT,
  is_required BOOLEAN DEFAULT false,
  category TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.api_configurations ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "Authenticated can read api_configurations"
  ON public.api_configurations
  FOR SELECT
  TO authenticated
  USING (true);

-- Admin users can manage (insert, update, delete)
CREATE POLICY "Admins can manage api_configurations"
  ON public.api_configurations
  FOR ALL
  TO authenticated
  USING (public.has_admin_access(auth.uid()));

-- Pre-populate known configurations
INSERT INTO public.api_configurations (key_name, description, description_th, source_url, is_required, category) VALUES
  ('MAPBOX_PUBLIC_TOKEN', 'Mapbox Public Token for maps (Map Picker, Location Heatmap)', 'Mapbox Public Token สำหรับแผนที่ (Map Picker, Location Heatmap)', 'https://account.mapbox.com/access-tokens/', true, 'maps'),
  ('GOOGLE_MAPS_API_KEY', 'Google Maps API Key (if using Google Maps)', 'Google Maps API Key (ถ้าใช้ Google Maps)', 'https://console.cloud.google.com/apis/credentials', false, 'maps'),
  ('LIFF_ID', 'LINE LIFF App ID for in-app browser', 'LINE LIFF App ID สำหรับเปิดใน LINE', 'https://developers.line.biz/console/', false, 'line');

-- Create trigger for updated_at
CREATE TRIGGER update_api_configurations_updated_at
  BEFORE UPDATE ON public.api_configurations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();