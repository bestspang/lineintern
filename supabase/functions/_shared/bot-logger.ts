import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export interface BotLogEntry {
  destinationType: 'group' | 'dm' | 'user_push';
  destinationId: string;
  destinationName?: string;
  groupId?: string;
  recipientUserId?: string;
  recipientEmployeeId?: string;
  messageText: string;
  messageType: 'ai_reply' | 'notification' | 'reminder' | 'summary' | 'warning' | 'system';
  triggeredBy?: 'webhook' | 'cron' | 'manual' | 'postback';
  triggerMessageId?: string;
  commandType?: string;
  edgeFunctionName: string;
  lineMessageId?: string;
  deliveryStatus?: 'sent' | 'failed' | 'pending';
  errorMessage?: string;
}

/**
 * Log a bot message to bot_message_logs table
 * This provides comprehensive tracking of all messages sent by the bot
 */
export async function logBotMessage(entry: BotLogEntry): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('bot_message_logs')
      .insert({
        destination_type: entry.destinationType,
        destination_id: entry.destinationId,
        destination_name: entry.destinationName,
        group_id: entry.groupId,
        recipient_user_id: entry.recipientUserId,
        recipient_employee_id: entry.recipientEmployeeId,
        message_text: entry.messageText,
        message_type: entry.messageType,
        triggered_by: entry.triggeredBy,
        trigger_message_id: entry.triggerMessageId,
        command_type: entry.commandType,
        edge_function_name: entry.edgeFunctionName,
        line_message_id: entry.lineMessageId,
        delivery_status: entry.deliveryStatus || 'sent',
        error_message: entry.errorMessage,
      });

    if (error) {
      console.error('[bot-logger] Failed to log bot message:', error);
    }
  } catch (err) {
    console.error('[bot-logger] Exception while logging bot message:', err);
  }
}
