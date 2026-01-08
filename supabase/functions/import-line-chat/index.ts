import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Branch detection by name patterns (more reliable than code)
const BRANCH_PATTERNS = [
  { pattern: /อีสต์วิลล์|อีสวิลล์|eastville|east\s*ville/i, code: 'CED', name: 'เซ็นทรัลอีสต์วิลล์' },
  { pattern: /ภูเก็ต|phuket/i, code: 'CTP', name: 'เซ็นทรัลภูเก็ต' },
  { pattern: /สยาม|siam|sqc/i, code: 'SQC', name: 'สยามเซ็นเตอร์' },
  { pattern: /ควอเท|emq|เอ็ม/i, code: 'EMQ', name: 'เอ็มควอเทียร์' },
  { pattern: /พาร์ค|ปาร์ค|ดุสิต|dusit|park|cdp/i, code: 'CDP', name: 'เซ็นทรัลปาร์ค ดุสิต' },
];

// Branch code mapping (fallback)
const BRANCH_MAPPING: Record<string, { code: string; name: string }> = {
  'CDP': { code: 'CDP', name: 'เซ็นทรัลปาร์ค ดุสิต' },
  'SQC': { code: 'SQC', name: 'สยามเซ็นเตอร์' },
  'EMQ': { code: 'EMQ', name: 'เอ็มควอเทียร์' },
  'CTP': { code: 'CTP', name: 'เซ็นทรัลภูเก็ต' },
  'CED': { code: 'CED', name: 'เซ็นทรัลอีสต์วิลล์' },
};

interface ParsedReport {
  report_date: string;
  branch_code: string;
  branch_name: string;
  sales: number | null;
  sales_target: number | null;
  diff_target: number | null;
  diff_target_percent: number | null;
  tc: number | null;
  cup_size_s: number | null;
  cup_size_m: number | null;
  top_lemonade: string[];
  top_slurpee: string[];
  raw_message_text: string;
}

