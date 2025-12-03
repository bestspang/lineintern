import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * LINE Rich Menu Setup Edge Function
 * 
 * Creates a Rich Menu with 6 buttons (3x2 layout):
 * [Check-in] [Check-out] [Day-off]
 * [  Menu  ] [  Help   ] [Status ]
 * 
 * Note: This requires a Rich Menu image to be uploaded separately.
 * Image size must be 2500x1686 or 2500x843 pixels.
 */

interface RichMenuArea {
  bounds: { x: number; y: number; width: number; height: number };
  action: { type: string; text?: string; label?: string };
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

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'create'; // 'create', 'list', 'delete', 'set-default'

    console.log(`[line-richmenu-setup] Action: ${action}`);

    // List existing Rich Menus
    if (action === 'list') {
      const response = await fetch('https://api.line.me/v2/bot/richmenu/list', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
        },
      });

      const data = await response.json();
      console.log('[line-richmenu-setup] Listed Rich Menus:', data);
      
      return new Response(
        JSON.stringify({ success: true, richmenus: data.richmenus || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete a Rich Menu
    if (action === 'delete' && body.richmenu_id) {
      const response = await fetch(`https://api.line.me/v2/bot/richmenu/${body.richmenu_id}`, {
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

      console.log('[line-richmenu-setup] Deleted Rich Menu:', body.richmenu_id);
      return new Response(
        JSON.stringify({ success: true, deleted: body.richmenu_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Set default Rich Menu
    if (action === 'set-default' && body.richmenu_id) {
      const response = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${body.richmenu_id}`, {
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

      console.log('[line-richmenu-setup] Set default Rich Menu:', body.richmenu_id);
      return new Response(
        JSON.stringify({ success: true, default_richmenu_id: body.richmenu_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Rich Menu (6-button layout: 3x2)
    // Image size: 2500x1686 (full) or 2500x843 (half)
    // Using full size for 2 rows
    const richMenuWidth = 2500;
    const richMenuHeight = 1686;
    const cellWidth = Math.floor(richMenuWidth / 3);  // 833
    const cellHeight = Math.floor(richMenuHeight / 2); // 843

    const richMenuAreas: RichMenuArea[] = [
      // Row 1: Check-in, Check-out, Day-off
      {
        bounds: { x: 0, y: 0, width: cellWidth, height: cellHeight },
        action: { type: 'message', text: '/checkin', label: 'Check-in' }
      },
      {
        bounds: { x: cellWidth, y: 0, width: cellWidth, height: cellHeight },
        action: { type: 'message', text: '/checkout', label: 'Check-out' }
      },
      {
        bounds: { x: cellWidth * 2, y: 0, width: richMenuWidth - cellWidth * 2, height: cellHeight },
        action: { type: 'message', text: '/dayoff พรุ่งนี้', label: 'Day-off' }
      },
      // Row 2: Menu, Help, Status
      {
        bounds: { x: 0, y: cellHeight, width: cellWidth, height: richMenuHeight - cellHeight },
        action: { type: 'message', text: '/menu', label: 'Menu' }
      },
      {
        bounds: { x: cellWidth, y: cellHeight, width: cellWidth, height: richMenuHeight - cellHeight },
        action: { type: 'message', text: '/help', label: 'Help' }
      },
      {
        bounds: { x: cellWidth * 2, y: cellHeight, width: richMenuWidth - cellWidth * 2, height: richMenuHeight - cellHeight },
        action: { type: 'message', text: '/status', label: 'Status' }
      },
    ];

    const richMenuObject = {
      size: {
        width: richMenuWidth,
        height: richMenuHeight
      },
      selected: true,  // Show menu by default
      name: 'LINE Intern - Employee Menu',
      chatBarText: 'เมนู / Menu',
      areas: richMenuAreas
    };

    console.log('[line-richmenu-setup] Creating Rich Menu:', richMenuObject);

    // Create the Rich Menu
    const createResponse = await fetch('https://api.line.me/v2/bot/richmenu', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(richMenuObject),
    });

    if (!createResponse.ok) {
      const error = await createResponse.text();
      console.error('[line-richmenu-setup] Error creating Rich Menu:', error);
      return new Response(
        JSON.stringify({ success: false, error }),
        { status: createResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const createData = await createResponse.json();
    const richMenuId = createData.richMenuId;

    console.log('[line-richmenu-setup] Rich Menu created:', richMenuId);

    // Save to database for reference
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    await supabase
      .from('app_settings')
      .upsert({
        id: 'line_richmenu',
        environment_name: richMenuId,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    return new Response(
      JSON.stringify({ 
        success: true, 
        richmenu_id: richMenuId,
        message: 'Rich Menu created. Now upload an image (2500x1686px) using the LINE Official Account Manager or API, then set as default.',
        next_steps: [
          '1. Upload Rich Menu image via LINE Official Account Manager',
          '2. Or call this function with action: "upload-image" and richmenu_id',
          '3. Then call with action: "set-default" and richmenu_id to activate'
        ]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[line-richmenu-setup] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
