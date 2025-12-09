import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Proxy function to trigger attendance-daily-summary
 * This prevents exposing CRON_SECRET in frontend code
 */
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target_date, force_send } = await req.json();
    
    // Get secrets from environment (not exposed to frontend)
    const cronSecret = Deno.env.get('CRON_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!cronSecret || !supabaseUrl || !supabaseAnonKey) {
      console.error('[trigger-daily-summary] Missing required environment variables');
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call the actual attendance-daily-summary function
    const response = await fetch(
      `${supabaseUrl}/functions/v1/attendance-daily-summary`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'x-cron-secret': cronSecret,
        },
        body: JSON.stringify({ 
          target_date: target_date || new Date().toISOString().split('T')[0],
          force_send: force_send ?? true 
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[trigger-daily-summary] Upstream error:', response.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: `Upstream error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('[trigger-daily-summary] Success:', data);
    
    return new Response(
      JSON.stringify({ success: true, ...data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[trigger-daily-summary] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});