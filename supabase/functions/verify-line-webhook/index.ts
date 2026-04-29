import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const EXPECTED_PROJECT_REF = "phhxdgaiwgaiuecvfjgj";
const EXPECTED_WEBHOOK_URL = `https://${EXPECTED_PROJECT_REF}.supabase.co/functions/v1/line-webhook`;

interface VerifyResult {
  ok: boolean;
  is_match: boolean;
  current_url: string | null;
  expected_url: string;
  test_success: boolean | null;
  test_status_code: number | null;
  test_reason: string | null;
  active: boolean | null;
  error: string | null;
  recommendation: string;
}

async function fetchCurrentEndpoint(token: string): Promise<{ endpoint: string | null; active: boolean | null; error: string | null }> {
  try {
    const res = await fetch("https://api.line.me/v2/bot/channel/webhook/endpoint", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      return { endpoint: null, active: null, error: `LINE API ${res.status}: ${JSON.stringify(data)}` };
    }
    return { endpoint: data.endpoint ?? null, active: data.active ?? null, error: null };
  } catch (e) {
    return { endpoint: null, active: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function testWebhook(token: string, endpoint: string): Promise<{ success: boolean | null; status: number | null; reason: string | null; raw: any }> {
  try {
    const res = await fetch("https://api.line.me/v2/bot/channel/webhook/test", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ endpoint }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, status: res.status, reason: JSON.stringify(data), raw: data };
    }
    return {
      success: data.success ?? null,
      status: data.statusCode ?? null,
      reason: data.reason ?? null,
      raw: data,
    };
  } catch (e) {
    return { success: false, status: null, reason: e instanceof Error ? e.message : String(e), raw: null };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const triggeredBy = req.headers.get("x-cron-secret") ? "cron" : "manual";
  const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");

  if (!token) {
    const result: VerifyResult = {
      ok: false,
      is_match: false,
      current_url: null,
      expected_url: EXPECTED_WEBHOOK_URL,
      test_success: null,
      test_status_code: null,
      test_reason: null,
      active: null,
      error: "LINE_CHANNEL_ACCESS_TOKEN not configured",
      recommendation: "ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ใน Lovable Cloud secrets",
    };
    return new Response(JSON.stringify(result), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 1. Fetch current endpoint from LINE
  const { endpoint, active, error: fetchError } = await fetchCurrentEndpoint(token);

  // 2. Compare
  const isMatch = endpoint === EXPECTED_WEBHOOK_URL;

  let testResult: { success: boolean | null; status: number | null; reason: string | null; raw: any } = {
    success: null,
    status: null,
    reason: null,
    raw: null,
  };

  // 3. Test webhook only if URL exists (whether it matches or not, helpful for debugging)
  if (endpoint && !fetchError) {
    testResult = await testWebhook(token, endpoint);
  }

  // 4. Build recommendation
  let recommendation = "";
  if (fetchError) {
    recommendation = `ไม่สามารถเรียก LINE API ได้: ${fetchError}`;
  } else if (!endpoint) {
    recommendation = `ยังไม่ได้ตั้ง webhook URL ใน LINE Developers Console — กรุณาตั้งค่าเป็น ${EXPECTED_WEBHOOK_URL}`;
  } else if (!isMatch) {
    recommendation = `❌ Webhook ชี้ผิด project! ปัจจุบัน: ${endpoint} → ต้องเปลี่ยนเป็น: ${EXPECTED_WEBHOOK_URL} ใน LINE Developers Console > Messaging API > Webhook URL`;
  } else if (!active) {
    recommendation = `Webhook URL ตรง แต่ "Use webhook" ถูกปิดอยู่ใน LINE Console — กรุณาเปิด toggle "Use webhook"`;
  } else if (testResult.success === false) {
    recommendation = `Webhook URL ตรงและเปิดใช้งาน แต่ LINE ทดสอบยิงไม่สำเร็จ (${testResult.status}): ${testResult.reason}`;
  } else if (testResult.success) {
    recommendation = "✅ Webhook ทำงานถูกต้อง — URL ตรง, เปิดใช้งาน, และ LINE ยิง test สำเร็จ";
  } else {
    recommendation = "Webhook URL ตรง แต่ไม่สามารถทดสอบได้";
  }

  const result: VerifyResult = {
    ok: isMatch && active === true && testResult.success === true,
    is_match: isMatch,
    current_url: endpoint,
    expected_url: EXPECTED_WEBHOOK_URL,
    test_success: testResult.success,
    test_status_code: testResult.status,
    test_reason: testResult.reason,
    active,
    error: fetchError,
    recommendation,
  };

  // 5. Log to DB
  await supabase.from("webhook_verification_logs").insert({
    current_url: endpoint,
    expected_url: EXPECTED_WEBHOOK_URL,
    is_match: isMatch,
    test_success: testResult.success,
    test_status_code: testResult.status,
    test_reason: testResult.reason,
    raw_response: { fetch: { endpoint, active, error: fetchError }, test: testResult.raw },
    triggered_by: triggeredBy,
    error_message: fetchError,
  });

  // 6. If cron run and mismatch → push alert to admin LINE group
  if (triggeredBy === "cron" && !result.ok) {
    try {
      const { data: alertSetting } = await supabase
        .from("bot_alert_settings")
        .select("admin_group_line_id")
        .maybeSingle();
      const adminGroupId = alertSetting?.admin_group_line_id;
      if (adminGroupId) {
        await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: adminGroupId,
            messages: [
              {
                type: "text",
                text: `🚨 Webhook Verification Failed\n\n${recommendation}`,
              },
            ],
          }),
        });
      }
    } catch (_e) {
      // swallow alert errors
    }
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
