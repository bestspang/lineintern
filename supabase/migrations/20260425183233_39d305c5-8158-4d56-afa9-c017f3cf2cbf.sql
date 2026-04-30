DROP TABLE IF EXISTS public.receipt_ocr_corrections CASCADE;
DROP TABLE IF EXISTS public.receipt_categories CASCADE;

DROP FUNCTION IF EXISTS public.update_receipts_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.update_receipt_settings_updated_at() CASCADE;

DELETE FROM public.bot_commands WHERE category = 'receipt';

DELETE FROM public.webapp_page_config 
WHERE menu_group = 'Deposits' OR page_path LIKE '/attendance/deposit%';

ALTER TABLE public.notification_preferences 
  DROP COLUMN IF EXISTS notify_receipts;