import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * LINE Rich Menu Link Edge Function
 * 
 * Links/Unlinks a Rich Menu to specific LINE users.
 * Used to assign custom menus to employees.
 */

interface LinkRequest {
  action: 'link' | 'unlink' | 'get';
  line_user_id?: string;      // Single user
  line_user_ids?: string[];   // Multiple users
  richmenu_id?: string;       // Required for link action
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LINE_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    
    if (!LINE_ACCESS_TOKEN) {
      return new Response(
        JSON.stringify({ success: false, error: 'LINE_CHANNEL_ACCESS_TOKEN not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: LinkRequest = await req.json();
    const action = body.action || 'link';

    console.log(`[line-richmenu-link] Action: ${action}`);

    // Get current Rich Menu for a user
    if (action === 'get' && body.line_user_id) {
      const response = await fetch(`https://api.line.me/v2/bot/user/${body.line_user_id}/richmenu`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
        },
      });

      if (response.status === 404) {
        return new Response(
          JSON.stringify({ success: true, richmenu_id: null, message: 'No Rich Menu linked to this user' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!response.ok) {
        const error = await response.text();
        return new Response(
          JSON.stringify({ success: false, error }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      return new Response(
        JSON.stringify({ success: true, richmenu_id: data.richMenuId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Link Rich Menu to user(s)
    if (action === 'link') {
      if (!body.richmenu_id) {
        // Try to get default Rich Menu from app_settings
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { data: settings } = await supabase
          .from('app_settings')
          .select('environment_name')
          .eq('id', 'line_richmenu')
          .maybeSingle();

        if (!settings?.environment_name) {
          return new Response(
            JSON.stringify({ success: false, error: 'No richmenu_id provided and no default found' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        body.richmenu_id = settings.environment_name;
      }

      // Handle multiple users
      const userIds = body.line_user_ids || (body.line_user_id ? [body.line_user_id] : []);
      
      if (userIds.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'No user IDs provided' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Bulk link if multiple users
      if (userIds.length > 1) {
        const response = await fetch(`https://api.line.me/v2/bot/richmenu/${body.richmenu_id}/users`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userIds }),
        });

        if (!response.ok) {
          const error = await response.text();
          return new Response(
            JSON.stringify({ success: false, error }),
            { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`[line-richmenu-link] Linked Rich Menu to ${userIds.length} users`);
        return new Response(
          JSON.stringify({ success: true, linked_users: userIds.length, richmenu_id: body.richmenu_id }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Single user link
      const response = await fetch(`https://api.line.me/v2/bot/user/${userIds[0]}/richmenu/${body.richmenu_id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        return new Response(
          JSON.stringify({ success: false, error }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[line-richmenu-link] Linked Rich Menu ${body.richmenu_id} to user ${userIds[0]}`);
      return new Response(
        JSON.stringify({ success: true, line_user_id: userIds[0], richmenu_id: body.richmenu_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Unlink Rich Menu from user(s)
    if (action === 'unlink') {
      const userIds = body.line_user_ids || (body.line_user_id ? [body.line_user_id] : []);
      
      if (userIds.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'No user IDs provided' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Bulk unlink if multiple users
      if (userIds.length > 1) {
        const response = await fetch('https://api.line.me/v2/bot/richmenu/bulk/unlink', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userIds }),
        });

        if (!response.ok) {
          const error = await response.text();
          return new Response(
            JSON.stringify({ success: false, error }),
            { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`[line-richmenu-link] Unlinked Rich Menu from ${userIds.length} users`);
        return new Response(
          JSON.stringify({ success: true, unlinked_users: userIds.length }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Single user unlink
      const response = await fetch(`https://api.line.me/v2/bot/user/${userIds[0]}/richmenu`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        return new Response(
          JSON.stringify({ success: false, error }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[line-richmenu-link] Unlinked Rich Menu from user ${userIds[0]}`);
      return new Response(
        JSON.stringify({ success: true, unlinked_user: userIds[0] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[line-richmenu-link] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
