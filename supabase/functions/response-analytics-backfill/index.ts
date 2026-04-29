/**
 * Response Analytics Backfill Edge Function
 * 
 * SCHEMA REFERENCE - DO NOT CHANGE:
 * - messages.direction: 'human' | 'bot' (NOT 'incoming')
 * - messages.is_within_work_hours: boolean
 * - messages.response_time_seconds: number
 * - messages.reply_to_message_id: uuid
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBangkokNow, getBangkokDateString } from "../_shared/timezone.ts";
import { requireRole, authzErrorResponse } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Check if timestamp is within working hours (8:00-18:00 Bangkok, Mon-Fri, excluding holidays)
function isWithinWorkingHours(
  timestamp: Date,
  holidays: Set<string>
): boolean {
  // Convert to Bangkok time
  const bangkokTime = new Date(timestamp.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const hours = bangkokTime.getHours();
  const dayOfWeek = bangkokTime.getDay();
  
  // Check weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  
  // Check holiday
  // ⚠️ TIMEZONE: Use Bangkok date string format
  const dateStr = getBangkokDateString(bangkokTime);
  if (holidays.has(dateStr)) {
    return false;
  }
  
  // Check working hours (8:00-18:00)
  return hours >= 8 && hours < 18;
}

// Detect if a message is a reply to another message
function detectReplyContext(
  currentMessage: any,
  recentMessages: any[]
): { replyToId: string; responseTimeSeconds: number } | null {
  if (!currentMessage.user_id || !currentMessage.sent_at) return null;
  
  const currentTime = new Date(currentMessage.sent_at).getTime();
  const thirtyMinutesMs = 30 * 60 * 1000;
  
  // Find the most recent message from a different user within 30 minutes
  for (const msg of recentMessages) {
    if (!msg.user_id || msg.user_id === currentMessage.user_id) continue;
    
    const msgTime = new Date(msg.sent_at).getTime();
    const timeDiff = currentTime - msgTime;
    
    // Must be before current message and within 30 minutes
    if (timeDiff > 0 && timeDiff <= thirtyMinutesMs) {
      return {
        replyToId: msg.id,
        responseTimeSeconds: Math.round(timeDiff / 1000),
      };
    }
  }
  
  return null;
}

// Batch update helper - process updates in chunks
async function batchUpdate(
  supabase: any,
  updates: Array<{ id: string; updates: any }>,
  chunkSize: number = 25
): Promise<{ success: number; errors: number }> {
  let success = 0;
  let errors = 0;
  
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    
    // Process chunk in parallel
    const results = await Promise.allSettled(
      chunk.map(update =>
        supabase
          .from("messages")
          .update(update.updates)
          .eq("id", update.id)
      )
    );
    
    for (const result of results) {
      if (result.status === "fulfilled" && !result.value.error) {
        success++;
      } else {
        errors++;
      }
    }
  }
  
  return { success, errors };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const { 
      startDate, 
      endDate, 
      groupId, 
      userId,
      dryRun = false,
      batchSize = 500,
      cursor // For pagination
    } = body;

    const now = getBangkokNow();
    const defaultStartDate = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000); // 3 weeks ago
    
    const start = startDate || getBangkokDateString(defaultStartDate);
    const end = endDate || getBangkokDateString(now);

    console.log(`[response-analytics-backfill] Starting backfill from ${start} to ${end}`);
    console.log(`[response-analytics-backfill] GroupId: ${groupId || "all"}, UserId: ${userId || "all"}, DryRun: ${dryRun}`);

    // 1. Fetch holidays for the date range
    const { data: holidaysData } = await supabase
      .from("holidays")
      .select("date")
      .gte("date", start)
      .lte("date", end);
    
    const holidays = new Set((holidaysData || []).map((h: any) => h.date));
    console.log(`[response-analytics-backfill] Found ${holidays.size} holidays in range`);

    // 2. Fetch messages with pagination
    let query = supabase
      .from("messages")
      .select("id, user_id, group_id, sent_at, text, direction, response_time_seconds, reply_to_message_id, is_within_work_hours")
      .eq("direction", "human") // CORRECT: use 'human' not 'incoming'
      .gte("sent_at", `${start}T00:00:00+07:00`)
      .lte("sent_at", `${end}T23:59:59+07:00`)
      .order("sent_at", { ascending: true })
      .limit(batchSize);

    if (groupId) {
      query = query.eq("group_id", groupId);
    }
    if (userId) {
      query = query.eq("user_id", userId);
    }
    if (cursor) {
      query = query.gt("sent_at", cursor);
    }

    const { data: messages, error: msgError } = await query;

    if (msgError) {
      throw new Error(`Failed to fetch messages: ${msgError.message}`);
    }

    const messageCount = messages?.length || 0;
    console.log(`[response-analytics-backfill] Processing ${messageCount} messages`);

    const stats = {
      processed: 0,
      updatedWorkHours: 0,
      updatedResponseTime: 0,
      skipped: 0,
      errors: 0,
    };

    // Group messages by group_id for efficient reply detection
    const messagesByGroup: Record<string, any[]> = {};
    for (const msg of messages || []) {
      if (!messagesByGroup[msg.group_id]) {
        messagesByGroup[msg.group_id] = [];
      }
      messagesByGroup[msg.group_id].push(msg);
    }

    // 3. Process each message (synchronously to avoid race conditions)
    const updates: Array<{ id: string; updates: any }> = [];

    for (const [gId, groupMessages] of Object.entries(messagesByGroup)) {
      // Sort by sent_at
      groupMessages.sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());

      for (let i = 0; i < groupMessages.length; i++) {
        const msg = groupMessages[i];
        stats.processed++;

        const msgUpdates: any = {};
        const sentAt = new Date(msg.sent_at);

        // Update is_within_work_hours (no async needed now)
        const isWorkHours = isWithinWorkingHours(sentAt, holidays);
        if (msg.is_within_work_hours !== isWorkHours) {
          msgUpdates.is_within_work_hours = isWorkHours;
          stats.updatedWorkHours++;
        }

        // Detect and update response time if not already set
        if (!msg.response_time_seconds && !msg.reply_to_message_id) {
          const recentMessages = groupMessages.slice(Math.max(0, i - 50), i).reverse();
          const replyContext = detectReplyContext(msg, recentMessages);
          
          if (replyContext) {
            msgUpdates.reply_to_message_id = replyContext.replyToId;
            msgUpdates.response_time_seconds = replyContext.responseTimeSeconds;
            stats.updatedResponseTime++;
          }
        }

        if (Object.keys(msgUpdates).length > 0) {
          updates.push({ id: msg.id, updates: msgUpdates });
        } else {
          stats.skipped++;
        }
      }
    }

    // 4. Apply updates in batches (if not dry run)
    if (!dryRun && updates.length > 0) {
      console.log(`[response-analytics-backfill] Applying ${updates.length} updates in batches...`);
      
      const batchResult = await batchUpdate(supabase, updates, 25);
      stats.errors = batchResult.errors;
      
      console.log(`[response-analytics-backfill] Batch update complete: ${batchResult.success} success, ${batchResult.errors} errors`);
    }

    // 5. Aggregate response analytics by user/group/date
    if (!dryRun && updates.length > 0) {
      console.log(`[response-analytics-backfill] Aggregating response analytics...`);
      
      // Get updated messages for aggregation (with pagination for large datasets)
      let allUpdatedMessages: any[] = [];
      let aggCursor: string | null = null;
      const aggBatchSize = 1000;
      
      do {
        let aggQuery = supabase
          .from("messages")
          .select("user_id, group_id, sent_at, response_time_seconds, is_within_work_hours, direction")
          .eq("direction", "human")
          .gte("sent_at", `${start}T00:00:00+07:00`)
          .lte("sent_at", `${end}T23:59:59+07:00`)
          .order("sent_at", { ascending: true })
          .limit(aggBatchSize);
        
        if (aggCursor) {
          aggQuery = aggQuery.gt("sent_at", aggCursor);
        }
        
        const { data: batchMessages } = await aggQuery;
        
        if (batchMessages && batchMessages.length > 0) {
          allUpdatedMessages = allUpdatedMessages.concat(batchMessages);
          aggCursor = batchMessages[batchMessages.length - 1].sent_at;
        } else {
          aggCursor = null;
        }
      } while (aggCursor && allUpdatedMessages.length < 5000); // Cap at 5000 for safety

      // Group by user, group, and date
      const aggregations: Record<string, any> = {};

      for (const msg of allUpdatedMessages) {
        if (!msg.user_id || !msg.group_id) continue;
        
        // ⚠️ TIMEZONE: Use Bangkok date string format
        const dateStr = getBangkokDateString(new Date(msg.sent_at));
        const key = `${msg.user_id}|${msg.group_id}|${dateStr}`;

        if (!aggregations[key]) {
          aggregations[key] = {
            user_id: msg.user_id,
            group_id: msg.group_id,
            date: dateStr,
            total_messages_sent: 0,
            total_replies_received: 0,
            response_times: [],
            work_hours_response_times: [],
            outside_hours_response_times: [],
            messages_during_work_hours: 0,
            messages_outside_work_hours: 0,
          };
        }

        aggregations[key].total_messages_sent++;
        
        if (msg.is_within_work_hours) {
          aggregations[key].messages_during_work_hours++;
        } else {
          aggregations[key].messages_outside_work_hours++;
        }

        if (msg.response_time_seconds) {
          aggregations[key].total_replies_received++;
          aggregations[key].response_times.push(msg.response_time_seconds);
          
          if (msg.is_within_work_hours) {
            aggregations[key].work_hours_response_times.push(msg.response_time_seconds);
          } else {
            aggregations[key].outside_hours_response_times.push(msg.response_time_seconds);
          }
        }
      }

      // Batch upsert aggregations
      const aggregationRecords = Object.values(aggregations).map((agg: any) => {
        const responseTimes = agg.response_times;
        const workTimes = agg.work_hours_response_times;
        const outsideTimes = agg.outside_hours_response_times;
        
        const avgResponseTime = responseTimes.length > 0
          ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length)
          : null;
        const avgWorkHoursTime = workTimes.length > 0
          ? Math.round(workTimes.reduce((a: number, b: number) => a + b, 0) / workTimes.length)
          : null;
        const avgOutsideHoursTime = outsideTimes.length > 0
          ? Math.round(outsideTimes.reduce((a: number, b: number) => a + b, 0) / outsideTimes.length)
          : null;

        // Calculate ghost score
        const ghostScore = agg.total_messages_sent > 0
          ? Math.round((1 - (agg.total_replies_received / agg.total_messages_sent)) * 0.6 * 100) / 100
          : 0;

        return {
          user_id: agg.user_id,
          group_id: agg.group_id,
          date: agg.date,
          total_messages_sent: agg.total_messages_sent,
          total_replies_received: agg.total_replies_received,
          avg_response_time_seconds: avgResponseTime,
          avg_response_time_work_hours: avgWorkHoursTime,
          avg_response_time_outside_hours: avgOutsideHoursTime,
          messages_during_work_hours: agg.messages_during_work_hours,
          messages_outside_work_hours: agg.messages_outside_work_hours,
          ghost_score: ghostScore,
          updated_at: new Date().toISOString(),
        };
      });

      // Upsert in batches of 50
      let aggregatedCount = 0;
      for (let i = 0; i < aggregationRecords.length; i += 50) {
        const batch = aggregationRecords.slice(i, i + 50);
        const { error: upsertError } = await supabase
          .from("response_analytics")
          .upsert(batch, { onConflict: "user_id,group_id,date" });
        
        if (!upsertError) {
          aggregatedCount += batch.length;
        }
      }

      console.log(`[response-analytics-backfill] Aggregated ${aggregatedCount} records`);
    }

    // Determine if there are more messages to process
    const hasMore = messageCount === batchSize;
    const nextCursor = hasMore && messages?.length ? messages[messages.length - 1].sent_at : null;

    const result = {
      success: true,
      dryRun,
      dateRange: { start, end },
      stats,
      updatesCount: updates.length,
      hasMore,
      nextCursor,
      message: dryRun
        ? `Dry run complete. Would update ${updates.length} messages.`
        : `Backfill complete. Updated ${updates.length} messages.`,
    };

    console.log(`[response-analytics-backfill] Complete:`, result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[response-analytics-backfill] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
