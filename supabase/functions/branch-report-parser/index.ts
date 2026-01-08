import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  // Handle formats like "07/01/2568" or "7/1/68"
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return null;
  
  let [, day, month, year] = match;
  
  // Convert Buddhist year to Gregorian
  let numYear = parseInt(year, 10);
  if (numYear > 2500) {
    numYear -= 543; // Full Buddhist year (2568 -> 2025)
  } else if (numYear > 25) {
    numYear = 2000 + numYear - 43; // Short Buddhist year (68 -> 2025)
  } else {
    numYear = 2000 + numYear; // Short Gregorian year (25 -> 2025)
  }
  
  return `${numYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function extractTopSellers(text: string, sectionName: string): string[] {
  const results: string[] = [];
  
  // Find the section
  const sectionPatterns: Record<string, RegExp> = {
    'lemonade': /เมนูน้ำเลม่อนที่ขายดี[^\n]*\n([\s\S]*?)(?=น้ำสเลอปี้|แก้ว|$)/i,
    'slurpee': /น้ำสเลอปี้ที่ขายดี[^\n]*\n([\s\S]*?)(?=แก้ว|เลม่อนแห้ง|$)/i,
  };
  
  const pattern = sectionPatterns[sectionName];
  if (!pattern) return results;
  
  const match = text.match(pattern);
  if (!match) return results;
  
  const section = match[1];
  
  // Extract numbered items (1. xxx, 2. xxx, etc.)
  const itemPattern = /\d+\.\s*([^\n\d]+)/g;
  let itemMatch;
  while ((itemMatch = itemPattern.exec(section)) !== null) {
    const item = itemMatch[1].trim();
    if (item && item.length > 0) {
      results.push(item);
    }
  }
  
  return results.slice(0, 5); // Top 5 only
}

function parseReportMessage(text: string): ParsedReport | null {
  // Check if this is a report message
  if (!REPORT_DETECTION_PATTERN.test(text)) {
    return null;
  }
  
  try {
    // Branch info
    const branchCode = text.match(/Code\s*สาขา\s*:\s*(\w+)/i)?.[1] || '';
    const branchName = text.match(/ชื่อสาขา\s*:\s*([^\n]+)/i)?.[1]?.trim() || '';
    const dateStr = text.match(/วันที่\s*:\s*([\d\/]+)/i)?.[1] || '';
    
    const reportDate = parseThaiDate(dateStr);
    if (!reportDate || !branchCode) {
      console.log('Missing required fields: date or branch code');
      return null;
    }
    
    // Sales metrics
    const sales = parseDecimal(text.match(/Sales\s*:\s*([\d,]+)/i)?.[1]);
    const salesTarget = parseDecimal(text.match(/Sales\s*Target\s*:\s*([\d,]+)/i)?.[1]);
    const diffTarget = sales - salesTarget;
    const diffTargetPercent = salesTarget > 0 ? ((sales - salesTarget) / salesTarget) * 100 : 0;
    
    // TC - handle various formats
    const tc = parseNumber(text.match(/TC\s*:?\s*(\d+)/i)?.[1]);
    
    // Stock
    const stockLemon = parseNumber(text.match(/Stock\s*[Ll]emon\s*:?\s*(\d+)/i)?.[1]);
    
    // Cup sizes - handle various formats
    const cupSizeS = parseNumber(text.match(/แก้ว\s*size\s*s\s*[=:]*\s*(\d+)/i)?.[1] || 
                                  text.match(/size\s*s\s*[=:]*\s*(\d+)/i)?.[1]);
    const cupSizeM = parseNumber(text.match(/แก้ว\s*size\s*m\s*[=:]*\s*(\d+)/i)?.[1] ||
                                  text.match(/size\s*m\s*[=:]*\s*(\d+)/i)?.[1]);
    
    // Additional products
    const driedLemon = parseNumber(text.match(/เลม่อนแห้ง\s*[=:]*\s*(\d+)/i)?.[1]);
    const chiliSalt = parseNumber(text.match(/เกลือพริก\s*[=:]*\s*(\d+)/i)?.[1]);
    const honeyBottle = parseNumber(text.match(/น้ำผึ้ง\s*[=:]*\s*(\d+)/i)?.[1] ||
                                     text.match(/honey\s*[=:]*\s*(\d+)/i)?.[1]);
    const snacks = parseNumber(text.match(/ขนม\s*[=:]*\s*(\d+)/i)?.[1]);
    const bottledWater = parseNumber(text.match(/น้ำเปล่า\s*[=:]*\s*(\d+)/i)?.[1]);
    const linemanOrders = parseNumber(text.match(/[Ll]ine\s*[Mm]an\s*[=:]*\s*(\d+)/i)?.[1]);
    
    // Top sellers
    const topLemonade = extractTopSellers(text, 'lemonade');
    const topSlurpee = extractTopSellers(text, 'slurpee');
    
    // Merchandise - simple extraction
    const merchandiseSold: any[] = [];
    const merchMatch = text.match(/สินค้าที่ขายได้[^\n]*\n([\s\S]*?)(?=\n\n|$)/i);
    if (merchMatch) {
      const merchLines = merchMatch[1].split('\n').filter(l => l.trim());
      merchLines.forEach(line => {
        if (line.trim() && !line.match(/^[-=]+$/)) {
          merchandiseSold.push({ item: line.trim() });
        }
      });
    }
    
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { messageText, messageId, userId, groupId } = await req.json();

    if (!messageText) {
      return new Response(
        JSON.stringify({ error: "messageText is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the report
    const parsed = parseReportMessage(messageText);
    
    if (!parsed) {
      return new Response(
        JSON.stringify({ success: false, message: "Not a valid report message or parsing failed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log('Parsed report:', parsed);

    // Upsert to database
    const { data, error } = await supabase
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
        source_message_id: messageId || null,
        source_group_id: groupId || null,
        reported_by_user_id: userId || null,
        raw_message_text: messageText,
        parsed_at: new Date().toISOString(),
      }, {
        onConflict: 'report_date,branch_code',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    console.log('Saved report:', data?.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        reportId: data?.id,
        parsed: {
          branchCode: parsed.branchCode,
          reportDate: parsed.reportDate,
          sales: parsed.sales,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in branch-report-parser:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
