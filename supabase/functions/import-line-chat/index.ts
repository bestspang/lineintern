import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Branch code to name mapping (normalized)
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
  // Format: DD/MM/YY (Thai year)
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})/);
  if (!match) return null;
  
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const thaiYear = parseInt(match[3], 10);
  
  // Convert Thai year to Western year
  // 68 = 2568 = 2025, 69 = 2569 = 2026
  let year: number;
  if (thaiYear >= 60 && thaiYear <= 99) {
    year = 1900 + thaiYear + 543; // Buddhist era calculation: 68 -> 2025
    if (year > 2500) year -= 543; // Adjust if needed
    // Actually: 68 -> 2025, 69 -> 2026
    year = thaiYear <= 30 ? 2000 + thaiYear : 1900 + thaiYear + 57;
  } else if (thaiYear <= 30) {
    year = 2000 + thaiYear;
  } else {
    year = 2000 + thaiYear;
  }
  
  // Fix: 68 = 2025, 69 = 2026
  if (thaiYear === 68) year = 2025;
  else if (thaiYear === 69) year = 2026;
  else if (thaiYear >= 60) year = 2000 + (thaiYear - 43); // 68-43=25 -> 2025
  else year = 2000 + thaiYear;
  
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  
  const monthStr = month.toString().padStart(2, '0');
  const dayStr = day.toString().padStart(2, '0');
  
  return `${year}-${monthStr}-${dayStr}`;
}

// Parse number from text (handles commas)
function parseNumber(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/,/g, '').replace(/[^\\d.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Extract branch code from text
function extractBranchCode(text: string): string | null {
  const match = text.match(/Code\s*สาขา\s*:\s*(\w+)/i);
  return match ? match[1].toUpperCase() : null;
}

// Parse a single report block
function parseReportBlock(text: string, headerDate?: string): ParsedReport | null {
  const branchCode = extractBranchCode(text);
  if (!branchCode || !BRANCH_MAPPING[branchCode]) return null;
  
  // Extract date
  const dateMatch = text.match(/(?:ว(?:ันที่)?\s*:?\s*)(\d{1,2}\/\d{1,2}\/\d{2})/i) ||
                    text.match(/Date\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2})/i);
  let reportDate = dateMatch ? parseThaiDate(dateMatch[1]) : null;
  
  // If date parsing failed, use header date
  if (!reportDate && headerDate) {
    reportDate = headerDate;
  }
  
  if (!reportDate) return null;
  
  // Extract sales
  const salesMatch = text.match(/Sales\s*:?\s*([\d,]+)/i);
  const sales = salesMatch ? parseNumber(salesMatch[1]) : null;
  
  // Extract sales target
  const targetMatch = text.match(/Sales\s*Target\s*:?\s*([\d,]+)/i);
  const salesTarget = targetMatch ? parseNumber(targetMatch[1]) : null;
  
  // Extract diff target (number and percentage)
  const diffMatch = text.match(/Diff\s*[Tt]arget\s*:?\s*([+-]?[\d,]+)\s*\/?\s*([+-]?[\d.]+)\s*%?/i);
  const diffTarget = diffMatch ? parseNumber(diffMatch[1]) : null;
  const diffTargetPercent = diffMatch ? parseNumber(diffMatch[2]) : null;
  
  // Extract TC
  const tcMatch = text.match(/TC\s*:?\s*(\d+)/i);
  const tc = tcMatch ? parseInt(tcMatch[1], 10) : null;
  
  // Extract cup sizes
  const sizeSMatch = text.match(/(?:แก้ว)?\s*[Ss]ize\s*[Ss]\s*[=:]\s*(\d+)/i) ||
                     text.match(/Size\s*S\s*\|?\s*(\d+)/i);
  const sizeMMatch = text.match(/(?:แก้ว)?\s*[Ss]ize\s*[Mm]\s*[=:]\s*(\d+)/i) ||
                     text.match(/Size\s*M\s*\|?\s*(\d+)/i);
  const cupSizeS = sizeSMatch ? parseInt(sizeSMatch[1], 10) : null;
  const cupSizeM = sizeMMatch ? parseInt(sizeMMatch[1], 10) : null;
  
  // Extract top products (simplified)
  const topLemonade: string[] = [];
  const topSlurpee: string[] = [];
  
  // Look for lemonade/slurpee items
  const lemonadeMatches = text.matchAll(/\d\.\s*([A-Za-z\s]+Lemon(?:ade|nade)?)/gi);
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
  
  const branch = BRANCH_MAPPING[branchCode];
  
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
    raw_message_text: text.substring(0, 2000), // Limit raw text
  };
}

// Parse chat header date (format: \"Sun, 01/04/2026\" or \"# Tue, 09/30/2025\")
function parseChatHeaderDate(line: string): string | null {
  // Format: \"# Tue, 09/30/2025\" or \"Sun, 01/04/2026\"
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
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for chat header date
    const headerDate = parseChatHeaderDate(line);
    if (headerDate) {
      currentHeaderDate = headerDate;
      continue;
    }
    
    // Detect start of a report block
    if (line.includes('Code') && line.toLowerCase().includes('สาขา')) {
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
      
      // End block on certain patterns
      if (line.includes('[Photo]') || line.includes('[Sticker]') || 
          line.includes('PM ') || line.includes('AM ') ||
          (line.startsWith('#') && !line.includes('Merchandise'))) {
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
      errors: errors.slice(0, 10), // Limit error messages
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

