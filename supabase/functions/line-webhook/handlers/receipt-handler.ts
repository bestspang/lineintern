/**
 * Receipt Handler for LINE Webhook
 * Handles receipt image submissions and commands
 */

import { createClient } from "npm:@supabase/supabase-js@2";
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
  vendor_address?: string;
  tax_id?: string;
  receipt_number?: string;
  date?: string;
  total?: number;
  currency?: string;
  category?: string;
  payment_method?: string;
  card_number_masked?: string;
  items?: Array<{
    name: string;
    quantity: number | null;
    unit: string | null;
    unit_price: number | null;
    amount: number;
  }>;
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

interface ReceiptApprover {
  id: string;
  type: 'user' | 'group';
  line_user_id: string | null;
  group_id: string | null;
  branch_id: string | null;
  display_name: string | null;
  is_active: boolean;
  priority: number;
}

interface SubmitterInfo {
  name: string;
  branch: string | null;
  lineUserId: string;
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
// Group Permission Check
// =============================

/**
 * Check if a LINE group is allowed to submit receipts
 * IMPORTANT: This function strictly follows collection_mode setting:
 * - "mapped" mode: Only groups in receipt_group_mappings with is_enabled=true are allowed
 * - "centralized" mode: Only the designated centralized group is allowed
 * - DMs (no group) are always allowed
 */
export async function canGroupSubmitReceipts(lineGroupId: string | null): Promise<boolean> {
  // DMs (no group) are always allowed
  if (!lineGroupId) {
    console.log("[canGroupSubmitReceipts] DM - allowed");
    return true;
  }

  console.log(`[canGroupSubmitReceipts] Checking group: ${lineGroupId}`);

  try {
    // Check if system is enabled
    const { data: systemSetting } = await supabase
      .from("receipt_settings")
      .select("setting_value")
      .eq("setting_key", "system_enabled")
      .single();

    if (systemSetting && !(systemSetting.setting_value as { enabled?: boolean }).enabled) {
      console.log("[canGroupSubmitReceipts] System is disabled");
      return false;
    }

    // Get internal group ID first
    const { data: group } = await supabase
      .from("groups")
      .select("id, display_name")
      .eq("line_group_id", lineGroupId)
      .single();

    if (!group) {
      console.log("[canGroupSubmitReceipts] Group not found in DB - REJECTED");
      return false;
    }

    console.log(`[canGroupSubmitReceipts] Internal group ID: ${group.id}, name: ${group.display_name}`);

    // Check collection mode
    const { data: modeSetting } = await supabase
      .from("receipt_settings")
      .select("setting_value")
      .eq("setting_key", "collection_mode")
      .single();

    const modeConfig = modeSetting?.setting_value as { mode?: string; centralized_group_id?: string | null } | null;
    const collectionMode = modeConfig?.mode || 'mapped';
    
    console.log(`[canGroupSubmitReceipts] Collection mode: ${collectionMode}`);

    // CENTRALIZED MODE: Only the designated group can submit
    if (collectionMode === 'centralized') {
      if (!modeConfig?.centralized_group_id) {
        console.log("[canGroupSubmitReceipts] Centralized mode but no group configured - REJECTED");
        return false;
      }

      const isAllowed = group.id === modeConfig.centralized_group_id;
      console.log(`[canGroupSubmitReceipts] Centralized mode check: ${isAllowed ? 'ALLOWED' : 'REJECTED'}`);
      return isAllowed;
    }

    // MAPPED MODE: Only check receipt_group_mappings table (NO FALLBACK!)
    const { data: mapping } = await supabase
      .from("receipt_group_mappings")
      .select("is_enabled, branch_id")
      .eq("group_id", group.id)
      .eq("is_enabled", true)
      .maybeSingle();

    if (mapping) {
      console.log(`[canGroupSubmitReceipts] Group enabled via mapping (branch: ${mapping.branch_id}) - ALLOWED`);
      return true;
    }

    // NOT in mapping = NOT allowed (no fallback to enabled_groups!)
    console.log(`[canGroupSubmitReceipts] Group NOT in receipt_group_mappings - REJECTED`);
    return false;
  } catch (error) {
    console.error("[canGroupSubmitReceipts] Error:", error);
    return false; // Default to deny on error for security
  }
}

// Result type for branch lookup
interface BranchInfo {
  branchId: string | null;
  branchSource: 'group_mapping' | 'submitter' | null;
}

/**
 * Get branch ID(s) from LINE group ID using receipt_group_mappings
 * Also returns the source of the branch information
 */
export async function getBranchFromGroup(
  lineGroupId: string | null,
  lineUserId?: string
): Promise<BranchInfo> {
  try {
    // Check collection mode first
    const { data: modeSetting } = await supabase
      .from("receipt_settings")
      .select("setting_value")
      .eq("setting_key", "collection_mode")
      .single();

    if (modeSetting) {
      const modeConfig = modeSetting.setting_value as { 
        mode?: string; 
        centralized_group_id?: string | null;
        track_submitter_branch?: boolean;
      };
      
      if (modeConfig.mode === 'centralized') {
        // Check if we should track submitter's branch
        if (modeConfig.track_submitter_branch && lineUserId) {
          console.log("[getBranchFromGroup] Centralized mode with submitter tracking");
          
          // Lookup employee by line_user_id
          const { data: employee } = await supabase
            .from("employees")
            .select("branch_id, primary_branch_id")
            .eq("line_user_id", lineUserId)
            .eq("is_active", true)
            .single();
          
          if (employee) {
            const branchId = employee.primary_branch_id || employee.branch_id || null;
            if (branchId) {
              console.log(`[getBranchFromGroup] Found submitter branch: ${branchId}`);
              return { branchId, branchSource: 'submitter' };
            }
          }
          
          console.log("[getBranchFromGroup] Submitter not found or has no branch");
        }
        
        // Centralized mode without tracking or submitter not found = no branch tagging
        console.log("[getBranchFromGroup] Centralized mode - no branch tagging");
        return { branchId: null, branchSource: null };
      }
    }

    // For DMs (no group) and not centralized mode, no branch can be assigned
    if (!lineGroupId) return { branchId: null, branchSource: null };

    // Check if auto-assign is enabled
    const { data: setting } = await supabase
      .from("receipt_settings")
      .select("setting_value")
      .eq("setting_key", "auto_assign_branch")
      .single();

    if (!setting || !(setting.setting_value as { enabled?: boolean }).enabled) {
      return { branchId: null, branchSource: null };
    }

    // Get internal group ID
    const { data: group } = await supabase
      .from("groups")
      .select("id")
      .eq("line_group_id", lineGroupId)
      .single();

    if (!group) return { branchId: null, branchSource: null };

    // Get branch mapping from receipt_group_mappings
    const { data: mapping } = await supabase
      .from("receipt_group_mappings")
      .select("branch_id")
      .eq("group_id", group.id)
      .eq("is_enabled", true)
      .not("branch_id", "is", null)
      .order("priority", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (mapping?.branch_id) {
      return { branchId: mapping.branch_id, branchSource: 'group_mapping' };
    }

    // Fallback: Check branches.line_group_id for backwards compatibility
    const { data: branch } = await supabase
      .from("branches")
      .select("id")
      .eq("line_group_id", lineGroupId)
      .maybeSingle();

    if (branch?.id) {
      return { branchId: branch.id, branchSource: 'group_mapping' };
    }

    return { branchId: null, branchSource: null };
  } catch (error) {
    console.error("[getBranchFromGroup] Error:", error);
    return { branchId: null, branchSource: null };
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

export async function setDefaultBusiness(
  lineUserId: string,
  businessName: string,
  locale: "th" | "en"
): Promise<{ success: boolean; message: string }> {
  // Find business by name (case insensitive partial match)
  const { data: businesses } = await supabase
    .from("receipt_businesses")
    .select("*")
    .eq("line_user_id", lineUserId);

  if (!businesses || businesses.length === 0) {
    return {
      success: false,
      message: locale === "th"
        ? "❌ คุณยังไม่มีธุรกิจ กรุณาส่งใบเสร็จก่อนเพื่อสร้างธุรกิจ"
        : "❌ You have no businesses yet. Please submit a receipt first.",
    };
  }

  // Find matching business
  const matchedBusiness = businesses.find((b: any) =>
    b.name.toLowerCase().includes(businessName.toLowerCase())
  );

  if (!matchedBusiness) {
    const businessList = businesses.map((b: any) => b.name).join(", ");
    return {
      success: false,
      message: locale === "th"
        ? `❌ ไม่พบธุรกิจชื่อ "${businessName}"\n\nธุรกิจของคุณ: ${businessList}`
        : `❌ Business "${businessName}" not found.\n\nYour businesses: ${businessList}`,
    };
  }

  // Clear current default
  await supabase
    .from("receipt_businesses")
    .update({ is_default: false })
    .eq("line_user_id", lineUserId);

  // Set new default
  await supabase
    .from("receipt_businesses")
    .update({ is_default: true })
    .eq("id", matchedBusiness.id);

  return {
    success: true,
    message: locale === "th"
      ? `✅ ตั้งค่า "${matchedBusiness.name}" เป็นธุรกิจเริ่มต้นแล้ว`
      : `✅ Set "${matchedBusiness.name}" as default business`,
  };
}

export async function exportReceiptsForMonth(
  lineUserId: string,
  monthArg: string,
  locale: "th" | "en"
): Promise<{ success: boolean; message: string }> {
  // Parse month argument - support formats: "2026-01", "01", "มกราคม", "january"
  let year: number;
  let month: number;
  const now = getBangkokNow();

  const thaiMonths: Record<string, number> = {
    "มกราคม": 1, "กุมภาพันธ์": 2, "มีนาคม": 3, "เมษายน": 4,
    "พฤษภาคม": 5, "มิถุนายน": 6, "กรกฎาคม": 7, "สิงหาคม": 8,
    "กันยายน": 9, "ตุลาคม": 10, "พฤศจิกายน": 11, "ธันวาคม": 12,
  };
  const enMonths: Record<string, number> = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7,
    "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
  };

  if (!monthArg) {
    // Default to current month
    year = now.getFullYear();
    month = now.getMonth() + 1;
  } else if (/^\d{4}-\d{2}$/.test(monthArg)) {
    // Format: 2026-01
    [year, month] = monthArg.split("-").map(Number);
  } else if (/^\d{2}$/.test(monthArg)) {
    // Format: 01 (month only, assume current year)
    year = now.getFullYear();
    month = parseInt(monthArg, 10);
  } else if (thaiMonths[monthArg]) {
    year = now.getFullYear();
    month = thaiMonths[monthArg];
  } else if (enMonths[monthArg.toLowerCase()]) {
    year = now.getFullYear();
    month = enMonths[monthArg.toLowerCase()];
  } else {
    return {
      success: false,
      message: locale === "th"
        ? `❌ รูปแบบเดือนไม่ถูกต้อง\n\nตัวอย่าง:\n• /export 2026-01\n• /export มกราคม\n• /export january`
        : `❌ Invalid month format\n\nExamples:\n• /export 2026-01\n• /export january\n• /export jan`,
    };
  }

  // Fetch receipts for the month
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-31`;

  const { data: receipts, error } = await supabase
    .from("receipts")
    .select("*")
    .eq("line_user_id", lineUserId)
    .neq("status", "deleted")
    .gte("receipt_date", startDate)
    .lte("receipt_date", endDate)
    .order("receipt_date", { ascending: true });

  if (error) {
    console.error("[exportReceiptsForMonth] Error:", error);
    return {
      success: false,
      message: locale === "th" ? "❌ เกิดข้อผิดพลาด" : "❌ An error occurred",
    };
  }

  if (!receipts || receipts.length === 0) {
    const monthName = locale === "th"
      ? Object.keys(thaiMonths).find((k) => thaiMonths[k] === month) || `${month}`
      : Object.keys(enMonths).find((k) => enMonths[k] === month && k.length > 3) || `${month}`;

    return {
      success: true,
      message: locale === "th"
        ? `📋 ไม่พบใบเสร็จในเดือน${monthName} ${year}`
        : `📋 No receipts found for ${monthName} ${year}`,
    };
  }

  // Calculate summary
  const totalAmount = receipts.reduce((sum: number, r: any) => sum + (r.total || 0), 0);
  const categories: Record<string, { count: number; total: number }> = {};

  receipts.forEach((r: any) => {
    const cat = r.category || (locale === "th" ? "อื่นๆ" : "Other");
    if (!categories[cat]) categories[cat] = { count: 0, total: 0 };
    categories[cat].count++;
    categories[cat].total += r.total || 0;
  });

  // Build summary message
  const monthName = locale === "th"
    ? Object.keys(thaiMonths).find((k) => thaiMonths[k] === month) || `${month}`
    : Object.keys(enMonths).find((k) => enMonths[k] === month && k.length > 3) || `${month}`;

  let categoryBreakdown = Object.entries(categories)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([cat, data]) => `• ${cat}: ฿${data.total.toLocaleString()} (${data.count})`)
    .join("\n");

  const message = locale === "th"
    ? `📊 สรุปใบเสร็จ ${monthName} ${year}\n\n` +
      `📄 จำนวน: ${receipts.length} ใบ\n` +
      `💰 รวม: ฿${totalAmount.toLocaleString()}\n\n` +
      `📁 แยกตามหมวดหมู่:\n${categoryBreakdown}\n\n` +
      `💡 ดูรายละเอียดเพิ่มเติมที่ Menu → ใบเสร็จ`
    : `📊 Receipt Summary - ${monthName} ${year}\n\n` +
      `📄 Count: ${receipts.length} receipts\n` +
      `💰 Total: ฿${totalAmount.toLocaleString()}\n\n` +
      `📁 By Category:\n${categoryBreakdown}\n\n` +
      `💡 View details in Menu → Receipts`;

  return { success: true, message };
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
  businessId?: string,
  branchId?: string | null,
  branchSource?: 'group_mapping' | 'submitter' | null
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
        branchId: branchId || null,
        branchSource: branchSource || null,
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
      vendor_address: result.receipt?.vendor_address,
      tax_id: result.receipt?.tax_id,
      receipt_number: result.receipt?.receipt_number,
      date: result.receipt?.date,
      total: result.receipt?.total,
      currency: result.receipt?.currency,
      category: result.receipt?.category,
      payment_method: result.receipt?.payment_method,
      card_number_masked: result.receipt?.card_number_masked,
      items: result.receipt?.items,
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
// Approval System Functions
// =============================

/**
 * Get all active receipt approvers
 */
export async function getReceiptApprovers(branchId?: string): Promise<ReceiptApprover[]> {
  let query = supabase
    .from("receipt_approvers")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: false });

  // Optionally filter by branch
  if (branchId) {
    query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[getReceiptApprovers] Error:", error);
    return [];
  }
  return (data || []) as ReceiptApprover[];
}

/**
 * Check if submission group is same as any approver group (fallback to in-group behavior)
 */
export async function isSameGroupApproval(submissionGroupId: string | null): Promise<boolean> {
  if (!submissionGroupId) return false;
  
  const { data: group } = await supabase
    .from("groups")
    .select("id")
    .eq("line_group_id", submissionGroupId)
    .single();
  
  if (!group) return false;
  
  const { data: approver } = await supabase
    .from("receipt_approvers")
    .select("id")
    .eq("type", "group")
    .eq("group_id", group.id)
    .eq("is_active", true)
    .maybeSingle();
  
  return !!approver;
}

/**
 * Send approval notifications to USER approvers only via DM
 * IMPORTANT: Does NOT send to group approvers - only individual users
 * @param imageUrl - URL of the receipt image to include in the Flex Message
 */
export async function sendApprovalNotifications(
  result: ReceiptResult,
  submitterInfo: SubmitterInfo,
  locale: "th" | "en",
  liffUrl?: string,
  imageUrl?: string
): Promise<void> {
  const approvers = await getReceiptApprovers();
  
  // Check notification target setting
  const { data: notificationSetting } = await supabase
    .from("receipt_settings")
    .select("setting_value")
    .eq("setting_key", "approval_notification_target")
    .single();
  
  const targetConfig = notificationSetting?.setting_value as { target?: string } | null;
  const notificationTarget = targetConfig?.target || 'users_only';
  
  // Filter approvers based on setting
  let targetApprovers: ReceiptApprover[];
  if (notificationTarget === 'users_and_groups') {
    // Include both users and groups
    targetApprovers = approvers.filter(a => 
      (a.type === 'user' && a.line_user_id) || 
      (a.type === 'group' && a.group_id)
    );
    console.log(`[sendApprovalNotifications] Target: users_and_groups - ${targetApprovers.length} approvers`);
  } else {
    // Default: users only
    targetApprovers = approvers.filter(a => a.type === 'user' && a.line_user_id);
    console.log(`[sendApprovalNotifications] Target: users_only - ${targetApprovers.length} user approvers (${approvers.length - targetApprovers.length} group approvers skipped)`);
  }
  
  if (targetApprovers.length === 0) {
    console.log("[sendApprovalNotifications] No approvers to notify");
    return;
  }

  const flexMessage = buildApproverFlexMessage(result, submitterInfo, locale, liffUrl, imageUrl);
  const notifiedTo: string[] = [];

  for (const approver of targetApprovers) {
    try {
      if (approver.type === 'user' && approver.line_user_id) {
        // Send DM to user
        await sendLineMessage(approver.line_user_id, [flexMessage]);
        notifiedTo.push(approver.line_user_id);
        console.log(`[sendApprovalNotifications] Sent DM to user: ${approver.display_name || approver.line_user_id}`);
      } else if (approver.type === 'group' && approver.group_id) {
        // Send to group (need to get line_group_id)
        const { data: group } = await supabase
          .from("groups")
          .select("line_group_id")
          .eq("id", approver.group_id)
          .single();
        
        if (group?.line_group_id) {
          await sendLineMessage(group.line_group_id, [flexMessage]);
          notifiedTo.push(group.line_group_id);
          console.log(`[sendApprovalNotifications] Sent to group: ${approver.display_name}`);
        }
      }
    } catch (error) {
      console.error(`[sendApprovalNotifications] Error sending to approver ${approver.display_name}:`, error);
    }
  }

  // Update receipt with notification info
  if (result.receiptId && notifiedTo.length > 0) {
    await supabase
      .from("receipts")
      .update({ notification_sent_to: notifiedTo })
      .eq("id", result.receiptId);
  }
}

/**
 * Send LINE message helper
 */
async function sendLineMessage(to: string, messages: object[]): Promise<void> {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to, messages }),
  });
}

/**
 * Build Flex Message for approvers (with Edit button)
 * Includes all receipt details: image, vendor, items, payment, warnings
 */
export function buildApproverFlexMessage(
  result: ReceiptResult,
  submitterInfo: SubmitterInfo,
  locale: "th" | "en",
  liffUrl?: string,
  imageUrl?: string
): object {
  const hasWarnings = result.warnings && result.warnings.length > 0;

  const contents: any[] = [
    { type: "text", text: "🧾", size: "xxl", align: "center" },
    {
      type: "text",
      text: locale === "th" ? "ใบเสร็จรอตรวจสอบ" : "Receipt Pending Review",
      size: "lg", weight: "bold", align: "center", margin: "md",
      color: hasWarnings ? "#FF9800" : "#333333",
    },
    { type: "separator", margin: "lg" },
    
    // Submitter info
    {
      type: "box", layout: "horizontal", margin: "lg",
      contents: [
        { type: "text", text: locale === "th" ? "ผู้ส่ง:" : "From:", size: "sm", color: "#888888", flex: 1 },
        { type: "text", text: submitterInfo.name, size: "sm", weight: "bold", flex: 2, wrap: true },
      ],
    },
  ];

  if (submitterInfo.branch) {
    contents.push({
      type: "box", layout: "horizontal", margin: "sm",
      contents: [
        { type: "text", text: locale === "th" ? "สาขา:" : "Branch:", size: "sm", color: "#888888", flex: 1 },
        { type: "text", text: submitterInfo.branch, size: "sm", flex: 2 },
      ],
    });
  }

  // Vendor section
  if (result.vendor) {
    contents.push({ type: "separator", margin: "lg" });
    contents.push({ type: "text", text: result.vendor, size: "md", weight: "bold", margin: "lg", wrap: true });
  }

  // Vendor address
  if (result.vendor_address) {
    contents.push({
      type: "text",
      text: result.vendor_address,
      size: "xs",
      color: "#666666",
      wrap: true,
      margin: "sm",
    });
  }

  // Tax ID & Receipt Number
  if (result.tax_id || result.receipt_number) {
    const taxReceiptParts: string[] = [];
    if (result.tax_id) taxReceiptParts.push(`TAX: ${result.tax_id}`);
    if (result.receipt_number) taxReceiptParts.push(`#${result.receipt_number}`);
    
    contents.push({
      type: "text",
      text: taxReceiptParts.join(" | "),
      size: "xs",
      color: "#888888",
      margin: "sm",
    });
  }

  // Items list
  if (result.items && result.items.length > 0) {
    contents.push({ type: "separator", margin: "lg" });

    // Items header
    contents.push({
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: locale === "th" ? "รายการ" : "Item", size: "xs", color: "#888888", flex: 4 },
        { type: "text", text: locale === "th" ? "ราคา" : "Price", size: "xs", color: "#888888", flex: 1, align: "end" },
      ],
      margin: "md",
    });

    // Show up to 5 items
    const itemsToShow = result.items.slice(0, 5);
    itemsToShow.forEach(item => {
      const qtyText = item.quantity && item.unit 
        ? `${item.quantity} ${item.unit}` 
        : item.quantity 
          ? `x${item.quantity}` 
          : "";
      
      contents.push({
        type: "box",
        layout: "horizontal",
        contents: [
          { 
            type: "text", 
            text: qtyText ? `${item.name} (${qtyText})` : item.name, 
            size: "sm", 
            flex: 4, 
            wrap: true 
          },
          { 
            type: "text", 
            text: `฿${item.amount.toLocaleString()}`, 
            size: "sm", 
            flex: 1, 
            align: "end" 
          },
        ],
        margin: "sm",
      });
    });

    // Show "and X more..." if there are more items
    if (result.items.length > 5) {
      contents.push({
        type: "text",
        text: locale === "th" 
          ? `... และอีก ${result.items.length - 5} รายการ` 
          : `... and ${result.items.length - 5} more`,
        size: "xs",
        color: "#888888",
        margin: "sm",
      });
    }
  }

