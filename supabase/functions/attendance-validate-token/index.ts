import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    const tokenId = url.searchParams.get('t');

    if (!tokenId) {
      return new Response(
        JSON.stringify({ error: 'Token ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get token with employee and branch details
    const { data: token, error: tokenError } = await supabase
      .from('attendance_tokens')
      .select(`
        *,
        employee:employees(
          *,
          branch:branches(*)
        )
      `)
      .eq('id', tokenId)
      .single();

    if (tokenError || !token) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'Token not found',
          errorCode: 'TOKEN_NOT_FOUND'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token is already used
    if (token.status === 'used') {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'This link has already been used',
          errorCode: 'TOKEN_ALREADY_USED'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token is expired
    if (new Date(token.expires_at) < new Date()) {
      // Mark as expired
      await supabase
        .from('attendance_tokens')
        .update({ status: 'expired' })
        .eq('id', tokenId);

      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'This link has expired. Please request a new link from the bot.',
          errorCode: 'TOKEN_EXPIRED'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get effective settings
    const { data: settings } = await supabase
      .rpc('get_effective_attendance_settings', { p_employee_id: token.employee.id })
      .single();

    return new Response(
      JSON.stringify({
        valid: true,
        token: {
          id: token.id,
          type: token.type,
          expires_at: token.expires_at
        },
        employee: {
          id: token.employee.id,
          full_name: token.employee.full_name,
          code: token.employee.code,
          role: token.employee.role
        },
        branch: token.employee.branch,
        settings: settings || {}
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
