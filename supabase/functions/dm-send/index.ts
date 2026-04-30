import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole, authzErrorResponse } from "../_shared/authz.ts";
import { writeAuditLog, maskLineUserId } from "../_shared/audit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let callerUserId: string | null = null;
  let callerRoleLabel: string | null = null;

  try {
    // Phase 0A guard: only management roles can send LINE DMs from the admin UI.
    try {
      const result = await requireRole(
        req,
        ['admin', 'owner', 'hr', 'manager', 'moderator'],
        { functionName: 'dm-send' },
      );
      callerUserId = result.userId;
      callerRoleLabel = result.role;
    } catch (e) {
      const r = authzErrorResponse(e, corsHeaders);
      if (r) return r;
      throw e;
    }

    const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LINE_CHANNEL_ACCESS_TOKEN) {
      throw new Error('LINE_CHANNEL_ACCESS_TOKEN not configured');
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { line_user_id, message, group_id } = await req.json();

    // Validate required fields
    if (!line_user_id || !message || !group_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: line_user_id, message, group_id' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Sending DM to ${line_user_id}: ${message.substring(0, 50)}...`);

    // 1. Send message via LINE Push API
    const lineResponse = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: line_user_id,
        messages: [{
          type: 'text',
          text: message,
        }],
      }),
    });

    const lineResponseText = await lineResponse.text();
    
    if (!lineResponse.ok) {
      console.error('LINE API error:', lineResponseText);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to send LINE message',
          details: lineResponseText
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('LINE message sent successfully');

    // 2. Save message to database
    const { data: insertedMessage, error: dbError } = await supabase
      .from('messages')
      .insert({
        group_id,
        direction: 'admin_reply',
        text: message,
        sent_at: new Date().toISOString(),
        command_type: 'admin_dm',
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      // Still return success since LINE message was sent
      return new Response(
        JSON.stringify({ 
          success: true, 
          warning: 'Message sent but failed to save to database',
          line_sent: true,
          db_saved: false
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Message saved to database:', insertedMessage?.id);

    // Phase 0A.1 — structured audit log (best-effort).
    await writeAuditLog(supabase, {
      functionName: 'dm-send',
      actionType: 'send',
      resourceType: 'dm',
      resourceId: group_id,
      performedByUserId: callerUserId,
      callerRole: callerRoleLabel,
      metadata: {
        line_user_id_masked: maskLineUserId(line_user_id),
        group_id,
        char_count: typeof message === 'string' ? message.length : 0,
        message_id: insertedMessage?.id ?? null,
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message_id: insertedMessage?.id,
        line_sent: true,
        db_saved: true
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: unknown) {
    console.error('dm-send error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
