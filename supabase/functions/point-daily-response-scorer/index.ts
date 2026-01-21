/**
 * Daily Response Scorer
 * 
 * Calculates average response time for each employee for the day
 * and awards points based on configurable tier thresholds.
 * 
 * Runs daily at 23:00 Bangkok time (16:00 UTC) via cron job.
 * 
 * Idempotency: Checks for existing transactions with reference_type = 'daily_response_score'
 * and metadata->>'date' = today's date to prevent duplicate awards.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBangkokDateString, getBangkokStartOfDay, getBangkokEndOfDay, formatBangkokTime } from "../_shared/timezone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TierConfig {
  max_seconds: number;
  points: number;
  label: string;
}

interface ResponseDailyAvgRule {
  id: string;
  is_active: boolean;
  points: number;
  conditions: {
    tiers?: TierConfig[];
    min_responses?: number;
  };
  notify_enabled?: boolean;
  notify_template?: string;
  notify_destinations?: string[];
}

interface EmployeeResponseStats {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  line_user_id: string | null;
  avg_response_time: number;
  response_count: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Parse request body for optional date override (for manual triggers)
    let targetDate: string;
    try {
      const body = await req.json();
      targetDate = body.date || getBangkokDateString();
    } catch {
      targetDate = getBangkokDateString();
    }

    console.log(`[DailyResponseScorer] Starting for date: ${targetDate}`);

    // Step 1: Fetch the response_daily_avg rule
    const { data: rule, error: ruleError } = await supabase
      .from("point_rules")
      .select("*")
      .eq("rule_key", "response_daily_avg")
      .single();

    if (ruleError || !rule) {
      console.log("[DailyResponseScorer] Rule 'response_daily_avg' not found or error:", ruleError?.message);
      return new Response(
        JSON.stringify({ success: false, reason: "rule_not_found", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typedRule = rule as ResponseDailyAvgRule;

    // Check if rule is active
    if (!typedRule.is_active) {
      console.log("[DailyResponseScorer] Rule is disabled - skipping");
      return new Response(
        JSON.stringify({ success: true, reason: "rule_disabled", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse tier configuration
    const tiers: TierConfig[] = typedRule.conditions?.tiers || [
      { max_seconds: 300, points: 8, label: "perfect" },
      { max_seconds: 600, points: 5, label: "good" },
      { max_seconds: 1800, points: 3, label: "ok" },
      { max_seconds: 999999, points: 1, label: "slow" },
    ];
    const minResponses = typedRule.conditions?.min_responses || 1;

    console.log(`[DailyResponseScorer] Rule config: ${tiers.length} tiers, min_responses=${minResponses}`);

    // Step 2: Get date boundaries in Bangkok timezone
    const startOfDay = getBangkokStartOfDay(targetDate);
    const endOfDay = getBangkokEndOfDay(targetDate);

    console.log(`[DailyResponseScorer] Date range: ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);

    // Step 3: Fetch all active employees with their user IDs (exclude those with exclude_from_points)
    const { data: employees, error: empError } = await supabase
      .from("employees")
      .select("id, full_name, code, line_user_id, exclude_from_points")
      .eq("is_active", true)
      .neq("exclude_from_points", true);

    if (empError || !employees) {
      console.error("[DailyResponseScorer] Error fetching employees:", empError?.message);
      return new Response(
        JSON.stringify({ success: false, reason: "employee_fetch_error", error: empError?.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    console.log(`[DailyResponseScorer] Found ${employees.length} active employees`);

    // Step 4: Get users linked to employees
    const lineUserIds = employees.map(e => e.line_user_id).filter(Boolean);
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, line_user_id")
      .in("line_user_id", lineUserIds);

    if (usersError) {
      console.error("[DailyResponseScorer] Error fetching users:", usersError?.message);
    }

    // Build lookup maps
    const userIdByLineUserId = new Map<string, string>();
    users?.forEach(u => {
      if (u.line_user_id) {
        userIdByLineUserId.set(u.line_user_id, u.id);
      }
    });

    // Step 5: Calculate average response time for each employee
    const employeeStats: EmployeeResponseStats[] = [];

    for (const emp of employees) {
      if (!emp.line_user_id) continue;

      const userId = userIdByLineUserId.get(emp.line_user_id);
      if (!userId) continue;

      // Query messages for this user today with response_time_seconds
      const { data: messages, error: msgError } = await supabase
        .from("messages")
        .select("response_time_seconds")
        .eq("user_id", userId)
        .eq("direction", "human")
        .not("response_time_seconds", "is", null)
        .gte("sent_at", startOfDay.toISOString())
        .lte("sent_at", endOfDay.toISOString());

      if (msgError) {
        console.error(`[DailyResponseScorer] Error fetching messages for ${emp.code}:`, msgError.message);
        continue;
      }

      if (!messages || messages.length < minResponses) {
        console.log(`[DailyResponseScorer] ${emp.code}: ${messages?.length || 0} responses (min: ${minResponses}) - skipping`);
        continue;
      }

      // Calculate average
      const validTimes = messages.map(m => m.response_time_seconds).filter(t => typeof t === 'number');
      if (validTimes.length === 0) continue;

      const avgTime = validTimes.reduce((sum, t) => sum + t, 0) / validTimes.length;

      employeeStats.push({
        employee_id: emp.id,
        employee_name: emp.full_name,
        employee_code: emp.code,
        line_user_id: emp.line_user_id,
        avg_response_time: Math.round(avgTime),
        response_count: validTimes.length,
      });
    }

    console.log(`[DailyResponseScorer] ${employeeStats.length} employees with valid response data`);

    // Step 6: Process each employee
    const results: Array<{
      employee_code: string;
      status: string;
      points?: number;
      tier?: string;
      avg_time?: number;
    }> = [];

    for (const stats of employeeStats) {
      // Idempotency check - check if already awarded for this date
      const { data: existing, error: existingError } = await supabase
        .from("point_transactions")
        .select("id")
        .eq("employee_id", stats.employee_id)
        .eq("category", "response")
        .eq("reference_type", "daily_response_score")
        .filter("metadata->>date", "eq", targetDate)
        .limit(1);

      if (existingError) {
        console.error(`[DailyResponseScorer] Error checking existing for ${stats.employee_code}:`, existingError.message);
        continue;
      }

      if (existing && existing.length > 0) {
        console.log(`[DailyResponseScorer] ${stats.employee_code}: Already awarded for ${targetDate} - skipping`);
        results.push({ employee_code: stats.employee_code, status: "already_awarded" });
        continue;
      }

      // Determine tier based on average response time
      let matchedTier: TierConfig | null = null;
      for (const tier of tiers.sort((a, b) => a.max_seconds - b.max_seconds)) {
        if (stats.avg_response_time <= tier.max_seconds) {
          matchedTier = tier;
          break;
        }
      }

      if (!matchedTier) {
        console.log(`[DailyResponseScorer] ${stats.employee_code}: avg=${stats.avg_response_time}s - no matching tier`);
        results.push({ employee_code: stats.employee_code, status: "no_tier_match", avg_time: stats.avg_response_time });
        continue;
      }

      const pointsToAward = matchedTier.points;

      // Get or create happy_points record
      const { data: happyPoints, error: hpError } = await supabase
        .from("happy_points")
        .select("*")
        .eq("employee_id", stats.employee_id)
        .single();

      if (hpError && hpError.code !== "PGRST116") {
        console.error(`[DailyResponseScorer] Error fetching happy_points for ${stats.employee_code}:`, hpError.message);
        continue;
      }

      let currentBalance = 0;
      let totalEarned = 0;
      let dailyScore = 0;

      if (happyPoints) {
        currentBalance = happyPoints.current_balance || 0;
        totalEarned = happyPoints.total_earned || 0;
        dailyScore = happyPoints.daily_response_score || 0;
      } else {
        // Create happy_points record
        const { error: createError } = await supabase
          .from("happy_points")
          .insert({
            employee_id: stats.employee_id,
            current_balance: 0,
            total_earned: 0,
            total_redeemed: 0,
            daily_response_score: 0,
          });

        if (createError) {
          console.error(`[DailyResponseScorer] Error creating happy_points for ${stats.employee_code}:`, createError.message);
          continue;
        }
      }

      // Insert transaction
      const { error: txError } = await supabase
        .from("point_transactions")
        .insert({
          employee_id: stats.employee_id,
          transaction_type: "earn",
          category: "response",
          amount: pointsToAward,
          balance_after: currentBalance + pointsToAward,
          description: `📊 Daily Response Score (${matchedTier.label}) - avg ${Math.round(stats.avg_response_time)}s`,
          reference_type: "daily_response_score",
          reference_id: `${stats.employee_id}_${targetDate}`,
          metadata: {
            date: targetDate,
            tier: matchedTier.label,
            avg_response_time_seconds: stats.avg_response_time,
            response_count: stats.response_count,
            rule_id: typedRule.id,
          },
        });

      if (txError) {
        console.error(`[DailyResponseScorer] Error inserting transaction for ${stats.employee_code}:`, txError.message);
        continue;
      }

      // Update happy_points
      const { error: updateError } = await supabase
        .from("happy_points")
        .update({
          current_balance: currentBalance + pointsToAward,
          total_earned: totalEarned + pointsToAward,
          daily_response_score: dailyScore + pointsToAward,
          updated_at: new Date().toISOString(),
        })
        .eq("employee_id", stats.employee_id);

      if (updateError) {
        console.error(`[DailyResponseScorer] Error updating happy_points for ${stats.employee_code}:`, updateError.message);
      }

      console.log(`[DailyResponseScorer] ✓ ${stats.employee_code}: +${pointsToAward} pts (${matchedTier.label}, avg=${stats.avg_response_time}s, count=${stats.response_count})`);

      results.push({
        employee_code: stats.employee_code,
        status: "awarded",
        points: pointsToAward,
        tier: matchedTier.label,
        avg_time: stats.avg_response_time,
      });
    }

    const awardedCount = results.filter(r => r.status === "awarded").length;
    const skippedCount = results.filter(r => r.status === "already_awarded").length;
    const noDataCount = employees.length - employeeStats.length;

    console.log(`[DailyResponseScorer] Complete: ${awardedCount} awarded, ${skippedCount} skipped, ${noDataCount} no data`);

    return new Response(
      JSON.stringify({
        success: true,
        date: targetDate,
        processed: results.length,
        awarded: awardedCount,
        skipped: skippedCount,
        no_data: noDataCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[DailyResponseScorer] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
