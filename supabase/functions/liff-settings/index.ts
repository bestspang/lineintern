import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LiffAppView {
  type: 'full' | 'tall' | 'compact';
  url: string;
}

interface LiffAppInfo {
  liffId: string;
  view: LiffAppView;
  description?: string;
  features?: {
    ble?: boolean;
    qrCode?: boolean;
  };
}

/**
 * Get LINE Login Channel Access Token using client credentials
 */
async function getAccessToken(channelId: string, channelSecret: string): Promise<string> {
  const response = await fetch('https://api.line.me/oauth2/v3/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: channelId,
      client_secret: channelSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to get access token:', errorText);
    throw new Error(`Failed to get LINE access token: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Get LIFF App info
 */
async function getLiffApp(accessToken: string, liffId: string): Promise<LiffAppInfo | null> {
  // First, list all LIFF apps to find the one with matching ID
  const response = await fetch('https://api.line.me/liff/v1/apps', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to get LIFF apps:', errorText);
    throw new Error(`Failed to get LIFF apps: ${response.status}`);
  }

  const data = await response.json();
  const apps: LiffAppInfo[] = data.apps || [];
  
  // Find the app with matching LIFF ID
  const app = apps.find((a: LiffAppInfo) => a.liffId === liffId);
  return app || null;
}

/**
 * Update LIFF App endpoint URL
 */
async function updateLiffEndpoint(accessToken: string, liffId: string, endpointUrl: string): Promise<void> {
  const response = await fetch(`https://api.line.me/liff/v1/apps/${liffId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      view: {
        url: endpointUrl,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to update LIFF app:', errorText);
    throw new Error(`Failed to update LIFF endpoint: ${response.status} - ${errorText}`);
  }
}

/**
 * Validate endpoint URL
 */
function validateEndpointUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);
    
    // Must be HTTPS
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'URL must use HTTPS protocol' };
    }
    
    // Must not have fragment
    if (parsed.hash) {
      return { valid: false, error: 'URL must not contain fragment (#)' };
    }
    
    // Remove trailing slash for consistency check
    const cleanUrl = url.replace(/\/$/, '');
    
    return { valid: true };
  } catch (e) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get LINE Login credentials from api_configurations
    const { data: configs, error: configError } = await supabase
      .from('api_configurations')
      .select('key_name, key_value')
      .in('key_name', ['LINE_LOGIN_CHANNEL_ID', 'LINE_LOGIN_CHANNEL_SECRET', 'LIFF_ID']);

    if (configError) {
      throw new Error(`Failed to fetch config: ${configError.message}`);
    }

    const configMap: Record<string, string> = {};
    configs?.forEach(c => {
      if (c.key_value) configMap[c.key_name] = c.key_value;
    });

    const channelId = configMap['LINE_LOGIN_CHANNEL_ID'];
    const channelSecret = configMap['LINE_LOGIN_CHANNEL_SECRET'];
    const liffId = configMap['LIFF_ID'];

    // Check for missing credentials
    const missingCredentials: string[] = [];
    if (!channelId) missingCredentials.push('LINE_LOGIN_CHANNEL_ID');
    if (!channelSecret) missingCredentials.push('LINE_LOGIN_CHANNEL_SECRET');
    if (!liffId) missingCredentials.push('LIFF_ID');

    if (missingCredentials.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'missing_credentials',
          message: `กรุณาตั้งค่า ${missingCredentials.join(', ')} ใน API Keys ก่อน`,
          missing: missingCredentials,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get access token
    console.log('Getting LINE access token...');
    const accessToken = await getAccessToken(channelId, channelSecret);
    console.log('Got access token successfully');

    switch (action) {
      case 'get': {
        // Get LIFF app info
        const app = await getLiffApp(accessToken, liffId);
        
        if (!app) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'liff_not_found',
              message: `ไม่พบ LIFF App ID: ${liffId}`,
              liffId,
            }),
            {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            liffId: app.liffId,
            endpointUrl: app.view.url,
            viewType: app.view.type,
            description: app.description,
            features: app.features,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      case 'update-endpoint': {
        // Parse request body
        const body = await req.json();
        const { endpointUrl } = body;

        if (!endpointUrl) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'missing_endpoint',
              message: 'กรุณาระบุ Endpoint URL',
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        // Validate URL
        const validation = validateEndpointUrl(endpointUrl);
        if (!validation.valid) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'invalid_url',
              message: validation.error,
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        // Update LIFF endpoint
        await updateLiffEndpoint(accessToken, liffId, endpointUrl);

        // Log the update
        console.log(`Updated LIFF ${liffId} endpoint to: ${endpointUrl}`);

        // Save to system_settings for reference
        await supabase
          .from('system_settings')
          .upsert({
            setting_key: 'liff_endpoint',
            setting_value: {
              liff_id: liffId,
              endpoint_url: endpointUrl,
              updated_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          }, { onConflict: 'setting_key' });

        return new Response(
          JSON.stringify({
            success: true,
            message: `อัพเดท Endpoint URL เป็น ${endpointUrl} สำเร็จ`,
            liffId,
            endpointUrl,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      case 'list': {
        // List all LIFF apps
        const response = await fetch('https://api.line.me/liff/v1/apps', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to list LIFF apps: ${response.status}`);
        }

        const data = await response.json();

        return new Response(
          JSON.stringify({
            success: true,
            apps: data.apps || [],
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      default:
        return new Response(
          JSON.stringify({
            success: false,
            error: 'invalid_action',
            message: 'Invalid action. Use: get, update-endpoint, or list',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
    }
  } catch (error: any) {
    console.error('LIFF Settings error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'server_error',
        message: error.message || 'An error occurred',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
