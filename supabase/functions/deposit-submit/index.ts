import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface DepositData {
  employeeId: string;
  branchId: string;
  depositDate: string;
  facePhotoBase64: string;
  slipPhotoBase64: string;
  livenessData?: any;
}

interface ExtractedData {
  amount?: number;
  account_number?: string;
  bank_name?: string;
  bank_branch?: string;
  deposit_date?: string;
  reference_number?: string;
  confidence?: number;
}

// Extract data from deposit slip using AI
async function extractDepositData(imageBase64: string): Promise<ExtractedData> {
  if (!LOVABLE_API_KEY) {
    console.error("LOVABLE_API_KEY not configured");
    return {};
  }

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this Thai bank deposit slip image and extract the following information. Return ONLY a valid JSON object with these fields:
{
  "amount": <number or null - the deposit amount in Thai Baht>,
  "account_number": <string or null - the destination account number>,
  "bank_name": <string or null - the bank name>,
  "bank_branch": <string or null - the bank branch name if visible>,
  "deposit_date": <string or null - the deposit date in YYYY-MM-DD format>,
  "reference_number": <string or null - any reference/transaction number>,
  "confidence": <number 0-1 - how confident you are in the extraction>
}

Important: 
- Return ONLY the JSON object, no other text
- If a field cannot be determined, use null
- For amount, extract only the numeric value without currency symbols
- Look for Thai text like "จำนวนเงิน", "เลขที่บัญชี", "วันที่", "เลขที่อ้างอิง"`
              },
              {
                type: "image_url",
                image_url: {
                  url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI API error:", response.status, await response.text());
      return {};
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error("No content in AI response");
      return {};
    }

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log("Extracted deposit data:", parsed);
      return parsed;
    }

    return {};
  } catch (error) {
    console.error("Error extracting deposit data:", error);
    return {};
  }
}

// Upload image to storage
async function uploadImage(base64Data: string, path: string): Promise<string | null> {
  try {
    // Remove data URL prefix if present
    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const binaryData = Uint8Array.from(atob(base64Content), c => c.charCodeAt(0));
    
    const { data, error } = await supabase.storage
      .from('deposit-slips')
      .upload(path, binaryData, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (error) {
      console.error("Upload error:", error);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('deposit-slips')
      .getPublicUrl(path);

    return urlData.publicUrl;
  } catch (error) {
    console.error("Error uploading image:", error);
    return null;
  }
}

// Send LINE notification
async function sendLineNotification(groupId: string, message: string): Promise<string | null> {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !groupId) {
    console.log("LINE notification skipped - no token or group ID");
    return null;
  }

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: groupId,
        messages: [{ type: "text", text: message }],
      }),
    });

    if (!response.ok) {
      console.error("LINE API error:", response.status, await response.text());
      return null;
    }

    const result = await response.json();
    return result.messageId || "sent";
  } catch (error) {
    console.error("Error sending LINE notification:", error);
    return null;
  }
}

// Format currency
function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "ไม่ระบุ";
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data: DepositData = await req.json();
    const { employeeId, branchId, depositDate, facePhotoBase64, slipPhotoBase64, livenessData } = data;

    console.log("Processing deposit submission:", { employeeId, branchId, depositDate });

    // Validate required fields
    if (!employeeId || !branchId || !depositDate || !slipPhotoBase64) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for duplicate deposit
    const { data: existingDeposit } = await supabase
      .from('daily_deposits')
      .select('id')
      .eq('branch_id', branchId)
      .eq('deposit_date', depositDate)
      .maybeSingle();

    if (existingDeposit) {
      return new Response(
        JSON.stringify({ success: false, error: "วันนี้มีการอัพโหลดใบฝากเงินแล้ว" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get employee and branch info
    const { data: employee } = await supabase
      .from('employees')
      .select('full_name, code, branch:branches(name)')
      .eq('id', employeeId)
      .single();

    if (!employee) {
      return new Response(
        JSON.stringify({ success: false, error: "Employee not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upload images
    const timestamp = Date.now();
    const facePath = `${branchId}/${depositDate}/face_${employeeId}_${timestamp}.jpg`;
    const slipPath = `${branchId}/${depositDate}/slip_${employeeId}_${timestamp}.jpg`;

    let facePhotoUrl = null;
    if (facePhotoBase64) {
      facePhotoUrl = await uploadImage(facePhotoBase64, facePath);
    }

    const slipPhotoUrl = await uploadImage(slipPhotoBase64, slipPath);

    if (!slipPhotoUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to upload slip photo" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract data from slip using AI
    const extractedData = await extractDepositData(slipPhotoBase64);

    // Insert deposit record
    const { data: deposit, error: insertError } = await supabase
      .from('daily_deposits')
      .insert({
        branch_id: branchId,
        employee_id: employeeId,
        deposit_date: depositDate,
        face_photo_url: facePhotoUrl,
        face_verified_at: facePhotoBase64 ? new Date().toISOString() : null,
        liveness_data: livenessData,
        slip_photo_url: slipPhotoUrl,
        amount: extractedData.amount || null,
        account_number: extractedData.account_number || null,
        bank_name: extractedData.bank_name || null,
        bank_branch: extractedData.bank_branch || null,
        deposit_date_on_slip: extractedData.deposit_date || null,
        reference_number: extractedData.reference_number || null,
        raw_ocr_result: extractedData,
        extraction_confidence: extractedData.confidence || null,
        status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get notification settings
    const { data: settings } = await supabase
      .from('deposit_settings')
      .select('notify_line_group_id')
      .or(`scope.eq.branch,branch_id.eq.${branchId}`)
      .order('scope', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fallback to global settings if no branch-specific settings
    let notifyGroupId = settings?.notify_line_group_id;
    if (!notifyGroupId) {
      const { data: globalSettings } = await supabase
        .from('deposit_settings')
        .select('notify_line_group_id')
        .eq('scope', 'global')
        .maybeSingle();
      notifyGroupId = globalSettings?.notify_line_group_id;
    }

    // Send notification
    const branchName = (employee.branch as any)?.name || 'ไม่ระบุสาขา';
    const now = new Date();
    const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });

    const notificationMessage = `📥 แจ้งฝากเงินประจำวัน
━━━━━━━━━━━━━━━━
👤 พนักงาน: ${employee.full_name}
🏢 สาขา: ${branchName}
💰 ยอดฝาก: ${formatCurrency(extractedData.amount)}
🏦 บัญชี: ${extractedData.account_number || 'ไม่ระบุ'}
📄 Ref: ${extractedData.reference_number || 'ไม่ระบุ'}
⏰ เวลา: ${timeStr} น.`;

    let lineMessageId = null;
    if (notifyGroupId) {
      lineMessageId = await sendLineNotification(notifyGroupId, notificationMessage);
      
      // Update deposit with notification info
      if (lineMessageId) {
        await supabase
          .from('daily_deposits')
          .update({ 
            notified_at: new Date().toISOString(),
            line_message_id: lineMessageId 
          })
          .eq('id', deposit.id);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        deposit,
        extractedData,
        notified: !!lineMessageId
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in deposit-submit:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});