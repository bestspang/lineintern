import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// =============================================
// Types
// =============================================

interface ExtractionResult {
  vendor: { value: string | null; confidence: number };
  vendor_address: { value: string | null; confidence: number };
  vendor_branch: { value: string | null; confidence: number };
  tax_id: { value: string | null; confidence: number };
  receipt_number: { value: string | null; confidence: number };
  date: { value: string | null; confidence: number };
  transaction_time: { value: string | null; confidence: number };
  sale_time: { value: string | null; confidence: number };
  currency: { value: string | null; confidence: number };
  subtotal: { value: number | null; confidence: number };
  vat: { value: number | null; confidence: number };
  total: { value: number | null; confidence: number };
  category: { value: string | null; confidence: number };
  payment_method: { value: string | null; confidence: number };
  card_type: { value: string | null; confidence: number };
  card_number_masked: { value: string | null; confidence: number };
  payer_name: { value: string | null; confidence: number };
  items: Array<{
    name: string;
    quantity: number | null;
    unit: string | null;
    unit_price: number | null;
    amount: number;
  }>;
  warnings: string[];
}

interface ReceiptSubmitRequest {
  lineUserId: string;
  lineMessageId: string;
  businessId?: string;
  branchId?: string | null;
  branchSource?: 'group_mapping' | 'submitter' | 'manual' | null;
  source?: "line" | "manual" | "web";
  // For direct image upload
  imageBase64?: string;
  imageMimeType?: string;
  // For manual entry
  manualData?: {
    vendor?: string;
    date?: string;
    total?: number;
    category?: string;
    description?: string;
  };
}

// =============================================
// Utility Functions
// =============================================

function getBangkokNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
}

function getBangkokTodayDate(): string {
  const now = new Date();
  return now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
}

// Convert time-only string (HH:MM:SS) to full ISO timestamp
function buildFullTimestamp(date: string | null, time: string | null): string | null {
  if (!time) return null;
  
  // If time is already a full ISO timestamp, return as is
  if (time.includes('T') || time.includes(' ') || time.length > 10) {
    return time;
  }
  
  // Use extracted date or today's date (Bangkok timezone)
  const dateStr = date || getBangkokTodayDate();
  
  // Combine date + time with Bangkok timezone offset
  return `${dateStr}T${time}+07:00`;
}

