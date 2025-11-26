import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    // Get token from request body
    const body = await req.json();
    const token = body?.token;

    if (!token) {
      console.error('[employee-menu-validate] No token provided in request body');
      return new Response(
        JSON.stringify({ error: 'Token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[employee-menu-validate] Validating token:', token.substring(0, 20) + '...');

    // Validate token
    const { data: tokenData, error: tokenError } = await supabase
      .from('employee_menu_tokens')
      .select('id, employee_id, expires_at, used_at')
      .eq('token', token)
      .maybeSingle();

    if (tokenError || !tokenData) {
      console.error('[employee-menu-validate] Token not found:', tokenError);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token already used
    if (tokenData.used_at) {
      console.log('[employee-menu-validate] Token already used');
      return new Response(
        JSON.stringify({ error: 'Token already used' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token expired
    const now = new Date();
    const expiresAt = new Date(tokenData.expires_at);
    if (now > expiresAt) {
      console.log('[employee-menu-validate] Token expired');
      return new Response(
        JSON.stringify({ error: 'Token expired' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark token as used
    await supabase
      .from('employee_menu_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenData.id);

    // Get employee data with role
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select(`
        id,
        code,
        full_name,
        line_user_id,
        role_id,
        branch_id,
        branches!inner (
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
      .eq('id', tokenData.employee_id)
      .eq('branches.is_deleted', false)
      .maybeSingle();
    
    if (!employee) {
      return new Response(JSON.stringify({ valid: false, error: 'Employee not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (empError || !employee) {
      console.error('[employee-menu-validate] Employee not found:', empError);
      return new Response(
        JSON.stringify({ error: 'Employee not found' }),
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

    console.log('[employee-menu-validate] Token validated successfully for employee:', employee.full_name);

    return new Response(
      JSON.stringify({
        success: true,
        employee: {
          id: employee.id,
          code: employee.code,
          full_name: employee.full_name,
          role: employee.employee_roles || null,
          branch: employee.branches || null
        },
        menuItems
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[employee-menu-validate] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});