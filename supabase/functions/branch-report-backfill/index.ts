import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole, authzErrorResponse } from "../_shared/authz.ts";
import { writeAuditLog } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Pattern to detect if a message is a branch report
const REPORT_DETECTION_PATTERN = /Code\s*สาขา\s*:/i;

interface ParsedReport {
  branchCode: string;
  branchName: string;
  reportDate: string;
  sales: number;
  salesTarget: number;
  diffTarget: number;
  diffTargetPercent: number;
  tc: number;
  stockLemon: number;
  cupSizeS: number;
  cupSizeM: number;
  driedLemon: number;
  chiliSalt: number;
  honeyBottle: number;
  snacks: number;
  bottledWater: number;
  linemanOrders: number;
  topLemonade: string[];
  topSlurpee: string[];
  merchandiseSold: any[];
}

function parseNumber(str: string | undefined | null): number {
  if (!str) return 0;
  return parseInt(str.replace(/,/g, ''), 10) || 0;
}

function parseDecimal(str: string | undefined | null): number {
  if (!str) return 0;
  return parseFloat(str.replace(/,/g, '')) || 0;
}

function parseThaiDate(dateStr: string): string | null {
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return null;
  
  let [, day, month, year] = match;
  let numYear = parseInt(year, 10);
  
  if (numYear > 2500) {
    numYear -= 543;
  } else if (numYear > 25) {
    numYear = 2000 + numYear - 43;
  } else {
    numYear = 2000 + numYear;
  }
  
  return `${numYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function extractTopSellers(text: string, sectionName: string): string[] {
  const results: string[] = [];
  
  const sectionPatterns: Record<string, RegExp> = {
    'lemonade': /เมนูน้ำเลม่อนที่ขายดี[^\n]*\n([\s\S]*?)(?=น้ำสเลอปี้|แก้ว|$)/i,
    'slurpee': /น้ำสเลอปี้ที่ขายดี[^\n]*\n([\s\S]*?)(?=แก้ว|เลม่อนแห้ง|$)/i,
  };
  
  const pattern = sectionPatterns[sectionName];
  if (!pattern) return results;
  
  const match = text.match(pattern);
  if (!match) return results;
  
  const section = match[1];
  const itemPattern = /\d+\.\s*([^\n\d]+)/g;
  let itemMatch;
  while ((itemMatch = itemPattern.exec(section)) !== null) {
    const item = itemMatch[1].trim();
    if (item && item.length > 0) {
      results.push(item);
    }
  }
  
  return results.slice(0, 5);
}

function parseReportMessage(text: string): ParsedReport | null {
  if (!REPORT_DETECTION_PATTERN.test(text)) {
    return null;
  }
  
  try {
    const branchCode = text.match(/Code\s*สาขา\s*:\s*(\w+)/i)?.[1] || '';
    const branchName = text.match(/ชื่อสาขา\s*:\s*([^\n]+)/i)?.[1]?.trim() || '';
    const dateStr = text.match(/วันที่\s*:\s*([\d\/]+)/i)?.[1] || '';
    
    const reportDate = parseThaiDate(dateStr);
    if (!reportDate || !branchCode) {
      return null;
    }
    
    const sales = parseDecimal(text.match(/Sales\s*:\s*([\d,]+)/i)?.[1]);
    const salesTarget = parseDecimal(text.match(/Sales\s*Target\s*:\s*([\d,]+)/i)?.[1]);
    const diffTarget = sales - salesTarget;
    const diffTargetPercent = salesTarget > 0 ? ((sales - salesTarget) / salesTarget) * 100 : 0;
    
    const tc = parseNumber(text.match(/TC\s*:?\s*(\d+)/i)?.[1]);
    const stockLemon = parseNumber(text.match(/Stock\s*[Ll]emon\s*:?\s*(\d+)/i)?.[1]);
    
    const cupSizeS = parseNumber(text.match(/แก้ว\s*size\s*s\s*[=:]*\s*(\d+)/i)?.[1] || 
                                  text.match(/size\s*s\s*[=:]*\s*(\d+)/i)?.[1]);
    const cupSizeM = parseNumber(text.match(/แก้ว\s*size\s*m\s*[=:]*\s*(\d+)/i)?.[1] ||
                                  text.match(/size\s*m\s*[=:]*\s*(\d+)/i)?.[1]);
    
    const driedLemon = parseNumber(text.match(/เลม่อนแห้ง\s*[=:]*\s*(\d+)/i)?.[1]);
    const chiliSalt = parseNumber(text.match(/เกลือพริก\s*[=:]*\s*(\d+)/i)?.[1]);
    const honeyBottle = parseNumber(text.match(/น้ำผึ้ง\s*[=:]*\s*(\d+)/i)?.[1] ||
                                     text.match(/honey\s*[=:]*\s*(\d+)/i)?.[1]);
    const snacks = parseNumber(text.match(/ขนม\s*[=:]*\s*(\d+)/i)?.[1]);
    const bottledWater = parseNumber(text.match(/น้ำเปล่า\s*[=:]*\s*(\d+)/i)?.[1]);
    const linemanOrders = parseNumber(text.match(/[Ll]ine\s*[Mm]an\s*[=:]*\s*(\d+)/i)?.[1]);
    
    const topLemonade = extractTopSellers(text, 'lemonade');
    const topSlurpee = extractTopSellers(text, 'slurpee');
    
    const merchandiseSold: any[] = [];
    
    return {
      branchCode,
      branchName,
      reportDate,
      sales,
      salesTarget,
      diffTarget,
      diffTargetPercent,
      tc,
      stockLemon,
      cupSizeS,
      cupSizeM,
      driedLemon,
      chiliSalt,
      honeyBottle,
      snacks,
      bottledWater,
      linemanOrders,
      topLemonade,
      topSlurpee,
      merchandiseSold,
    };
  } catch (error) {
    console.error('Error parsing report:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Phase 0A: backfill jobs are admin/owner/hr only.
    let callerUserId: string | null = null;
    let callerRole: string | null = null;
    try {
      const r = await requireRole(req, ['admin', 'owner', 'hr'], { functionName: 'branch-report-backfill' });
      callerUserId = r.userId;
      callerRole = r.role;
    } catch (e) {
      const r = authzErrorResponse(e, corsHeaders);
      if (r) return r;
      throw e;
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { groupId, groupName, limit = 500, dryRun = false } = await req.json();

    console.log(`Starting backfill for group: ${groupId || groupName}, limit: ${limit}, dryRun: ${dryRun}`);

    // Find the group - use display_name column
    let query = supabase.from('groups').select('id, display_name');
    
    if (groupId) {
      query = query.eq('id', groupId);
    } else if (groupName) {
      query = query.ilike('display_name', `%${groupName}%`);
    } else {
      return new Response(
        JSON.stringify({ error: "Either groupId or groupName is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: groups, error: groupError } = await query;
    
    if (groupError || !groups || groups.length === 0) {
      return new Response(
        JSON.stringify({ error: "Group not found", details: groupError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const group = groups[0];
    console.log(`Found group: ${group.display_name} (${group.id})`);

    // Fetch messages from this group
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('id, text, sent_at, user_id')
      .eq('group_id', group.id)
      .order('sent_at', { ascending: true })
      .limit(limit);

    if (msgError) {
      throw msgError;
    }

    console.log(`Found ${messages?.length || 0} messages to process`);

    const results = {
      total: messages?.length || 0,
      parsed: 0,
      saved: 0,
      skipped: 0,
      errors: 0,
      reports: [] as any[],
    };

    for (const msg of messages || []) {
      if (!msg.text) {
        results.skipped++;
        continue;
      }

      const parsed = parseReportMessage(msg.text);
      
      if (!parsed) {
        results.skipped++;
        continue;
      }

      results.parsed++;

      if (dryRun) {
        results.reports.push({
          messageId: msg.id,
          branchCode: parsed.branchCode,
          reportDate: parsed.reportDate,
          sales: parsed.sales,
        });
        continue;
      }

      // Save to database
      const { error: upsertError } = await supabase
        .from('branch_daily_reports')
        .upsert({
          report_date: parsed.reportDate,
          branch_code: parsed.branchCode,
          branch_name: parsed.branchName,
          sales: parsed.sales,
          sales_target: parsed.salesTarget,
          diff_target: parsed.diffTarget,
          diff_target_percent: parsed.diffTargetPercent,
          tc: parsed.tc,
          stock_lemon: parsed.stockLemon,
          cup_size_s: parsed.cupSizeS,
          cup_size_m: parsed.cupSizeM,
          dried_lemon: parsed.driedLemon,
          chili_salt: parsed.chiliSalt,
          honey_bottle: parsed.honeyBottle,
          snacks: parsed.snacks,
          bottled_water: parsed.bottledWater,
          lineman_orders: parsed.linemanOrders,
          top_lemonade: parsed.topLemonade,
          top_slurpee: parsed.topSlurpee,
          merchandise_sold: parsed.merchandiseSold,
          source_message_id: msg.id,
          source_group_id: group.id,
          reported_by_user_id: msg.user_id,
          raw_message_text: msg.text,
          parsed_at: new Date().toISOString(),
        }, {
          onConflict: 'report_date,branch_code,branch_name',
          ignoreDuplicates: false,
        });

      if (upsertError) {
        console.error('Upsert error:', upsertError);
        results.errors++;
      } else {
        results.saved++;
        results.reports.push({
          branchCode: parsed.branchCode,
          reportDate: parsed.reportDate,
          sales: parsed.sales,
        });
      }
    }

    console.log('Backfill complete:', results);

    return new Response(
      JSON.stringify({ 
        success: true,
        groupName: group.display_name,
        groupId: group.id,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in branch-report-backfill:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
