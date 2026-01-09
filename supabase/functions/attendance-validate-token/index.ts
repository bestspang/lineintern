import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger } from "../_shared/logger.ts";

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
      logger.warn('Token validation failed: missing token ID');
      return new Response(
        JSON.stringify({ error: 'Token ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('Validating token', { tokenId });

    // Get token with employee and branch details
    const { data: token, error: tokenError } = await supabase
      .from('attendance_tokens')
      .select(`
        *,
        employee:employees(
          *,
          branch:branches!employees_branch_id_fkey(*)
        )
      `)
      .eq('id', tokenId)
      .maybeSingle();
    
    if (!token || !token.employee) {
      return new Response(JSON.stringify({ valid: false, error: 'Token not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (tokenError || !token) {
      logger.warn('Token not found', { tokenId, error: tokenError });
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
      logger.info('Token already used', { tokenId });
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
      logger.info('Token expired', { tokenId, expires_at: token.expires_at });
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

    logger.info('Token validated successfully', { tokenId, employee_id: token.employee.id });

    // Get effective settings
    const { data: settings } = await supabase
      .rpc('get_effective_attendance_settings', { p_employee_id: token.employee.id })
      .maybeSingle();
    
    if (!settings) {
      return new Response(JSON.stringify({ valid: false, error: 'Settings not found' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

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
    logger.error('Token validation error', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
