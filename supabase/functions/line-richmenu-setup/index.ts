import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * LINE Rich Menu Setup Edge Function
 * 
 * Creates a Rich Menu with 6 equal-sized buttons layout (3x2 grid):
 * Row 1: [✓ เช็คอิน/เอาท์] [🕐 สถานะ] [≡ เมนู]
 * Row 2: [📅 ลางาน] [+ ขอ OT] [? ช่วยเหลือ]
 * 
 * Actions:
 * - create: Create Rich Menu structure
 * - upload-image: Upload image to Rich Menu
 * - set-default: Set as default Rich Menu
 * - create-full: Do all above in one call
 * - list: List all Rich Menus
 * - delete: Delete a Rich Menu
 * 
 * Image size must be 2500x1686 pixels.
 */

interface RichMenuArea {
  bounds: { x: number; y: number; width: number; height: number };
  action: { type: string; text?: string; label?: string; uri?: string };
}

// Helper function to get LIFF ID from env or database
async function getLiffId(): Promise<string> {
  // Try env first
  const envLiffId = Deno.env.get('LIFF_ID');
  if (envLiffId) {
    console.log('[line-richmenu-setup] Using LIFF_ID from environment');
    return envLiffId;
  }

  // Fallback to database
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data } = await supabase
      .from('api_configurations')
      .select('key_value')
      .eq('key_name', 'LIFF_ID')
      .maybeSingle();

    if (data?.key_value) {
      console.log('[line-richmenu-setup] Using LIFF_ID from database');
      return data.key_value;
    }
  } catch (error) {
    console.error('[line-richmenu-setup] Error fetching LIFF_ID from database:', error);
  }

  console.log('[line-richmenu-setup] No LIFF_ID found, buttons will use message actions');
  return '';
}

// Helper function to create Rich Menu structure
async function createRichMenuStructure(lineAccessToken: string, liffId: string): Promise<{ success: boolean; richMenuId?: string; error?: string }> {
  // 6 equal-sized buttons: 3 columns x 2 rows
  const richMenuWidth = 2500;
  const richMenuHeight = 1686;
  const colWidth = Math.floor(richMenuWidth / 3); // 833px per column
  const rowHeight = Math.floor(richMenuHeight / 2); // 843px per row

  const liffBaseUrl = liffId ? `https://liff.line.me/${liffId}` : '';

  const richMenuAreas: RichMenuArea[] = [
    // Row 1: เช็คอิน/เอาท์, สถานะ, เมนู
    {
      bounds: { x: 0, y: 0, width: colWidth, height: rowHeight },
      action: liffBaseUrl 
        ? { type: 'uri', uri: `${liffBaseUrl}/portal/checkin`, label: 'เช็คอิน/เอาท์' }
        : { type: 'message', text: '/checkin', label: 'เช็คอิน/เอาท์' }
    },
    {
      bounds: { x: colWidth, y: 0, width: colWidth, height: rowHeight },
      action: { type: 'message', text: '/status', label: 'สถานะ' }
    },
    {
      bounds: { x: colWidth * 2, y: 0, width: richMenuWidth - (colWidth * 2), height: rowHeight },
      action: liffBaseUrl
        ? { type: 'uri', uri: `${liffBaseUrl}/portal`, label: 'เมนู' }
        : { type: 'message', text: '/menu', label: 'เมนู' }
    },
    // Row 2: ลางาน, ขอ OT, ช่วยเหลือ
    {
      bounds: { x: 0, y: rowHeight, width: colWidth, height: richMenuHeight - rowHeight },
      action: liffBaseUrl
        ? { type: 'uri', uri: `${liffBaseUrl}/portal/request-leave`, label: 'ลางาน' }
        : { type: 'message', text: '/dayoff พรุ่งนี้', label: 'ลางาน' }
    },
    {
      bounds: { x: colWidth, y: rowHeight, width: colWidth, height: richMenuHeight - rowHeight },
      action: liffBaseUrl
        ? { type: 'uri', uri: `${liffBaseUrl}/portal/request-ot`, label: 'ขอ OT' }
        : { type: 'message', text: '/ot', label: 'ขอ OT' }
    },
    {
      bounds: { x: colWidth * 2, y: rowHeight, width: richMenuWidth - (colWidth * 2), height: richMenuHeight - rowHeight },
      action: { type: 'message', text: '/help', label: 'ช่วยเหลือ' }
    },
  ];

  const richMenuObject = {
    size: {
      width: richMenuWidth,
      height: richMenuHeight
    },
    selected: true,
    name: 'LINE Intern - Employee Menu v3',
    chatBarText: 'เมนู / Menu',
    areas: richMenuAreas
  };

  console.log('[line-richmenu-setup] Creating Rich Menu:', JSON.stringify(richMenuObject, null, 2));

  const createResponse = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lineAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(richMenuObject),
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error('[line-richmenu-setup] Error creating Rich Menu:', error);
    return { success: false, error };
  }

  const createData = await createResponse.json();
  console.log('[line-richmenu-setup] Rich Menu created:', createData.richMenuId);
  return { success: true, richMenuId: createData.richMenuId };
}

