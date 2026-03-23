import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getBangkokDateString } from '../_shared/timezone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get line_user_id from request body
    const body = await req.json();
    const lineUserId = body?.line_user_id;

    if (!lineUserId) {
      console.error('[employee-liff-validate] No line_user_id provided');
      return new Response(
        JSON.stringify({ error: 'LINE User ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[employee-liff-validate] Validating LINE User ID:', lineUserId.substring(0, 10) + '...');

    // Find employee by LINE User ID
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select(`
        id,
        code,
        full_name,
        line_user_id,
        role_id,
        branch_id,
        birth_date,
        skip_attendance_tracking,
        exclude_from_points,
        branches:branches!employees_branch_id_fkey (
          id,
          name
        ),
        employee_roles (
          id,
          role_key,
          display_name_th,
          display_name_en,
          priority
        )
      `)
      .eq('line_user_id', lineUserId)
      .maybeSingle();

    if (empError) {
      console.error('[employee-liff-validate] Database error:', empError);
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!employee) {
      console.log('[employee-liff-validate] No employee found for LINE User ID');
      return new Response(
        JSON.stringify({ 
          error: 'Employee not found', 
          message: 'ไม่พบข้อมูลพนักงานที่เชื่อมต่อกับ LINE นี้ กรุณาติดต่อ Admin' 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get menu items for this role
    let menuItems = [];
    if (employee.role_id) {
      const { data: menuData, error: menuError } = await supabase
        .from('role_menu_permissions')
        .select(`
          menu_items (
            id,
            menu_key,
            display_name_th,
            display_name_en,
            icon,
            action_type,
            action_url,
            display_order
          )
        `)
        .eq('role_id', employee.role_id)
        .order('menu_items(display_order)', { ascending: true });

      if (!menuError && menuData) {
        menuItems = menuData.map(item => item.menu_items).filter(Boolean);
      }
    } else {
      // If no role assigned, show basic menus
      const { data: basicMenus } = await supabase
        .from('menu_items')
        .select('*')
        .in('menu_key', ['work_history', 'leave_balance'])
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      menuItems = basicMenus || [];
    }

    // ⚠️ TIMEZONE: Use Bangkok date - NEVER use toISOString().split('T')[0]
    const today = getBangkokDateString();
    
    // Check if employee can check in/out
    const [checkInResult, checkOutResult, todayLogsResult] = await Promise.all([
      supabase.rpc('can_employee_check_in', { p_employee_id: employee.id }),
      supabase.rpc('can_employee_check_out', { p_employee_id: employee.id }),
      supabase
        .from('attendance_logs')
        .select('event_type, server_time')
        .eq('employee_id', employee.id)
        .gte('server_time', `${today}T00:00:00`)
        .lt('server_time', `${today}T23:59:59`)
        .order('server_time', { ascending: true })
    ]);

    const todayLogs = todayLogsResult.data || [];
    const checkInLog = todayLogs.find(l => l.event_type === 'check_in' || l.event_type === 'check-in');
    const checkOutLog = todayLogs.find(l => l.event_type === 'check_out' || l.event_type === 'check-out');

    // Calculate minutes worked
    let minutesWorked: number | null = null;
    if (checkInLog && !checkOutLog) {
      const checkInTime = new Date(checkInLog.server_time);
      minutesWorked = Math.floor((new Date().getTime() - checkInTime.getTime()) / 60000);
    } else if (checkInLog && checkOutLog) {
      const checkInTime = new Date(checkInLog.server_time);
      const checkOutTime = new Date(checkOutLog.server_time);
      minutesWorked = Math.floor((checkOutTime.getTime() - checkInTime.getTime()) / 60000);
    }

    console.log('[employee-liff-validate] Validated successfully for employee:', employee.full_name);

    return new Response(
      JSON.stringify({
        success: true,
        employee: {
          id: employee.id,
          code: employee.code,
          full_name: employee.full_name,
          line_user_id: employee.line_user_id,
          role: employee.employee_roles || null,
          branch: employee.branches || null,
          branch_id: employee.branch_id || null,
          birth_date: employee.birth_date || null,
          skip_attendance_tracking: employee.skip_attendance_tracking || false,
          exclude_from_points: employee.exclude_from_points || false
        },
        menuItems,
        attendance: {
          canCheckIn: checkInResult.data === true,
          canCheckOut: checkOutResult.data === true,
          todayCheckIn: checkInLog?.server_time || null,
          todayCheckOut: checkOutLog?.server_time || null,
          isWorking: !!checkInLog && !checkOutLog,
          minutesWorked
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[employee-liff-validate] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
