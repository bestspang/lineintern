/**
 * Receipt Handler for LINE Webhook
 * Handles receipt image submissions and commands
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBangkokDateString, formatBangkokTime, getBangkokNow } from "../../_shared/timezone.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// =============================
// Types
// =============================

interface ReceiptResult {
  success: boolean;
  receiptId?: string;
  status?: string;
  vendor?: string;
  date?: string;
  total?: number;
  currency?: string;
  category?: string;
  warnings?: string[];
  error?: string;
  message: string;
}

interface QuotaStatus {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}

// =============================
// Utility Functions
// =============================

function getCurrentPeriod(): string {
  const now = getBangkokNow();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function downloadLineImage(messageId: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api-data.line.me/v2/bot/message/${messageId}/content`,
      {
        headers: {
          Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        },
      }
    );

    if (!response.ok) {
      console.error(`[downloadLineImage] Failed: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    return btoa(String.fromCharCode(...uint8Array));
  } catch (error) {
    console.error("[downloadLineImage] Error:", error);
    return null;
  }
}

// =============================
// Quota Management
// =============================

export async function checkReceiptQuota(lineUserId: string): Promise<QuotaStatus> {
  const period = getCurrentPeriod();

  // Get or create subscription
  let { data: subscription } = await supabase
    .from("receipt_subscriptions")
    .select("plan_id")
    .eq("line_user_id", lineUserId)
    .single();

  if (!subscription) {
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

  // Get usage
  let { data: usage } = await supabase
    .from("receipt_usage")
    .select("ai_receipts_used")
    .eq("line_user_id", lineUserId)
    .eq("period_yyyymm", period)
    .single();

  const used = usage?.ai_receipts_used || 0;

  return {
    allowed: used < limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
  };
}

// =============================
// Business Management
// =============================

export async function getUserBusinesses(lineUserId: string): Promise<any[]> {
  const { data } = await supabase
    .from("receipt_businesses")
    .select("*")
    .eq("line_user_id", lineUserId)
    .order("is_default", { ascending: false });

  return data || [];
}

export async function getDefaultBusiness(lineUserId: string): Promise<any | null> {
  const { data } = await supabase
    .from("receipt_businesses")
    .select("*")
    .eq("line_user_id", lineUserId)
    .eq("is_default", true)
    .maybeSingle();

  return data;
}

export async function createBusiness(
  lineUserId: string,
  name: string,
  isDefault: boolean = false
): Promise<any> {
  const { data, error } = await supabase
    .from("receipt_businesses")
    .insert({
      line_user_id: lineUserId,
      name,
      is_default: isDefault,
    })
    .select()
    .single();

  if (error) {
    console.error("[createBusiness] Error:", error);
    return null;
  }

  return data;
}

// =============================
// Receipt Summary
// =============================

export async function getReceiptSummary(
  lineUserId: string,
  businessId?: string
): Promise<{
  thisMonth: { count: number; total: number };
  lastMonth: { count: number; total: number };
  ytd: { count: number; total: number };
}> {
  const now = getBangkokNow();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  let query = supabase
    .from("receipts")
    .select("receipt_date, total, status")
    .eq("line_user_id", lineUserId)
    .neq("status", "deleted");

  if (businessId) {
    query = query.eq("business_id", businessId);
  }

  const { data: receipts } = await query;

  const thisMonth = { count: 0, total: 0 };
  const lastMonth = { count: 0, total: 0 };
  const ytd = { count: 0, total: 0 };

  (receipts || []).forEach((r) => {
    if (!r.receipt_date) return;
    const date = new Date(r.receipt_date);
    const amount = r.total || 0;

    // YTD
    if (date >= yearStart) {
      ytd.count++;
      ytd.total += amount;
    }

    // This month
    if (date >= thisMonthStart) {
      thisMonth.count++;
      thisMonth.total += amount;
    }

    // Last month
    if (date >= lastMonthStart && date <= lastMonthEnd) {
      lastMonth.count++;
      lastMonth.total += amount;
    }
  });

  return { thisMonth, lastMonth, ytd };
}

// =============================
// Receipt Submission via edge function
// =============================

export async function submitReceiptImage(
  lineUserId: string,
  lineMessageId: string,
  businessId?: string
): Promise<ReceiptResult> {
  try {
    // Call receipt-submit edge function
    const response = await fetch(`${SUPABASE_URL}/functions/v1/receipt-submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        lineUserId,
        lineMessageId,
        businessId,
        source: "line",
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      if (result.error === "quota_exceeded") {
        return {
          success: false,
          error: "quota_exceeded",
          message: result.message || "Quota exceeded",
        };
      }
      if (result.error === "duplicate") {
        return {
          success: false,
          error: "duplicate",
          message: result.message || "Duplicate receipt",
        };
      }
      return {
        success: false,
        error: result.error,
        message: result.message || "Failed to process receipt",
      };
    }

    return {
      success: true,
      receiptId: result.receipt?.id,
      status: result.receipt?.status,
      vendor: result.receipt?.vendor,
      date: result.receipt?.date,
      total: result.receipt?.total,
      currency: result.receipt?.currency,
      category: result.receipt?.category,
      warnings: result.receipt?.warnings,
      message: "Receipt processed successfully",
    };
  } catch (error) {
    console.error("[submitReceiptImage] Error:", error);
    return {
      success: false,
      error: "internal_error",
      message: "Failed to process receipt",
    };
  }
}

// =============================
// Flex Message Builders
// =============================

export function buildReceiptProcessingFlex(locale: "th" | "en"): object {
  return {
    type: "flex",
    altText: locale === "th" ? "กำลังประมวลผลใบเสร็จ..." : "Processing receipt...",
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "⏳",
            size: "3xl",
            align: "center",
          },
          {
            type: "text",
            text: locale === "th" ? "กำลังประมวลผล..." : "Processing...",
            size: "lg",
            weight: "bold",
            align: "center",
            margin: "md",
          },
          {
            type: "text",
            text: locale === "th" 
              ? "AI กำลังอ่านข้อมูลจากใบเสร็จ" 
              : "AI is extracting receipt data",
            size: "sm",
            color: "#888888",
            align: "center",
            margin: "sm",
          },
        ],
        paddingAll: "20px",
      },
    },
  };
}

export function buildReceiptSavedFlex(
  result: ReceiptResult,
  locale: "th" | "en",
  liffUrl?: string
): object {
  const hasWarnings = result.warnings && result.warnings.length > 0;
  const statusEmoji = hasWarnings ? "⚠️" : "✅";
  const statusText = hasWarnings
    ? locale === "th" ? "บันทึกแล้ว - กรุณาตรวจสอบ" : "Saved - Please Review"
    : locale === "th" ? "บันทึกแล้ว" : "Saved";

  const contents: any[] = [
    {
      type: "text",
      text: statusEmoji,
      size: "3xl",
      align: "center",
    },
    {
      type: "text",
      text: statusText,
      size: "lg",
      weight: "bold",
      align: "center",
      margin: "md",
      color: hasWarnings ? "#FF9800" : "#4CAF50",
    },
  ];

  // Amount
  if (result.total) {
    contents.push({
      type: "text",
      text: `฿${result.total.toLocaleString()}`,
      size: "xxl",
      weight: "bold",
      align: "center",
      margin: "lg",
    });
  }

  // Details
  const details: any[] = [];
  if (result.vendor) {
    details.push({
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: locale === "th" ? "ร้านค้า" : "Vendor", size: "sm", color: "#888888", flex: 2 },
        { type: "text", text: result.vendor, size: "sm", flex: 4, wrap: true },
      ],
    });
  }
  if (result.date) {
    details.push({
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: locale === "th" ? "วันที่" : "Date", size: "sm", color: "#888888", flex: 2 },
        { type: "text", text: result.date, size: "sm", flex: 4 },
      ],
    });
  }
  if (result.category) {
    details.push({
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: locale === "th" ? "หมวดหมู่" : "Category", size: "sm", color: "#888888", flex: 2 },
        { type: "text", text: result.category, size: "sm", flex: 4 },
      ],
    });
  }

  if (details.length > 0) {
    contents.push({
      type: "separator",
      margin: "lg",
    });
    contents.push({
      type: "box",
      layout: "vertical",
      contents: details,
      margin: "lg",
      spacing: "sm",
    });
  }

  // Warnings
  if (hasWarnings) {
    contents.push({
      type: "separator",
      margin: "lg",
    });
    contents.push({
      type: "box",
      layout: "vertical",
      contents: result.warnings!.map((w) => ({
        type: "text",
        text: `⚠️ ${w}`,
        size: "xs",
        color: "#FF9800",
        wrap: true,
      })),
      margin: "lg",
    });
  }

  // Actions
  const actions: any[] = [];
  if (liffUrl && result.receiptId) {
    actions.push({
      type: "button",
      style: hasWarnings ? "primary" : "secondary",
      action: {
        type: "uri",
        label: locale === "th" ? "แก้ไข" : "Edit",
        uri: `${liffUrl}/receipts/edit/${result.receiptId}`,
      },
    });
  }
  actions.push({
    type: "button",
    style: "secondary",
    action: {
      type: "message",
      label: locale === "th" ? "สรุปเดือนนี้" : "This Month",
      text: "/receiptsummary",
    },
  });

  return {
    type: "flex",
    altText: locale === "th" ? "บันทึกใบเสร็จแล้ว" : "Receipt Saved",
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        contents,
        paddingAll: "20px",
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: actions,
        spacing: "sm",
      },
    },
  };
}

export function buildQuotaExceededFlex(
  quota: QuotaStatus,
  locale: "th" | "en"
): object {
  return {
    type: "flex",
    altText: locale === "th" ? "โควต้าหมดแล้ว" : "Quota Exceeded",
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "⚠️",
            size: "3xl",
            align: "center",
          },
          {
            type: "text",
            text: locale === "th" ? "โควต้า AI หมดแล้ว" : "AI Quota Exceeded",
            size: "lg",
            weight: "bold",
            align: "center",
            margin: "md",
            color: "#FF5722",
          },
          {
            type: "text",
            text: locale === "th"
              ? `ใช้ไปแล้ว ${quota.used}/${quota.limit} ใบเดือนนี้`
              : `Used ${quota.used}/${quota.limit} this month`,
            size: "sm",
            color: "#888888",
            align: "center",
            margin: "md",
          },
          {
            type: "separator",
            margin: "lg",
          },
          {
            type: "text",
            text: locale === "th"
              ? "💡 คุณยังสามารถกรอกข้อมูลเองได้ไม่จำกัด"
              : "💡 You can still enter receipts manually (unlimited)",
            size: "xs",
            color: "#666666",
            align: "center",
            margin: "lg",
            wrap: true,
          },
        ],
        paddingAll: "20px",
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            action: {
              type: "uri",
              label: locale === "th" ? "อัปเกรดแพลน" : "Upgrade Plan",
              uri: "https://example.com/upgrade", // TODO: Replace with actual URL
            },
          },
        ],
      },
    },
  };
}

export function buildReceiptSummaryFlex(
  summary: {
    thisMonth: { count: number; total: number };
    lastMonth: { count: number; total: number };
    ytd: { count: number; total: number };
  },
  locale: "th" | "en"
): object {
  const monthChange = summary.lastMonth.total > 0
    ? ((summary.thisMonth.total - summary.lastMonth.total) / summary.lastMonth.total * 100).toFixed(0)
    : 0;
  const changeEmoji = Number(monthChange) > 0 ? "📈" : Number(monthChange) < 0 ? "📉" : "➡️";

  return {
    type: "flex",
    altText: locale === "th" ? "สรุปใบเสร็จ" : "Receipt Summary",
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "📊",
            size: "3xl",
            align: "center",
          },
          {
            type: "text",
            text: locale === "th" ? "สรุปใบเสร็จ" : "Receipt Summary",
            size: "lg",
            weight: "bold",
            align: "center",
            margin: "md",
          },
          {
            type: "separator",
            margin: "lg",
          },
          // This Month
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: locale === "th" ? "📅 เดือนนี้" : "📅 This Month",
                size: "sm",
                color: "#888888",
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  {
                    type: "text",
                    text: `฿${summary.thisMonth.total.toLocaleString()}`,
                    size: "xl",
                    weight: "bold",
                    flex: 3,
                  },
                  {
                    type: "text",
                    text: `${summary.thisMonth.count} ${locale === "th" ? "ใบ" : "receipts"}`,
                    size: "sm",
                    color: "#888888",
                    align: "end",
                    flex: 2,
                    gravity: "bottom",
                  },
                ],
              },
            ],
            margin: "lg",
          },
          // Last Month comparison
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: locale === "th" ? "เทียบเดือนก่อน:" : "vs Last Month:",
                size: "xs",
                color: "#888888",
                flex: 3,
              },
              {
                type: "text",
                text: `${changeEmoji} ${monthChange}%`,
                size: "xs",
                color: Number(monthChange) > 0 ? "#F44336" : "#4CAF50",
                align: "end",
                flex: 2,
              },
            ],
            margin: "sm",
          },
          {
            type: "separator",
            margin: "lg",
          },
          // YTD
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: locale === "th" ? "📆 ปีนี้ (YTD)" : "📆 Year to Date",
                size: "sm",
                color: "#888888",
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  {
                    type: "text",
                    text: `฿${summary.ytd.total.toLocaleString()}`,
                    size: "lg",
                    weight: "bold",
                    flex: 3,
                  },
                  {
                    type: "text",
                    text: `${summary.ytd.count} ${locale === "th" ? "ใบ" : "receipts"}`,
                    size: "sm",
                    color: "#888888",
                    align: "end",
                    flex: 2,
                    gravity: "bottom",
                  },
                ],
              },
            ],
            margin: "lg",
          },
        ],
        paddingAll: "20px",
      },
      footer: {
        type: "box",
        layout: "horizontal",
        contents: [
          {
            type: "button",
            style: "secondary",
            action: {
              type: "message",
              label: locale === "th" ? "ส่งใบเสร็จ" : "Submit Receipt",
              text: "/receipt",
            },
            flex: 1,
          },
        ],
        spacing: "sm",
      },
    },
  };
}

export function buildReceiptHelpFlex(locale: "th" | "en"): object {
  return {
    type: "flex",
    altText: locale === "th" ? "วิธีใช้งานใบเสร็จ" : "Receipt Help",
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "🧾",
            size: "3xl",
            align: "center",
          },
          {
            type: "text",
            text: locale === "th" ? "บันทึกใบเสร็จ" : "Receipt Tracking",
            size: "lg",
            weight: "bold",
            align: "center",
            margin: "md",
          },
          {
            type: "separator",
            margin: "lg",
          },
          {
            type: "text",
            text: locale === "th" ? "📸 วิธีใช้งาน:" : "📸 How to use:",
            size: "sm",
            weight: "bold",
            margin: "lg",
          },
          {
            type: "text",
            text: locale === "th"
              ? "1. ถ่ายรูปใบเสร็จแล้วส่งมาในแชท\n2. AI จะอ่านข้อมูลให้อัตโนมัติ\n3. ตรวจสอบและแก้ไขถ้าจำเป็น"
              : "1. Take a photo of your receipt\n2. AI will extract data automatically\n3. Review and edit if needed",
            size: "xs",
            color: "#666666",
            wrap: true,
            margin: "sm",
          },
          {
            type: "separator",
            margin: "lg",
          },
          {
            type: "text",
            text: locale === "th" ? "📋 คำสั่ง:" : "📋 Commands:",
            size: "sm",
            weight: "bold",
            margin: "lg",
          },
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: locale === "th"
                  ? "/สรุปใบเสร็จ - ดูสรุปเดือนนี้\n/ธุรกิจ - จัดการธุรกิจ"
                  : "/receiptsummary - View monthly summary\n/businesses - Manage businesses",
                size: "xs",
                color: "#666666",
                wrap: true,
              },
            ],
            margin: "sm",
          },
        ],
        paddingAll: "20px",
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            action: {
              type: "message",
              label: locale === "th" ? "ดูสรุป" : "View Summary",
              text: "/receiptsummary",
            },
          },
        ],
      },
    },
  };
}

export function buildBusinessSelectQuickReply(
  businesses: any[],
  locale: "th" | "en"
): object {
  const items = businesses.slice(0, 10).map((b) => ({
    type: "action",
    action: {
      type: "postback",
      label: b.name.length > 20 ? b.name.substring(0, 17) + "..." : b.name,
      data: `action=select_business&business_id=${b.id}`,
      displayText: b.name,
    },
  }));

  return {
    items,
  };
}