function getCurrentPeriod(): string {
  const now = getBangkokNow();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function hashFile(data: Uint8Array): Promise<string> {
  // Create a new ArrayBuffer copy to satisfy type requirements
  const buffer = new ArrayBuffer(data.length);
  new Uint8Array(buffer).set(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Convert Uint8Array to base64 in chunks to avoid stack overflow
function uint8ArrayToBase64(data: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.subarray(i, Math.min(i + chunkSize, data.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

// =============================================
// Quota Check
// =============================================

async function checkAndUpdateQuota(lineUserId: string): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const period = getCurrentPeriod();

  // Get or create subscription
  let { data: subscription } = await supabase
    .from("receipt_subscriptions")
    .select("plan_id")
    .eq("line_user_id", lineUserId)
    .single();

  if (!subscription) {
    // Create free subscription
    await supabase.from("receipt_subscriptions").insert({
      line_user_id: lineUserId,
      plan_id: "free",
    });
    subscription = { plan_id: "free" };
  }

  // Get plan limits
  const { data: plan } = await supabase
    .from("receipt_plans")
    .select("ai_receipts_limit")
    .eq("id", subscription.plan_id)
    .single();

  const limit = plan?.ai_receipts_limit || 8;

  // Get or create usage record
  let { data: usage } = await supabase
    .from("receipt_usage")
    .select("ai_receipts_used")
    .eq("line_user_id", lineUserId)
    .eq("period_yyyymm", period)
    .single();

  if (!usage) {
    await supabase.from("receipt_usage").insert({
      line_user_id: lineUserId,
      period_yyyymm: period,
      ai_receipts_used: 0,
    });
    usage = { ai_receipts_used: 0 };
  }

  const used = usage.ai_receipts_used || 0;
  const allowed = used < limit;

  return { allowed, remaining: limit - used, limit };
}

async function incrementQuotaUsage(lineUserId: string): Promise<void> {
  const period = getCurrentPeriod();
  
  // Get current usage
  const { data: usage } = await supabase
    .from("receipt_usage")
    .select("ai_receipts_used")
    .eq("line_user_id", lineUserId)
    .eq("period_yyyymm", period)
    .single();

  if (usage) {
    await supabase
      .from("receipt_usage")
      .update({ ai_receipts_used: (usage.ai_receipts_used || 0) + 1 })
      .eq("line_user_id", lineUserId)
      .eq("period_yyyymm", period);
  } else {
    await supabase.from("receipt_usage").insert({
      line_user_id: lineUserId,
      period_yyyymm: period,
      ai_receipts_used: 1,
    });
  }
}

// =============================================
// Google Integration
// =============================================

async function triggerGoogleIntegration(
  lineUserId: string, 
  receiptId: string, 
  storagePath: string, 
  contentType: string,
  receipt: any
): Promise<void> {
  try {
    // Check if user has Google connected
    const { data: googleToken } = await supabase
      .from("google_tokens")
      .select("id, drive_folder_id")
      .eq("line_user_id", lineUserId)
      .single();

    if (!googleToken) {
      console.log(`[receipt-submit] User ${lineUserId} has no Google connection, skipping`);
      return;
    }

    // Get public URL for the file
    const { data: publicUrl } = supabase.storage
      .from("receipt-files")
      .getPublicUrl(storagePath);

    if (!publicUrl?.publicUrl) {
      console.error("[receipt-submit] Failed to get public URL for file");
      return;
    }

    // Get business name if exists
    let businessName = "";
    if (receipt.business_id) {
      const { data: business } = await supabase
        .from("receipt_businesses")
        .select("name")
        .eq("id", receipt.business_id)
        .single();
      businessName = business?.name || "";
    }

    // Parse date for folder structure
    const receiptDate = receipt.receipt_date ? new Date(receipt.receipt_date) : new Date();
    const year = receiptDate.getFullYear().toString();
    const month = String(receiptDate.getMonth() + 1).padStart(2, "0");

    // Trigger Google Drive upload (fire and forget)
    const ext = contentType.includes("pdf") ? "pdf" : contentType.includes("png") ? "png" : "jpg";
    const fileName = `${receipt.vendor || "receipt"}_${receipt.receipt_date || "unknown"}_${receiptId.slice(0, 8)}.${ext}`;

    fetch(`${SUPABASE_URL}/functions/v1/google-drive-upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        lineUserId,
        receiptId,
        fileName,
        fileUrl: publicUrl.publicUrl,
        mimeType: contentType,
        year,
        month,
      }),
    }).then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        console.log(`[receipt-submit] Google Drive upload triggered: ${data.fileId}`);
        
        // Trigger Sheets append after Drive upload
        await fetch(`${SUPABASE_URL}/functions/v1/google-sheets-append`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            lineUserId,
            receiptId,
            receiptData: {
              date: receipt.receipt_date,
              vendor: receipt.vendor,
              category: receipt.category,
              amount: receipt.subtotal,
              tax: receipt.vat,
              total: receipt.total,
              description: receipt.description,
              fileLink: data.webViewLink,
              businessName,
            },
            year,
            month,
          }),
        });
      }
    }).catch((err) => {
      console.error("[receipt-submit] Google Drive upload failed:", err);
    });

    console.log(`[receipt-submit] Google integration triggered for receipt ${receiptId}`);
  } catch (error) {
    console.error("[receipt-submit] Google integration error:", error);
    // Don't throw - Google integration is optional
  }
}

// =============================================
// LINE API
// =============================================

async function getLineMessageContent(messageId: string): Promise<{ data: Uint8Array; contentType: string } | null> {
  try {
    const response = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: {
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    });

    if (!response.ok) {
      console.error(`Failed to get LINE content: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const data = new Uint8Array(await response.arrayBuffer());
    return { data, contentType };
  } catch (error) {
    console.error("Error fetching LINE content:", error);
    return null;
  }
}

// =============================================
// AI Extraction using Lovable AI (Gemini Vision)
// =============================================

async function extractReceiptData(imageBase64: string, mimeType: string): Promise<ExtractionResult> {
  if (!LOVABLE_API_KEY) {
    console.warn("LOVABLE_API_KEY not set, returning empty extraction");
    return getEmptyExtraction(["AI not configured"]);
  }

  const systemPrompt = `You are a Thai receipt data extraction assistant. Extract ALL information from the receipt image COMPLETELY - do not abbreviate or shorten any text.

Return ONLY valid JSON matching this schema:
{
  "vendor": {"value": "FULL company name with legal form (e.g. ห้างหุ้นส่วนจำกัด xxx, บริษัท xxx จำกัด)", "confidence": 0.0-1.0},
  "vendor_address": {"value": "COMPLETE address with street number, soi, road, district, province, postal code", "confidence": 0.0-1.0},
  "vendor_branch": {"value": "branch name if shown (e.g. สาขา สำนักงานใหญ่, สาขา 001)", "confidence": 0.0-1.0},
  "tax_id": {"value": "13-digit tax ID number", "confidence": 0.0-1.0},
  "receipt_number": {"value": "receipt/invoice number exactly as shown", "confidence": 0.0-1.0},
  "date": {"value": "YYYY-MM-DD (convert Buddhist Era to CE: 2568 = 2025)", "confidence": 0.0-1.0},
  "transaction_time": {"value": "HH:MM:SS (time only, e.g. 19:27:54) - extract time portion from เวลาวางมือจ่าย", "confidence": 0.0-1.0},
  "sale_time": {"value": "HH:MM:SS (time only, e.g. 14:30:00) - extract time portion from วันที่ขาย/เวลาขาย", "confidence": 0.0-1.0},
  "currency": {"value": "THB", "confidence": 1.0},
  "subtotal": {"value": number, "confidence": 0.0-1.0},
  "vat": {"value": number, "confidence": 0.0-1.0},
  "total": {"value": number (final amount paid), "confidence": 0.0-1.0},
  "category": {"value": "Food & Dining|Transportation|Office Supplies|Utilities|Software|Marketing|Professional Services|Other", "confidence": 0.0-1.0},
  "payment_method": {"value": "VISA|MasterCard|JCB|UnionPay|Cash|QR|PromptPay|TrueMoney|etc", "confidence": 0.0-1.0},
  "card_type": {"value": "credit|debit|prepaid|etc", "confidence": 0.0-1.0},
  "card_number_masked": {"value": "masked card number exactly as shown (e.g. XXXX XXXX XXXX 0567)", "confidence": 0.0-1.0},
  "payer_name": {"value": "customer/cardholder name if shown", "confidence": 0.0-1.0},
  "items": [
    {
      "name": "FULL product/service name - DO NOT abbreviate or shorten",
      "quantity": 1.5,
      "unit": "ลิตร|ชิ้น|กก.|etc",
      "unit_price": 32.34,
      "amount": 500.00
    }
  ],
  "warnings": []
}

CRITICAL RULES:
- Extract FULL company name including ห้างหุ้นส่วนจำกัด/บริษัท prefix - never abbreviate
- Extract COMPLETE address - do not skip any part
- Extract ALL items with FULL names - no abbreviations (e.g. "น้ำมันเบนซิน 95" not "เบนซิน 95")
- Thai Buddhist Era (พ.ศ./2568) = CE year - 543 (e.g. 2568 = 2025)
- เวลาวางมือจ่าย = transaction_time, วันที่ขาย/เวลาขาย = sale_time
- Do NOT include point/reward information in items
- If "VAT INCLUDED" shown, set vat to null but note in warnings
- For gas stations: extract fuel type, quantity (liters), unit price per liter`;

  const userPrompt = "Extract all receipt data from this image. Return only the JSON object.";

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI API error: ${response.status} - ${errorText}`);
      return getEmptyExtraction(["AI extraction failed"]);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON found in AI response:", content);
      return getEmptyExtraction(["Could not parse AI response"]);
    }

    const extracted = JSON.parse(jsonMatch[0]) as ExtractionResult;
    
    // Validate and add warnings
    const warnings = extracted.warnings || [];
    if (!extracted.total?.value) warnings.push("Total missing");
    if (!extracted.date?.value) warnings.push("Date missing");
    if (!extracted.vendor?.value) warnings.push("Vendor unclear");

    // Apply vendor category hints if category confidence is low
    const enhancedExtraction = await applyCategoryHints(extracted);

    return { ...enhancedExtraction, warnings };
  } catch (error) {
    console.error("AI extraction error:", error);
    return getEmptyExtraction(["AI extraction error"]);
  }
}

function getEmptyExtraction(warnings: string[]): ExtractionResult {
  return {
    vendor: { value: null, confidence: 0 },
    vendor_address: { value: null, confidence: 0 },
    vendor_branch: { value: null, confidence: 0 },
    tax_id: { value: null, confidence: 0 },
    receipt_number: { value: null, confidence: 0 },
    date: { value: null, confidence: 0 },
    transaction_time: { value: null, confidence: 0 },
    sale_time: { value: null, confidence: 0 },
    currency: { value: "THB", confidence: 0.5 },
    subtotal: { value: null, confidence: 0 },
    vat: { value: null, confidence: 0 },
    total: { value: null, confidence: 0 },
    category: { value: null, confidence: 0 },
    payment_method: { value: null, confidence: 0 },
    card_type: { value: null, confidence: 0 },
    card_number_masked: { value: null, confidence: 0 },
    payer_name: { value: null, confidence: 0 },
    items: [],
    warnings,
  };
}

// =============================================
// Category Hints Integration
// =============================================

async function applyCategoryHints(extraction: ExtractionResult): Promise<ExtractionResult> {
  // Only apply hints if category is missing or low confidence
  if (extraction.category?.value && extraction.category.confidence >= 0.8) {
    return extraction;
  }

  const vendor = extraction.vendor?.value;
  if (!vendor) return extraction;

  try {
    const { data: hints } = await supabase
      .from("vendor_category_hints")
      .select("suggested_category, confidence")
      .order("usage_count", { ascending: false })
      .limit(20);

    if (!hints || hints.length === 0) return extraction;

    // Search for matching vendor pattern
    const vendorLower = vendor.toLowerCase();
    for (const hint of hints) {
      // Hints use patterns like "7-eleven|seven|เซเว่น"
      const patterns = (hint as any).vendor_pattern?.split("|") || [];
      const matched = patterns.some((p: string) => vendorLower.includes(p.toLowerCase().trim()));

      if (matched) {
        console.log(`[applyCategoryHints] Matched vendor "${vendor}" to category "${hint.suggested_category}"`);
        
        // Update usage count
        await supabase
          .from("vendor_category_hints")
          .update({ usage_count: ((hint as any).usage_count || 0) + 1 })
          .eq("id", (hint as any).id);

        return {
          ...extraction,
          category: {
            value: hint.suggested_category,
            confidence: hint.confidence || 0.75,
          },
        };
      }
    }
  } catch (error) {
    console.error("[applyCategoryHints] Error:", error);
  }

  return extraction;
}

// =============================================
// Storage
// =============================================

async function uploadToStorage(
  data: Uint8Array,
  receiptId: string,
  filename: string,
  mimeType: string
): Promise<string | null> {
  const now = getBangkokNow();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const storagePath = `receipts/${year}/${month}/${receiptId}/${filename}`;

  const { error } = await supabase.storage.from("receipt-files").upload(storagePath, data, {
    contentType: mimeType,
    upsert: true,
  });

  if (error) {
    console.error("Storage upload error:", error);
    return null;
  }

  return storagePath;
}

// =============================================
// Main Handler
// =============================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ReceiptSubmitRequest = await req.json();
    const { lineUserId, lineMessageId, businessId, branchId, branchSource, source = "line", imageBase64, imageMimeType, manualData } = body;

    if (!lineUserId) {
      return new Response(JSON.stringify({ error: "lineUserId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[receipt-submit] Processing for user: ${lineUserId}, source: ${source}`);

    // For manual entry, skip quota check
    const isManual = source === "manual" || !!manualData;

    if (!isManual) {
      // Check quota
      const quota = await checkAndUpdateQuota(lineUserId);
      if (!quota.allowed) {
        return new Response(
          JSON.stringify({
            error: "quota_exceeded",
            message: `คุณใช้ AI อ่านใบเสร็จครบ ${quota.limit} ใบแล้วในเดือนนี้ กรุณาอัปเกรดแพลน หรือกรอกข้อมูลเอง`,
            remaining: 0,
            limit: quota.limit,
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    let extraction: ExtractionResult;
    let imageData: Uint8Array | null = null;
    let contentType = imageMimeType || "image/jpeg";
    let fileHash: string | null = null;

    if (manualData) {
      // Manual entry - no AI extraction
      extraction = {
        vendor: { value: manualData.vendor || null, confidence: 1 },
        vendor_address: { value: null, confidence: 0 },
        vendor_branch: { value: null, confidence: 0 },
        tax_id: { value: null, confidence: 0 },
        receipt_number: { value: null, confidence: 0 },
        date: { value: manualData.date || null, confidence: 1 },
        transaction_time: { value: null, confidence: 0 },
        sale_time: { value: null, confidence: 0 },
        currency: { value: "THB", confidence: 1 },
        subtotal: { value: null, confidence: 0 },
        vat: { value: null, confidence: 0 },
        total: { value: manualData.total || null, confidence: 1 },
        category: { value: manualData.category || null, confidence: 1 },
        payment_method: { value: null, confidence: 0 },
        card_type: { value: null, confidence: 0 },
        card_number_masked: { value: null, confidence: 0 },
        payer_name: { value: null, confidence: 0 },
        items: [],
        warnings: [],
      };
    } else if (imageBase64) {
      // Direct base64 image
      imageData = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
      fileHash = await hashFile(imageData);
      extraction = await extractReceiptData(imageBase64, contentType);
    } else if (lineMessageId) {
      // Fetch from LINE
      const content = await getLineMessageContent(lineMessageId);
      if (!content) {
        return new Response(JSON.stringify({ error: "Failed to fetch image from LINE" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      imageData = content.data;
      contentType = content.contentType;
      fileHash = await hashFile(imageData);

      // Convert to base64 for AI (using chunked conversion to avoid stack overflow)
      const base64 = uint8ArrayToBase64(imageData);
      extraction = await extractReceiptData(base64, contentType);
    } else {
      return new Response(JSON.stringify({ error: "No image or manual data provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for duplicates using file hash
    if (fileHash) {
      const { data: duplicate } = await supabase
        .from("receipt_files")
        .select("receipt_id")
        .eq("file_hash", fileHash)
        .maybeSingle();

      if (duplicate) {
        return new Response(
          JSON.stringify({
            error: "duplicate",
            message: "ใบเสร็จนี้เคยบันทึกแล้ว",
            existingReceiptId: duplicate.receipt_id,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Determine status
    const hasRequiredFields = extraction.total?.value && extraction.date?.value && extraction.vendor?.value;
    const status = hasRequiredFields ? "processed" : "needs_review";

    // Create receipt record with all extracted fields
    const { data: receipt, error: receiptError } = await supabase
      .from("receipts")
      .insert({
        line_user_id: lineUserId,
        business_id: businessId || null,
        branch_id: branchId || null,
        branch_source: branchSource || null,
        source,
        status,
        receipt_date: extraction.date?.value || null,
        vendor: extraction.vendor?.value || null,
        vendor_address: extraction.vendor_address?.value || null,
        vendor_branch: extraction.vendor_branch?.value || null,
        tax_id: extraction.tax_id?.value || null,
        receipt_number: extraction.receipt_number?.value || null,
        transaction_time: buildFullTimestamp(extraction.date?.value, extraction.transaction_time?.value),
        sale_time: buildFullTimestamp(extraction.date?.value, extraction.sale_time?.value),
        description: manualData?.description || null,
        category: extraction.category?.value || null,
        currency: extraction.currency?.value || "THB",
        subtotal: extraction.subtotal?.value || null,
        vat: extraction.vat?.value || null,
        total: extraction.total?.value || null,
        payment_method: extraction.payment_method?.value || null,
        card_type: extraction.card_type?.value || null,
        card_number_masked: extraction.card_number_masked?.value || null,
        payer_name: extraction.payer_name?.value || null,
        confidence: {
          vendor: extraction.vendor?.confidence || 0,
          date: extraction.date?.confidence || 0,
          total: extraction.total?.confidence || 0,
          category: extraction.category?.confidence || 0,
        },
        warnings: extraction.warnings || [],
      })
      .select()
      .single();

    if (receiptError || !receipt) {
      console.error("Failed to create receipt:", receiptError);
      return new Response(JSON.stringify({ error: "Failed to save receipt" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert receipt items if any
    if (extraction.items && extraction.items.length > 0) {
      const itemsToInsert = extraction.items.map((item, index) => ({
        receipt_id: receipt.id,
        item_name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        amount: item.amount,
        sort_order: index,
      }));

      const { error: itemsError } = await supabase
        .from("receipt_items")
        .insert(itemsToInsert);

      if (itemsError) {
        console.error("Failed to insert receipt items:", itemsError);
        // Don't fail the whole request, just log the error
      }
    }

    if (receiptError || !receipt) {
      console.error("Failed to create receipt:", receiptError);
      return new Response(JSON.stringify({ error: "Failed to save receipt" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload file to storage
    if (imageData) {
      const ext = contentType.includes("pdf") ? "pdf" : contentType.includes("png") ? "png" : "jpg";
      const filename = `receipt.${ext}`;
      const storagePath = await uploadToStorage(imageData, receipt.id, filename, contentType);

      if (storagePath) {
        await supabase.from("receipt_files").insert({
          receipt_id: receipt.id,
          storage_path: storagePath,
          original_filename: filename,
          mime_type: contentType,
          file_hash: fileHash,
        });

        // Trigger Google Drive upload if connected
        await triggerGoogleIntegration(lineUserId, receipt.id, storagePath, contentType, receipt);
      }
    }

    // Increment quota usage for AI extractions
    if (!isManual) {
      await incrementQuotaUsage(lineUserId);
    }

    console.log(`[receipt-submit] Receipt created: ${receipt.id}, status: ${status}`);

    return new Response(
      JSON.stringify({
        success: true,
        receipt: {
          id: receipt.id,
          status,
          vendor: extraction.vendor?.value,
          vendor_address: extraction.vendor_address?.value,
          tax_id: extraction.tax_id?.value,
          receipt_number: extraction.receipt_number?.value,
          date: extraction.date?.value,
          total: extraction.total?.value,
          currency: extraction.currency?.value,
          category: extraction.category?.value,
          payment_method: extraction.payment_method?.value,
          card_number_masked: extraction.card_number_masked?.value,
          items: extraction.items || [],
          warnings: extraction.warnings,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[receipt-submit] Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
