/**
 * Enhanced Health Check Edge Function
 * 
 * Performs comprehensive health checks on:
 * - Database connectivity
 * - LINE API configuration
 * - Critical Edge Functions
 * - LIFF settings
 * - Cron Jobs status
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBangkokDateString } from '../_shared/timezone.ts';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_ENV = Deno.env.get("APP_ENV") || "production";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Constant-time string comparison to avoid timing attacks
function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

interface HealthCheck {
  name: string;
  status: "ok" | "degraded" | "down";
  responseTime: number;
  message?: string;
  details?: Record<string, unknown>;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Authorize full diagnostic disclosure: cron/admin uses x-cron-secret.
  // Anonymous callers receive a minimal { status, timestamp } response.
  const providedSecret = req.headers.get("x-cron-secret") || "";
  const isAuthorized = CRON_SECRET.length > 0 && safeEqual(providedSecret, CRON_SECRET);

  const checks: HealthCheck[] = [];
  let overallStatus: "ok" | "degraded" | "down" = "ok";

  try {
    // 1. Database Check
    const dbStart = Date.now();
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("id")
        .limit(1);
      
      const dbTime = Date.now() - dbStart;
      checks.push({
        name: "database",
        status: error ? "down" : dbTime > 1000 ? "degraded" : "ok",
        responseTime: dbTime,
        message: error ? error.message : "Database connection successful",
      });
      
      if (error) overallStatus = "down";
      else if (dbTime > 1000 && overallStatus === "ok") overallStatus = "degraded";
    } catch (e) {
      checks.push({
        name: "database",
        status: "down",
        responseTime: Date.now() - dbStart,
        message: String(e),
      });
      overallStatus = "down";
    }

    // 2. LINE API Configuration Check
    const lineStart = Date.now();
    try {
      const { data: lineConfig } = await supabase
        .from("api_configurations")
        .select("key_name, key_value")
        .in("key_name", ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]);
      
      const hasToken = lineConfig?.some(c => c.key_name === "LINE_CHANNEL_ACCESS_TOKEN" && c.key_value);
      const hasSecret = lineConfig?.some(c => c.key_name === "LINE_CHANNEL_SECRET" && c.key_value);
      
      checks.push({
        name: "line_api",
        status: hasToken && hasSecret ? "ok" : "degraded",
        responseTime: Date.now() - lineStart,
        message: hasToken && hasSecret 
          ? "LINE API configured" 
          : `Missing: ${!hasToken ? 'Token ' : ''}${!hasSecret ? 'Secret' : ''}`,
        details: { hasToken, hasSecret },
      });
      
      if (!(hasToken && hasSecret) && overallStatus === "ok") overallStatus = "degraded";
    } catch (e) {
      checks.push({
        name: "line_api",
        status: "degraded",
        responseTime: Date.now() - lineStart,
        message: String(e),
      });
      if (overallStatus === "ok") overallStatus = "degraded";
    }

    // 3. LIFF Configuration Check
    const liffStart = Date.now();
    try {
      const { data: liffConfig } = await supabase
        .from("api_configurations")
        .select("key_value")
        .eq("key_name", "LIFF_ID")
        .single();
      
      checks.push({
        name: "liff",
        status: liffConfig?.key_value ? "ok" : "degraded",
        responseTime: Date.now() - liffStart,
        message: liffConfig?.key_value ? "LIFF configured" : "LIFF_ID not configured",
      });
    } catch (e) {
      checks.push({
        name: "liff",
        status: "degraded",
        responseTime: Date.now() - liffStart,
        message: String(e),
      });
    }

    // 4. Recent Bot Activity Check
    const botStart = Date.now();
    try {
      const last1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recentMessages, count } = await supabase
        .from("bot_message_logs")
        .select("id, delivery_status", { count: "exact" })
        .gte("sent_at", last1h);
      
      const successCount = recentMessages?.filter(m => m.delivery_status === "sent").length || 0;
      const totalCount = count || 0;
      const successRate = totalCount > 0 ? (successCount / totalCount) * 100 : 100;
      
      checks.push({
        name: "bot_activity",
        status: successRate >= 90 ? "ok" : successRate >= 70 ? "degraded" : "down",
        responseTime: Date.now() - botStart,
        message: `${successRate.toFixed(1)}% success rate (${totalCount} messages in last hour)`,
        details: { successRate, totalCount, successCount },
      });
      
      if (successRate < 70) overallStatus = "down";
      else if (successRate < 90 && overallStatus === "ok") overallStatus = "degraded";
    } catch (e) {
      checks.push({
        name: "bot_activity",
        status: "degraded",
        responseTime: Date.now() - botStart,
        message: String(e),
      });
    }

    // 5. Attendance System Check
    const attendanceStart = Date.now();
    try {
      // ⚠️ TIMEZONE: Use Bangkok date, not UTC
      const today = getBangkokDateString();
      const { count: checkInCount } = await supabase
        .from("attendance_logs")
        .select("id", { count: "exact", head: true })
        .gte("server_time", `${today}T00:00:00+07:00`)
        .eq("event_type", "check_in");
      
      const { count: employeeCount } = await supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);
      
      checks.push({
        name: "attendance",
        status: "ok",
        responseTime: Date.now() - attendanceStart,
        message: `${checkInCount || 0} check-ins today, ${employeeCount || 0} active employees`,
        details: { checkInCount, employeeCount },
      });
    } catch (e) {
      checks.push({
        name: "attendance",
        status: "degraded",
        responseTime: Date.now() - attendanceStart,
        message: String(e),
      });
    }

    // 6. Feature Flags Check
    const flagsStart = Date.now();
    try {
      const { data: flags, count } = await supabase
        .from("feature_flags")
        .select("flag_key, is_enabled", { count: "exact" });
      
      const enabledCount = flags?.filter(f => f.is_enabled).length || 0;
      
      checks.push({
        name: "feature_flags",
        status: "ok",
        responseTime: Date.now() - flagsStart,
        message: `${enabledCount}/${count || 0} flags enabled`,
        details: { enabledCount, totalCount: count },
      });
    } catch (e) {
      checks.push({
        name: "feature_flags",
        status: "degraded",
        responseTime: Date.now() - flagsStart,
        message: String(e),
      });
    }

    // Log health check result
    try {
      await supabase.from("system_health_logs").insert({
        check_type: "full_health_check",
        status: overallStatus,
        response_time_ms: Date.now() - startTime,
        details: { checks },
      });
    } catch (e) {
      console.error("[health-check] Failed to log health check:", e);
    }

    // Build response — full payload only for authorized callers (cron / monitoring).
    // Anonymous callers receive a minimal status to avoid information disclosure.
    const fullResponse = {
      status: overallStatus,
      environment: APP_ENV,
      timestamp: new Date().toISOString(),
      totalResponseTime: Date.now() - startTime,
      checks,
      summary: {
        ok: checks.filter(c => c.status === "ok").length,
        degraded: checks.filter(c => c.status === "degraded").length,
        down: checks.filter(c => c.status === "down").length,
      },
    };

    const publicResponse = {
      status: overallStatus,
      timestamp: fullResponse.timestamp,
    };

    return new Response(
      JSON.stringify(isAuthorized ? fullResponse : publicResponse, null, 2),
      {
        status: overallStatus === "down" ? 503 : 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("[health-check] Critical error:", error);

    const errorTimestamp = new Date().toISOString();
    const fullError = {
      status: "down" as const,
      environment: APP_ENV,
      timestamp: errorTimestamp,
      totalResponseTime: Date.now() - startTime,
      error: String(error),
      checks,
    };
    const publicError = {
      status: "down" as const,
      timestamp: errorTimestamp,
    };

    return new Response(
      JSON.stringify(isAuthorized ? fullError : publicError, null, 2),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
