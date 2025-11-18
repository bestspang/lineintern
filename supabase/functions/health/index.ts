import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_ENV = Deno.env.get("APP_ENV") || "sandbox";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "GET") {
    return new Response("Method not allowed", { 
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Test database connection
    let dbStatus = "ok";
    let lastWebhookEventAt = null;

    try {
      const { data, error } = await supabase
        .from("messages")
        .select("sent_at")
        .order("sent_at", { ascending: false })
        .limit(1);

      if (error) {
        console.error("[health] Database error:", error);
        dbStatus = "error";
      } else if (data && data.length > 0) {
        lastWebhookEventAt = data[0].sent_at;
      }
    } catch (error) {
      console.error("[health] Database connection error:", error);
      dbStatus = "error";
    }

    const healthData = {
      status: "ok",
      environment: APP_ENV,
      db: dbStatus,
      last_webhook_event_at: lastWebhookEventAt,
      timestamp: new Date().toISOString(),
      functions: {
        line_webhook: "deployed",
        health: "deployed",
      },
    };

    return new Response(JSON.stringify(healthData, null, 2), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[health] Error:", error);
    
    return new Response(
      JSON.stringify({
        status: "error",
        environment: APP_ENV,
        db: "error",
        error: String(error),
        timestamp: new Date().toISOString(),
      }, null, 2),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
