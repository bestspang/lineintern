import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OAuthRequest {
  action: 'get_auth_url' | 'exchange_code' | 'refresh_token' | 'check_connection' | 'disconnect';
  lineUserId?: string;
  employeeId?: string;
  code?: string;
  redirectUri?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get Google OAuth credentials from api_configurations
    const { data: clientIdConfig } = await supabase
      .from('api_configurations')
      .select('key_value')
      .eq('key_name', 'GOOGLE_CLIENT_ID')
      .single();

    const { data: clientSecretConfig } = await supabase
      .from('api_configurations')
      .select('key_value')
      .eq('key_name', 'GOOGLE_CLIENT_SECRET')
      .single();

    const GOOGLE_CLIENT_ID = clientIdConfig?.key_value;
    const GOOGLE_CLIENT_SECRET = clientSecretConfig?.key_value;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return new Response(
        JSON.stringify({ error: 'Google OAuth not configured. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in API Keys.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: OAuthRequest = await req.json();
    const { action, lineUserId, employeeId, code, redirectUri } = body;

    const SCOPES = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/spreadsheets'
    ].join(' ');

    switch (action) {
      case 'get_auth_url': {
        if (!redirectUri) {
          return new Response(
            JSON.stringify({ error: 'redirectUri is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const state = JSON.stringify({ lineUserId, employeeId, redirectUri });
        const encodedState = btoa(state);

        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', SCOPES);
        authUrl.searchParams.set('access_type', 'offline');
        authUrl.searchParams.set('prompt', 'consent');
        authUrl.searchParams.set('state', encodedState);

        return new Response(
          JSON.stringify({ authUrl: authUrl.toString() }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'exchange_code': {
        if (!code || !redirectUri) {
          return new Response(
            JSON.stringify({ error: 'code and redirectUri are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Exchange code for tokens
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
          }),
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
          console.error('[Google OAuth] Token exchange error:', tokenData);
          return new Response(
            JSON.stringify({ error: tokenData.error_description || tokenData.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Calculate token expiry
        const tokenExpiry = new Date(Date.now() + (tokenData.expires_in * 1000));

        // Store tokens
        const { error: upsertError } = await supabase
          .from('google_tokens')
          .upsert({
            line_user_id: lineUserId,
            employee_id: employeeId,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_expiry: tokenExpiry.toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'line_user_id' });

        if (upsertError) {
          console.error('[Google OAuth] Token storage error:', upsertError);
          return new Response(
            JSON.stringify({ error: 'Failed to store tokens' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`[Google OAuth] Connected successfully for lineUserId: ${lineUserId}`);

        return new Response(
          JSON.stringify({ success: true, message: 'Google account connected successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'refresh_token': {
        if (!lineUserId) {
          return new Response(
            JSON.stringify({ error: 'lineUserId is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get stored tokens
        const { data: tokenData, error: fetchError } = await supabase
          .from('google_tokens')
          .select('*')
          .eq('line_user_id', lineUserId)
          .single();

        if (fetchError || !tokenData) {
          return new Response(
            JSON.stringify({ error: 'No Google account connected' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Refresh the token
        const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: tokenData.refresh_token,
            grant_type: 'refresh_token',
          }),
        });

        const refreshData = await refreshResponse.json();

        if (refreshData.error) {
          console.error('[Google OAuth] Token refresh error:', refreshData);
          return new Response(
            JSON.stringify({ error: refreshData.error_description || refreshData.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Update stored token
        const newExpiry = new Date(Date.now() + (refreshData.expires_in * 1000));
        await supabase
          .from('google_tokens')
          .update({
            access_token: refreshData.access_token,
            token_expiry: newExpiry.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('line_user_id', lineUserId);

        return new Response(
          JSON.stringify({ 
            success: true, 
            accessToken: refreshData.access_token,
            expiresAt: newExpiry.toISOString()
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'check_connection': {
        if (!lineUserId) {
          return new Response(
            JSON.stringify({ error: 'lineUserId is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: tokenData } = await supabase
          .from('google_tokens')
          .select('id, token_expiry, drive_folder_id, spreadsheet_id, created_at')
          .eq('line_user_id', lineUserId)
          .single();

        if (!tokenData) {
          return new Response(
            JSON.stringify({ connected: false }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const isExpired = new Date(tokenData.token_expiry) < new Date();

        return new Response(
          JSON.stringify({ 
            connected: true,
            isExpired,
            hasDriveFolder: !!tokenData.drive_folder_id,
            hasSpreadsheet: !!tokenData.spreadsheet_id,
            connectedAt: tokenData.created_at
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'disconnect': {
        if (!lineUserId) {
          return new Response(
            JSON.stringify({ error: 'lineUserId is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error: deleteError } = await supabase
          .from('google_tokens')
          .delete()
          .eq('line_user_id', lineUserId);

        if (deleteError) {
          return new Response(
            JSON.stringify({ error: 'Failed to disconnect' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Google account disconnected' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[Google OAuth] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});