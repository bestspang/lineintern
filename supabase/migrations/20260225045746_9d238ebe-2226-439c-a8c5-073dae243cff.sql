-- Create function to auto-notify on receipt approval status change
CREATE OR REPLACE FUNCTION public.notify_receipt_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_employee_id uuid;
  v_title text;
  v_body text;
BEGIN
  -- Only fire when approval_status actually changes to approved/rejected
  IF (OLD.approval_status IS DISTINCT FROM NEW.approval_status)
     AND NEW.approval_status IN ('approved', 'rejected') THEN
    
    -- Look up employee by line_user_id
    SELECT id INTO v_employee_id
    FROM employees
    WHERE line_user_id = NEW.line_user_id
    LIMIT 1;
    
    IF v_employee_id IS NOT NULL THEN
      v_title := CASE NEW.approval_status
        WHEN 'approved' THEN '✅ ใบเสร็จได้รับอนุมัติ'
        ELSE '❌ ใบเสร็จถูกปฏิเสธ'
      END;
      
      v_body := format('ใบเสร็จ %s จำนวน %s บาท',
        COALESCE(NEW.vendor, 'ไม่ระบุร้าน'),
        COALESCE(NEW.total::text, '-'));
      
      INSERT INTO notifications (employee_id, title, body, type, priority, action_url, metadata)
      VALUES (
        v_employee_id,
        v_title,
        v_body,
        'approval',
        'normal',
        '/portal/my-receipts',
        jsonb_build_object('request_type', 'receipt', 'receipt_id', NEW.id, 'action', NEW.approval_status)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on receipts table
CREATE TRIGGER trg_notify_receipt_approval
AFTER UPDATE OF approval_status ON public.receipts
FOR EACH ROW
EXECUTE FUNCTION public.notify_receipt_approval();