// Helper function to upload image to Rich Menu
async function uploadRichMenuImage(lineAccessToken: string, richMenuId: string, imageUrl: string): Promise<{ success: boolean; error?: string }> {
  console.log(`[line-richmenu-setup] Fetching image from: ${imageUrl}`);
  
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    return { success: false, error: `Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}` };
  }

  const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
  const imageBuffer = await imageResponse.arrayBuffer();
  
  console.log(`[line-richmenu-setup] Uploading image (${imageBuffer.byteLength} bytes, ${contentType}) to Rich Menu: ${richMenuId}`);

  const uploadResponse = await fetch(
    `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lineAccessToken}`,
        'Content-Type': contentType.includes('png') ? 'image/png' : 'image/jpeg',
      },
      body: imageBuffer,
    }
  );

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    console.error('[line-richmenu-setup] Error uploading image:', error);
    return { success: false, error };
  }

  console.log('[line-richmenu-setup] Image uploaded successfully');
  return { success: true };
}

// Helper function to set default Rich Menu
async function setDefaultRichMenu(lineAccessToken: string, richMenuId: string): Promise<{ success: boolean; error?: string }> {
  const response = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lineAccessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[line-richmenu-setup] Error setting default:', error);
    return { success: false, error };
  }

  console.log('[line-richmenu-setup] Set default Rich Menu:', richMenuId);
  return { success: true };
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
    const action = body.action || 'create';

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
      const result = await setDefaultRichMenu(LINE_ACCESS_TOKEN, body.richmenu_id);
      
      if (!result.success) {
        return new Response(
          JSON.stringify({ success: false, error: result.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, default_richmenu_id: body.richmenu_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upload Rich Menu image
    if (action === 'upload-image') {
      if (!body.richmenu_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'richmenu_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!body.image_url) {
        return new Response(
          JSON.stringify({ success: false, error: 'image_url is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const result = await uploadRichMenuImage(LINE_ACCESS_TOKEN, body.richmenu_id, body.image_url);
      
      if (!result.success) {
        return new Response(
          JSON.stringify({ success: false, error: result.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          richmenu_id: body.richmenu_id,
          message: 'Rich Menu image uploaded successfully'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Full: Create + Upload Image + Set Default
    if (action === 'create-full') {
      if (!body.image_url) {
        return new Response(
          JSON.stringify({ success: false, error: 'image_url is required for create-full action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const liffId = await getLiffId();
      console.log('[line-richmenu-setup] Using LIFF_ID:', liffId ? liffId.substring(0, 10) + '...' : 'none');
      
      // Step 1: Create Rich Menu
      console.log('[line-richmenu-setup] Step 1: Creating Rich Menu structure...');
      const createResult = await createRichMenuStructure(LINE_ACCESS_TOKEN, liffId);
      if (!createResult.success || !createResult.richMenuId) {
        return new Response(
          JSON.stringify({ success: false, error: createResult.error, step: 'create' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Step 2: Upload Image
      console.log('[line-richmenu-setup] Step 2: Uploading image...');
      const uploadResult = await uploadRichMenuImage(LINE_ACCESS_TOKEN, createResult.richMenuId, body.image_url);
      if (!uploadResult.success) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: uploadResult.error, 
            step: 'upload-image',
            richmenu_id: createResult.richMenuId,
            message: 'Rich Menu created but image upload failed. You can retry with action: "upload-image"'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Step 3: Set as Default
      console.log('[line-richmenu-setup] Step 3: Setting as default...');
      const setDefaultResult = await setDefaultRichMenu(LINE_ACCESS_TOKEN, createResult.richMenuId);
      if (!setDefaultResult.success) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: setDefaultResult.error, 
            step: 'set-default',
            richmenu_id: createResult.richMenuId,
            message: 'Rich Menu created and image uploaded but failed to set as default. You can retry with action: "set-default"'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Save to database for reference
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      await supabase
        .from('app_settings')
        .upsert({
          id: 'line_richmenu',
          environment_name: createResult.richMenuId,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

      return new Response(
        JSON.stringify({ 
          success: true, 
          richmenu_id: createResult.richMenuId,
          message: 'Rich Menu created, image uploaded, and set as default successfully!'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Rich Menu (structure only)
    if (action === 'create') {
      const liffId = await getLiffId();
      console.log('[line-richmenu-setup] Using LIFF_ID:', liffId ? liffId.substring(0, 10) + '...' : 'none');
      const createResult = await createRichMenuStructure(LINE_ACCESS_TOKEN, liffId);
      
      if (!createResult.success || !createResult.richMenuId) {
        return new Response(
          JSON.stringify({ success: false, error: createResult.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Save to database for reference
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      await supabase
        .from('app_settings')
        .upsert({
          id: 'line_richmenu',
          environment_name: createResult.richMenuId,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

      return new Response(
        JSON.stringify({ 
          success: true, 
          richmenu_id: createResult.richMenuId,
          message: 'Rich Menu created. Now upload an image (2500x1686px) and set as default.',
          next_steps: [
            `1. Upload image: {"action": "upload-image", "richmenu_id": "${createResult.richMenuId}", "image_url": "YOUR_IMAGE_URL"}`,
            `2. Set default: {"action": "set-default", "richmenu_id": "${createResult.richMenuId}"}`,
            'Or use {"action": "create-full", "image_url": "YOUR_IMAGE_URL"} to do everything at once'
          ]
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Invalid action',
        available_actions: ['create', 'upload-image', 'set-default', 'create-full', 'list', 'delete']
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