  // Total
  contents.push({ type: "separator", margin: "lg" });
  
  if (result.total) {
    contents.push({
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: locale === "th" ? "รวม" : "Total", size: "lg", weight: "bold" },
        { type: "text", text: `฿${result.total.toLocaleString()}`, size: "lg", weight: "bold", align: "end" },
      ],
      margin: "md",
    });
  }

  // Date
  if (result.date) {
    contents.push({
      type: "text",
      text: `📅 ${result.date}`,
      size: "xs",
      color: "#888888",
      align: "end",
      margin: "sm",
    });
  }

  // Payment info
  if (result.payment_method || result.card_number_masked) {
    const paymentParts: string[] = [];
    if (result.payment_method) paymentParts.push(result.payment_method);
    if (result.card_number_masked) paymentParts.push(result.card_number_masked);
    
    contents.push({
      type: "text",
      text: `💳 ${paymentParts.join(" ")}`,
      size: "xs",
      color: "#888888",
      align: "end",
      margin: "xs",
    });
  }

  // Category
  if (result.category) {
    contents.push({
      type: "text",
      text: `📁 ${result.category}`,
      size: "xs",
      color: "#888888",
      align: "end",
      margin: "xs",
    });
  }

  // Warnings
  if (hasWarnings) {
    contents.push({ type: "separator", margin: "lg" });
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
  const actions: any[] = [
    {
      type: "button", style: "primary",
      action: { type: "postback", label: locale === "th" ? "✓ อนุมัติ" : "✓ Approve", data: `action=approve_receipt&receipt_id=${result.receiptId}` },
    },
  ];

  if (liffUrl && result.receiptId) {
    actions.push({
      type: "button", style: hasWarnings ? "primary" : "secondary",
      action: { type: "uri", label: locale === "th" ? "✏️ แก้ไข" : "✏️ Edit", uri: `${liffUrl}/portal/receipts/${result.receiptId}` },
    });
  }

  actions.push({
    type: "button", style: "secondary",
    action: { type: "postback", label: locale === "th" ? "📷 ขอถ่ายใหม่" : "📷 Retake", data: `action=request_retake&receipt_id=${result.receiptId}` },
  });

  // Reject button
  actions.push({
    type: "button", style: "secondary", color: "#DC2626",
    action: { type: "postback", label: locale === "th" ? "✗ ไม่อนุมัติ" : "✗ Reject", data: `action=reject_receipt&receipt_id=${result.receiptId}` },
  });

  // Not Receipt button
  actions.push({
    type: "button", style: "secondary", color: "#6B7280",
    action: { type: "postback", label: locale === "th" ? "📷 ไม่ใช่ใบเสร็จ" : "📷 Not Receipt", data: `action=mark_not_receipt&receipt_id=${result.receiptId}` },
  });

  actions.push({
    type: "button", style: "secondary",
    action: { type: "postback", label: locale === "th" ? "🗑 ลบ" : "🗑 Delete", data: `action=delete_receipt&receipt_id=${result.receiptId}` },
  });

  // Build bubble with optional hero image
  const bubble: any = {
    type: "bubble", 
    size: "mega",
    body: { type: "box", layout: "vertical", contents, paddingAll: "20px" },
    footer: { type: "box", layout: "vertical", contents: actions, spacing: "sm" },
  };

  // Add hero image if available
  if (imageUrl) {
    bubble.hero = {
      type: "image",
      url: imageUrl,
      size: "full",
      aspectRatio: "4:3",
      aspectMode: "cover",
      action: {
        type: "uri",
        uri: imageUrl,
      },
    };
  }

  return {
    type: "flex",
    altText: locale === "th" ? "ใบเสร็จรอตรวจสอบ" : "Receipt Pending Review",
    contents: bubble,
  };
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

  // Vendor (full name)
  if (result.vendor) {
    contents.push({
      type: "text",
      text: result.vendor,
      size: "md",
      weight: "bold",
      align: "center",
      margin: "lg",
      wrap: true,
    });
  }

  // Address
  if (result.vendor_address) {
    contents.push({
      type: "text",
      text: result.vendor_address,
      size: "xs",
      color: "#666666",
      align: "center",
      wrap: true,
      margin: "sm",
    });
  }

  // Tax ID & Receipt Number
  if (result.tax_id || result.receipt_number) {
    const taxReceiptParts: string[] = [];
    if (result.tax_id) taxReceiptParts.push(`TAX: ${result.tax_id}`);
    if (result.receipt_number) taxReceiptParts.push(`#${result.receipt_number}`);
    
    contents.push({
      type: "text",
      text: taxReceiptParts.join(" | "),
      size: "xs",
      color: "#888888",
      align: "center",
      margin: "sm",
    });
  }

  // Items list
  if (result.items && result.items.length > 0) {
    contents.push({
      type: "separator",
      margin: "lg",
    });

    // Items header
    contents.push({
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: locale === "th" ? "รายการ" : "Item", size: "xs", color: "#888888", flex: 4 },
        { type: "text", text: locale === "th" ? "ราคา" : "Price", size: "xs", color: "#888888", flex: 1, align: "end" },
      ],
      margin: "md",
    });

    // Show up to 5 items
    const itemsToShow = result.items.slice(0, 5);
    itemsToShow.forEach(item => {
      const qtyText = item.quantity && item.unit 
        ? `${item.quantity} ${item.unit}` 
        : item.quantity 
          ? `x${item.quantity}` 
          : "";
      
      contents.push({
        type: "box",
        layout: "horizontal",
        contents: [
          { 
            type: "text", 
            text: qtyText ? `${item.name} (${qtyText})` : item.name, 
            size: "sm", 
            flex: 4, 
            wrap: true 
          },
          { 
            type: "text", 
            text: `฿${item.amount.toLocaleString()}`, 
            size: "sm", 
            flex: 1, 
            align: "end" 
          },
        ],
        margin: "sm",
      });
    });

    // Show "and X more..." if there are more items
    if (result.items.length > 5) {
      contents.push({
        type: "text",
        text: locale === "th" 
          ? `... และอีก ${result.items.length - 5} รายการ` 
          : `... and ${result.items.length - 5} more`,
        size: "xs",
        color: "#888888",
        margin: "sm",
      });
    }
  }

  // Total
  contents.push({
    type: "separator",
    margin: "lg",
  });
  
  if (result.total) {
    contents.push({
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: locale === "th" ? "รวม" : "Total", size: "lg", weight: "bold" },
        { type: "text", text: `฿${result.total.toLocaleString()}`, size: "lg", weight: "bold", align: "end" },
      ],
      margin: "md",
    });
  }

  // Date
  if (result.date) {
    contents.push({
      type: "text",
      text: `📅 ${result.date}`,
      size: "xs",
      color: "#888888",
      align: "end",
      margin: "sm",
    });
  }

  // Payment info
  if (result.payment_method || result.card_number_masked) {
    const paymentParts: string[] = [];
    if (result.payment_method) paymentParts.push(result.payment_method);
    if (result.card_number_masked) paymentParts.push(result.card_number_masked);
    
    contents.push({
      type: "text",
      text: `💳 ${paymentParts.join(" ")}`,
      size: "xs",
      color: "#888888",
      align: "end",
      margin: "xs",
    });
  }

  // Category
  if (result.category) {
    contents.push({
      type: "text",
      text: `📁 ${result.category}`,
      size: "xs",
      color: "#888888",
      align: "end",
      margin: "xs",
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
  
  // Confirm button (postback)
  actions.push({
    type: "button",
    style: hasWarnings ? "secondary" : "primary",
    action: {
      type: "postback",
      label: locale === "th" ? "✓ ยืนยัน" : "✓ Confirm",
      data: `action=confirm_receipt&receipt_id=${result.receiptId}`,
      displayText: locale === "th" ? "ยืนยันใบเสร็จ" : "Confirm receipt",
    },
  });
  
  // Edit button - opens portal
  if (liffUrl && result.receiptId) {
    actions.push({
      type: "button",
      style: hasWarnings ? "primary" : "secondary",
      action: {
        type: "uri",
        label: locale === "th" ? "✏️ แก้ไข" : "✏️ Edit",
        uri: `${liffUrl}/portal/receipts/${result.receiptId}`,
      },
    });
  }
  
  // Delete button (postback)
  actions.push({
    type: "button",
    style: "secondary",
    action: {
      type: "postback",
      label: locale === "th" ? "🗑 ลบ" : "🗑 Delete",
      data: `action=delete_receipt&receipt_id=${result.receiptId}`,
      displayText: locale === "th" ? "ลบใบเสร็จ" : "Delete receipt",
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
                  ? "/สรุปใบเสร็จ - ดูสรุปเดือนนี้\n/เดือนนี้ - สรุปเดือนปัจจุบัน\n/ส่งออก [เดือน] - ส่งออก CSV\n/ตั้งค่าเริ่มต้น [ชื่อ] - ตั้งธุรกิจหลัก\n/ธุรกิจ - จัดการธุรกิจ"
                  : "/receiptsummary - View monthly summary\n/thismonth - Current month stats\n/export [month] - Export CSV\n/setdefault [name] - Set default business\n/businesses - Manage businesses",
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

// =============================
// Postback Handlers
// =============================

export async function handleReceiptPostback(
  postbackData: string,
  lineUserId: string,
  locale: "th" | "en"
): Promise<{ handled: boolean; message: string }> {
  const params = new URLSearchParams(postbackData);
  const action = params.get("action");
  const receiptId = params.get("receipt_id");
  const businessId = params.get("business_id");

  console.log(`[handleReceiptPostback] action=${action}, receiptId=${receiptId}, businessId=${businessId}`);

  // Handle confirm receipt
  if (action === "confirm_receipt" && receiptId) {
    const { error } = await supabase
      .from("receipts")
      .update({
        status: "saved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", receiptId)
      .eq("line_user_id", lineUserId);

    if (error) {
      console.error("[handleReceiptPostback] Error confirming receipt:", error);
      return {
        handled: true,
        message: locale === "th" ? "❌ เกิดข้อผิดพลาด" : "❌ Error occurred",
      };
    }

    return {
      handled: true,
      message: locale === "th"
        ? "✅ ยืนยันใบเสร็จเรียบร้อยแล้ว"
        : "✅ Receipt confirmed successfully",
    };
  }

  // Handle delete receipt
  if (action === "delete_receipt" && receiptId) {
    const { error } = await supabase
      .from("receipts")
      .update({
        status: "deleted",
        updated_at: new Date().toISOString(),
      })
      .eq("id", receiptId)
      .eq("line_user_id", lineUserId);

    if (error) {
      console.error("[handleReceiptPostback] Error deleting receipt:", error);
      return {
        handled: true,
        message: locale === "th" ? "❌ เกิดข้อผิดพลาด" : "❌ Error occurred",
      };
    }

    return {
      handled: true,
      message: locale === "th"
        ? "🗑 ลบใบเสร็จเรียบร้อยแล้ว"
        : "🗑 Receipt deleted successfully",
    };
  }

  // Handle select business
  if (action === "select_business" && businessId) {
    // Store selected business for pending receipt (if any)
    const { data: pendingReceipt } = await supabase
      .from("receipts")
      .select("id")
      .eq("line_user_id", lineUserId)
      .is("business_id", null)
      .eq("status", "processed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingReceipt) {
      await supabase
        .from("receipts")
        .update({ business_id: businessId })
        .eq("id", pendingReceipt.id);
    }

    // Get business name
    const { data: business } = await supabase
      .from("receipt_businesses")
      .select("name")
      .eq("id", businessId)
      .single();

    return {
      handled: true,
      message: locale === "th"
        ? `✅ เลือกธุรกิจ "${business?.name || ""}" แล้ว`
        : `✅ Selected business "${business?.name || ""}"`,
    };
  }

  // Handle approve receipt (by approver)
  if (action === "approve_receipt" && receiptId) {
    // Get approver info
    const { data: approver } = await supabase
      .from("users")
      .select("display_name")
      .eq("line_user_id", lineUserId)
      .maybeSingle();

    const { data: receipt, error: receiptError } = await supabase
      .from("receipts")
      .select("line_user_id, vendor, total")
      .eq("id", receiptId)
      .single();

    if (receiptError || !receipt) {
      console.error("[handleReceiptPostback] Receipt not found:", receiptError);
      return {
        handled: true,
        message: locale === "th" ? "❌ ไม่พบใบเสร็จ" : "❌ Receipt not found",
      };
    }

    const { error } = await supabase
      .from("receipts")
      .update({
        status: "approved",
        approval_status: "approved",
        approved_by: lineUserId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", receiptId);

    if (error) {
      console.error("[handleReceiptPostback] Error approving receipt:", error);
      return {
        handled: true,
        message: locale === "th" ? "❌ เกิดข้อผิดพลาด" : "❌ Error occurred",
      };
    }

    // Log approval with correct column names
    await supabase.from("receipt_approval_logs").insert({
      receipt_id: receiptId,
      action: "approved",
      actioned_by_line_user_id: lineUserId,
      actioned_by_name: approver?.display_name || null,
      notes: `Approved by ${approver?.display_name || lineUserId}`,
    });

    // Notify submitter if different from approver
    if (receipt.line_user_id && receipt.line_user_id !== lineUserId) {
      await sendLineMessage(receipt.line_user_id, [{
        type: "text",
        text: locale === "th"
          ? `✅ อนุมัติแล้ว: ใบเสร็จ ${receipt.vendor || ""} (฿${receipt.total?.toLocaleString() || 0})`
          : `✅ Approved: Receipt ${receipt.vendor || ""} (฿${receipt.total?.toLocaleString() || 0})`,
      }]);
    }

    return {
      handled: true,
      message: locale === "th"
        ? "✅ อนุมัติใบเสร็จเรียบร้อยแล้ว"
        : "✅ Receipt approved successfully",
    };
  }

  // Handle request retake (by approver)
  if (action === "request_retake" && receiptId) {
    const { data: receipt, error: receiptError } = await supabase
      .from("receipts")
      .select("line_user_id, vendor")
      .eq("id", receiptId)
      .single();

    if (receiptError || !receipt) {
      console.error("[handleReceiptPostback] Receipt not found:", receiptError);
      return {
        handled: true,
        message: locale === "th" ? "❌ ไม่พบใบเสร็จ" : "❌ Receipt not found",
      };
    }

    // Get approver info
    const { data: approver } = await supabase
      .from("users")
      .select("display_name")
      .eq("line_user_id", lineUserId)
      .maybeSingle();

    // Update status
    const { error } = await supabase
      .from("receipts")
      .update({
        status: "retake_requested",
        approval_status: "retake_requested",
        submitter_notified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", receiptId);

    if (error) {
      console.error("[handleReceiptPostback] Error requesting retake:", error);
      return {
        handled: true,
        message: locale === "th" ? "❌ เกิดข้อผิดพลาด" : "❌ Error occurred",
      };
    }

    // Log with correct column names
    await supabase.from("receipt_approval_logs").insert({
      receipt_id: receiptId,
      action: "retake_requested",
      actioned_by_line_user_id: lineUserId,
      actioned_by_name: approver?.display_name || null,
      notes: `Retake requested by ${approver?.display_name || lineUserId}`,
    });

    // Notify submitter
    if (receipt.line_user_id) {
      await sendLineMessage(receipt.line_user_id, [{
        type: "text",
        text: locale === "th"
          ? `📷 กรุณาถ่ายใบเสร็จใหม่: ${receipt.vendor || "ไม่ทราบชื่อร้าน"}\nเหตุผล: รูปไม่ชัดหรือข้อมูลไม่ครบ`
          : `📷 Please retake receipt: ${receipt.vendor || "Unknown"}\nReason: Image unclear or incomplete data`,
      }]);
    }

    return {
      handled: true,
      message: locale === "th"
        ? "📷 ส่งคำขอถ่ายใหม่เรียบร้อยแล้ว"
        : "📷 Retake request sent successfully",
    };
  }

  // Handle reject receipt (by approver)
  if (action === "reject_receipt" && receiptId) {
    const { data: approver } = await supabase
      .from("users")
      .select("display_name")
      .eq("line_user_id", lineUserId)
      .maybeSingle();

    const { data: receipt, error: receiptError } = await supabase
      .from("receipts")
      .select("line_user_id, vendor, total")
      .eq("id", receiptId)
      .single();

    if (receiptError || !receipt) {
      console.error("[handleReceiptPostback] Receipt not found:", receiptError);
      return {
        handled: true,
        message: locale === "th" ? "❌ ไม่พบใบเสร็จ" : "❌ Receipt not found",
      };
    }

    // Update receipt status
    const { error } = await supabase
      .from("receipts")
      .update({
        status: "rejected",
        approval_status: "rejected",
        approved_by: lineUserId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", receiptId);

    if (error) {
      console.error("[handleReceiptPostback] Error rejecting receipt:", error);
      return {
        handled: true,
        message: locale === "th" ? "❌ เกิดข้อผิดพลาด" : "❌ Error occurred",
      };
    }

    // Log rejection with correct column names
    await supabase.from("receipt_approval_logs").insert({
      receipt_id: receiptId,
      action: "rejected",
      actioned_by_line_user_id: lineUserId,
      actioned_by_name: approver?.display_name || null,
      notes: `Rejected by ${approver?.display_name || lineUserId}`,
    });

    // Notify submitter
    if (receipt.line_user_id && receipt.line_user_id !== lineUserId) {
      await sendLineMessage(receipt.line_user_id, [{
        type: "text",
        text: locale === "th"
          ? `❌ ไม่อนุมัติ: ใบเสร็จ ${receipt.vendor || ""} (฿${receipt.total?.toLocaleString() || 0})`
          : `❌ Rejected: Receipt ${receipt.vendor || ""} (฿${receipt.total?.toLocaleString() || 0})`,
      }]);
    }

    return {
      handled: true,
      message: locale === "th"
        ? "❌ ไม่อนุมัติใบเสร็จแล้ว"
        : "❌ Receipt rejected",
    };
  }

  // Handle mark as not a receipt (by approver)
  if (action === "mark_not_receipt" && receiptId) {
    const { data: approver } = await supabase
      .from("users")
      .select("display_name")
      .eq("line_user_id", lineUserId)
      .maybeSingle();

    const { data: receipt, error: receiptError } = await supabase
      .from("receipts")
      .select("line_user_id, vendor")
      .eq("id", receiptId)
      .single();

    if (receiptError || !receipt) {
      console.error("[handleReceiptPostback] Receipt not found:", receiptError);
      return {
        handled: true,
        message: locale === "th" ? "❌ ไม่พบใบเสร็จ" : "❌ Receipt not found",
      };
    }

    // Update receipt status to invalid_image
    const { error } = await supabase
      .from("receipts")
      .update({
        status: "invalid_image",
        approval_status: "not_receipt",
        approved_by: lineUserId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", receiptId);

    if (error) {
      console.error("[handleReceiptPostback] Error marking not receipt:", error);
      return {
        handled: true,
        message: locale === "th" ? "❌ เกิดข้อผิดพลาด" : "❌ Error occurred",
      };
    }

    // Log action
    await supabase.from("receipt_approval_logs").insert({
      receipt_id: receiptId,
      action: "marked_not_receipt",
      actioned_by_line_user_id: lineUserId,
      actioned_by_name: approver?.display_name || null,
      notes: `Marked as not a receipt by ${approver?.display_name || lineUserId}`,
    });

    // Notify submitter
    if (receipt.line_user_id && receipt.line_user_id !== lineUserId) {
      await sendLineMessage(receipt.line_user_id, [{
        type: "text",
        text: locale === "th"
          ? `📷 รูปที่ส่งไม่ใช่ใบเสร็จ กรุณาส่งรูปใบเสร็จใหม่\nรูป: ${receipt.vendor || "(ไม่ทราบ)"}`
          : `📷 The image sent is not a receipt. Please send a valid receipt image.\nImage: ${receipt.vendor || "(Unknown)"}`,
      }]);
    }

    return {
      handled: true,
      message: locale === "th"
        ? "📷 ระบุว่าไม่ใช่ใบเสร็จแล้ว"
        : "📷 Marked as not a receipt",
    };
  }

  return { handled: false, message: "" };
}

// =============================
// Image URL Helper
// =============================

/**
 * Get the public URL of a receipt image from storage
 */
export async function getReceiptImageUrl(receiptId: string): Promise<string | null> {
  try {
    // First try to get from receipt_files
    const { data: file } = await supabase
      .from("receipt_files")
      .select("storage_path")
      .eq("receipt_id", receiptId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (file?.storage_path) {
      const { data } = supabase.storage
        .from("receipt-files")
        .getPublicUrl(file.storage_path);
      return data?.publicUrl || null;
    }

    // Fallback: check if receipt has photo_url stored directly
    const { data: receipt } = await supabase
      .from("receipts")
      .select("photo_url")
      .eq("id", receiptId)
      .single();

    if (receipt?.photo_url) {
      return receipt.photo_url;
    }

    return null;
  } catch (error) {
    console.error("[getReceiptImageUrl] Error:", error);
    return null;
  }
}

/**
 * Get user display name from users table
 */
export async function getUserDisplayName(lineUserId: string): Promise<string | null> {
  const { data } = await supabase
    .from("users")
    .select("display_name")
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  return data?.display_name || null;
}

/**
 * Get branch name by ID
 */
export async function getBranchName(branchId: string | null): Promise<string | null> {
  if (!branchId) return null;
  const { data } = await supabase
    .from("branches")
    .select("name")
    .eq("id", branchId)
    .single();
  return data?.name || null;
}