// Parse Thai year format (68 -> 2025, 69 -> 2026)
function parseThaiDate(dateStr: string): string | null {
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return null;
  
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  let year = parseInt(match[3], 10);
  
  // Handle Thai Buddhist year (2568 = 2025) or short year (68 = 2025)
  if (year >= 2500) {
    year = year - 543; // Buddhist to Western
  } else if (year >= 60 && year <= 99) {
    year = 2000 + (year - 43); // 68 -> 2025
  } else if (year <= 30) {
    year = 2000 + year; // 25 -> 2025
  }
  
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  
  return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

// Parse number from text (handles commas and trailing characters like -, .-)
function parseNumber(text: string): number | null {
  if (!text) return null;
  // Remove commas, trailing dash, .-, and other non-numeric chars except . and -
  const cleaned = text.replace(/,/g, '').replace(/\.?-$/, '').replace(/[^\d.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Clean report text - remove timestamps, usernames, and quotes from LINE export
function cleanReportText(text: string): string {
  let cleaned = text;
  // Remove LINE chat timestamp patterns: "10:25PM Bow Yonlada " or "9:30AM Username "
  cleaned = cleaned.replace(/^\d{1,2}:\d{2}(?:AM|PM)\s+\S+(?:\s+\S+)?\s+/gim, '');
  // Remove enclosing quotes
  cleaned = cleaned.replace(/^"|"$/gm, '');
  // Remove quoted lines that wrap the entire content
  cleaned = cleaned.replace(/^"(.+)"$/s, '$1');
  return cleaned;
}

// Detect branch from name patterns (more reliable than code)
function detectBranchFromText(text: string): { code: string; name: string } | null {
  // First try to extract branch name from the field "ชื่อสาขา : XXX"
  const branchNameMatch = text.match(/ชื่อสาขา\s*:?\s*([^\n\r]+)/i);
  const searchText = branchNameMatch ? branchNameMatch[1] : text;
  
  // Try each pattern
  for (const { pattern, code, name } of BRANCH_PATTERNS) {
    if (pattern.test(searchText)) {
      return { code, name };
    }
  }
  
  // Fallback: try to extract code and use mapping
  const codeMatch = text.match(/Code\s*สาขา\s*:?\s*(\w+)/i);
  if (codeMatch) {
    const code = codeMatch[1].toUpperCase();
    if (BRANCH_MAPPING[code]) {
      return BRANCH_MAPPING[code];
    }
  }
  
  return null;
}

// Parse a single report block
function parseReportBlock(text: string, headerDate?: string): ParsedReport | null {
  // Clean the text first
  const cleanedText = cleanReportText(text);
  
  // Detect branch from name patterns (more reliable than code)
  const branch = detectBranchFromText(cleanedText);
  if (!branch) return null;
  
  // Extract date
  const dateMatch = cleanedText.match(/(?:ว(?:ันที่)?\s*:?\s*)(\d{1,2}\/\d{1,2}\/\d{2,4})/i) ||
                    cleanedText.match(/Date\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  let reportDate = dateMatch ? parseThaiDate(dateMatch[1]) : null;
  
  // If date parsing failed, use header date
  if (!reportDate && headerDate) {
    reportDate = headerDate;
  }
  
  if (!reportDate) return null;
  
  // Extract sales - handle various formats: "Sales: 1,234", "Sales:\n1,234", "Sales 1234-"
  const salesMatch = cleanedText.match(/Sales\s*:?\s*[\n\r]?\s*([\d,]+)(?:\s*\.?-)?/i);
  const sales = salesMatch ? parseNumber(salesMatch[1]) : null;
  
  // Extract sales target - handle: "Sales Target: 8,000", "Sales Target:\n3,515-"
  const targetMatch = cleanedText.match(/Sales\s*Target\s*:?\s*[\n\r]?\s*([\d,]+)(?:\s*\.?-)?/i);
  const salesTarget = targetMatch ? parseNumber(targetMatch[1]) : null;
  
  // Extract diff target (number and percentage)
  const diffMatch = cleanedText.match(/Diff\s*[Tt]arget\s*:?\s*[\n\r]?\s*([+-]?[\d,]+)\s*[\/|]?\s*([+-]?[\d.]+)\s*%?/i);
  const diffTarget = diffMatch ? parseNumber(diffMatch[1]) : null;
  const diffTargetPercent = diffMatch ? parseNumber(diffMatch[2]) : null;
  
  // Extract TC
  const tcMatch = cleanedText.match(/TC\s*:?\s*[\n\r]?\s*(\d+)/i);
  const tc = tcMatch ? parseInt(tcMatch[1], 10) : null;
  
  // Extract cup sizes
  const sizeSMatch = cleanedText.match(/(?:แก้ว)?\s*[Ss]ize\s*[Ss]\s*[=:]\s*(\d+)/i) ||
                     cleanedText.match(/Size\s*S\s*[|:]?\s*(\d+)/i);
  const sizeMMatch = cleanedText.match(/(?:แก้ว)?\s*[Ss]ize\s*[Mm]\s*[=:]\s*(\d+)/i) ||
                     cleanedText.match(/Size\s*M\s*[|:]?\s*(\d+)/i);
  const cupSizeS = sizeSMatch ? parseInt(sizeSMatch[1], 10) : null;
  const cupSizeM = sizeMMatch ? parseInt(sizeMMatch[1], 10) : null;
  
  // Extract top products (simplified)
  const topLemonade: string[] = [];
  const topSlurpee: string[] = [];
  
  // Look for lemonade/slurpee items
  const lemonadeMatches = cleanedText.matchAll(/\d\.\s*([A-Za-z\s]+(?:Lemon(?:ade|nade)?|Slurpee|Slush))/gi);
  for (const match of lemonadeMatches) {
    const product = match[1].trim();
    if (product.toLowerCase().includes('slurp') || product.toLowerCase().includes('slush')) {
      if (topSlurpee.length < 3 && !topSlurpee.includes(product)) {
        topSlurpee.push(product);
      }
    } else if (topLemonade.length < 3 && !topLemonade.includes(product)) {
      topLemonade.push(product);
    }
  }
  
  return {
    report_date: reportDate,
    branch_code: branch.code,
    branch_name: branch.name,
    sales,
    sales_target: salesTarget,
    diff_target: diffTarget,
    diff_target_percent: diffTargetPercent,
    tc,
    cup_size_s: cupSizeS,
    cup_size_m: cupSizeM,
    top_lemonade: topLemonade,
    top_slurpee: topSlurpee,
    raw_message_text: text.substring(0, 2000),
  };
}

// Parse chat header date (format: "Sun, 01/04/2026" or "# Tue, 09/30/2025")
function parseChatHeaderDate(line: string): string | null {
  const match = line.match(/(?:#\s*)?(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  
  const month = match[1];
  const day = match[2];
  const year = match[3];
  
  return `${year}-${month}-${day}`;
}

// Main parsing function
function parseLineChatExport(content: string): ParsedReport[] {
  const reports: ParsedReport[] = [];
  const lines = content.split('\n');
  
  let currentHeaderDate: string | null = null;
  let currentBlock = '';
  let inReportBlock = false;
  
  // Pattern to detect start of a report block
  const reportStartPatterns = [
    /Code\s*สาขา/i,
    /ชื่อสาขา\s*:/i,
    /Sales\s*:?\s*[\n\r]?\s*[\d,]+/i,
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for chat header date
    const headerDate = parseChatHeaderDate(line);
    if (headerDate) {
      currentHeaderDate = headerDate;
      continue;
    }
    
    // Detect start of a report block
    const isReportStart = reportStartPatterns.some(p => p.test(line));
    
    if (isReportStart || (line.includes('Code') && line.toLowerCase().includes('สาขา'))) {
      // If we were already in a block, parse it first
      if (inReportBlock && currentBlock.trim()) {
        const report = parseReportBlock(currentBlock, currentHeaderDate || undefined);
        if (report) reports.push(report);
      }
      // Start new block
      currentBlock = line + '\n';
      inReportBlock = true;
      continue;
    }
    
    // Check for table-formatted reports (markdown style)
    if (line.includes('| ') && (line.includes('CDP') || line.includes('SQC') || 
        line.includes('EMQ') || line.includes('CTP') || line.includes('CED'))) {
      // Parse table row
      const cells = line.split('|').map(c => c.trim()).filter(c => c);
      if (cells.length >= 5) {
        const branchCode = cells[0];
        if (BRANCH_MAPPING[branchCode]) {
          const dateStr = cells[2] || '';
          const salesStr = cells[3] || '';
          const targetStr = cells[4] || '';
          const diffStr = cells[5] || '';
          const tcStr = cells[6] || '';
          
          const reportDate = parseThaiDate(dateStr) || currentHeaderDate;
          if (reportDate) {
            const branch = BRANCH_MAPPING[branchCode];
            reports.push({
              report_date: reportDate,
              branch_code: branch.code,
              branch_name: branch.name,
              sales: parseNumber(salesStr),
              sales_target: parseNumber(targetStr),
              diff_target: parseNumber(diffStr.split('/')[0] || ''),
              diff_target_percent: parseNumber(diffStr.split('/')[1] || ''),
              tc: parseNumber(tcStr),
              cup_size_s: null,
              cup_size_m: null,
              top_lemonade: [],
              top_slurpee: [],
              raw_message_text: line,
            });
          }
        }
      }
      continue;
    }
    
    // Continue accumulating block
    if (inReportBlock) {
      currentBlock += line + '\n';
      
      // End block on certain patterns (but allow more lines for content)
      if (line.includes('[Photo]') || line.includes('[Sticker]') || 
          (line.match(/^\d{1,2}:\d{2}(?:AM|PM)\s/) && !line.includes('Sales')) ||
          (line.startsWith('#') && !line.includes('Merchandise') && !line.includes('Top'))) {
        const report = parseReportBlock(currentBlock, currentHeaderDate || undefined);
        if (report) reports.push(report);
        currentBlock = '';
        inReportBlock = false;
      }
    }
  }
  
  // Parse any remaining block
  if (inReportBlock && currentBlock.trim()) {
    const report = parseReportBlock(currentBlock, currentHeaderDate || undefined);
    if (report) reports.push(report);
  }
  
  // Deduplicate by branch_code + report_date (keep last one)
  const uniqueReports = new Map<string, ParsedReport>();
  for (const report of reports) {
    const key = `${report.branch_code}_${report.report_date}`;
    uniqueReports.set(key, report);
  }
  
  return Array.from(uniqueReports.values());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { content, dryRun = true } = await req.json();
    
    if (!content) {
      return new Response(JSON.stringify({ error: 'Content is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Parsing LINE chat export (${content.length} characters)...`);
    
    const reports = parseLineChatExport(content);
    
    console.log(`Found ${reports.length} reports`);
    
    // Log sample for debugging
    if (reports.length > 0) {
      console.log('Sample report:', JSON.stringify(reports[0]));
    }

    if (dryRun) {
      // Return preview without saving
      const summary = {
        totalReports: reports.length,
        byBranch: {} as Record<string, number>,
        dateRange: { from: '', to: '' },
        sampleReports: reports.slice(0, 5),
      };
      
      for (const r of reports) {
        summary.byBranch[r.branch_name] = (summary.byBranch[r.branch_name] || 0) + 1;
      }
      
      const dates = reports.map(r => r.report_date).sort();
      summary.dateRange.from = dates[0] || '';
      summary.dateRange.to = dates[dates.length - 1] || '';
      
      return new Response(JSON.stringify({
        success: true,
        dryRun: true,
        summary,
        reports,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Actually insert/upsert the data
    let inserted = 0;
    let errors: string[] = [];
    
    for (const report of reports) {
      const { error } = await supabase
        .from('branch_daily_reports')
        .upsert({
          branch_code: report.branch_code,
          branch_name: report.branch_name,
          report_date: report.report_date,
          sales: report.sales,
          sales_target: report.sales_target,
          diff_target: report.diff_target,
          diff_target_percent: report.diff_target_percent,
          tc: report.tc,
          cup_size_s: report.cup_size_s,
          cup_size_m: report.cup_size_m,
          top_lemonade: report.top_lemonade.length > 0 ? report.top_lemonade : null,
          top_slurpee: report.top_slurpee.length > 0 ? report.top_slurpee : null,
          raw_message_text: report.raw_message_text,
          parsed_at: new Date().toISOString(),
        }, {
          onConflict: 'report_date,branch_code,branch_name',
          ignoreDuplicates: false,
        });
      
      if (error) {
        errors.push(`${report.branch_name} ${report.report_date}: ${error.message}`);
        console.error('Insert error:', error);
      } else {
        inserted++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      dryRun: false,
      inserted,
      total: reports.length,
      errors: errors.slice(0, 10),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
