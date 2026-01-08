import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedReport {
  branch_code: string;
  branch_name: string;
  report_date: string;
  sales: number | null;
  sales_target: number | null;
  diff_target: number | null;
  diff_target_percent: number | null;
  tc: number | null;
  stock_lemon: number | null;
  top_lemonade: string[] | null;
  top_slurpee: string[] | null;
  cup_size_s: number | null;
  cup_size_m: number | null;
  lineman_orders: number | null;
  dried_lemon: number | null;
  chili_salt: number | null;
  honey_bottle: number | null;
  snacks: number | null;
  bottled_water: number | null;
  merchandise_sold: any | null;
  raw_message_text: string;
}

// Split content into report blocks
function splitIntoReportBlocks(content: string): string[] {
  // Clean the content first
  let cleaned = content
    .replace(/^\uFEFF/, '') // Remove BOM
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Split by "Code สาขา" pattern
  const blocks: string[] = [];
  const regex = /(?:^|\n)(?:"|")?Code\s*สาขา/gi;
  let match;

  // Find all matches
  const matches: number[] = [];
  while ((match = regex.exec(cleaned)) !== null) {
    matches.push(match.index);
  }

  // Extract blocks between matches
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i];
    const end = i + 1 < matches.length ? matches[i + 1] : cleaned.length;
    const block = cleaned.slice(start, end).trim();
    if (block.length > 50) { // Minimum length for a valid report
      blocks.push(block);
    }
  }

  console.log(`Split into ${blocks.length} report blocks`);
  return blocks;
}

// Call AI to parse reports
async function parseReportsWithAI(blocks: string[]): Promise<ParsedReport[]> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY is not configured');
  }

  const systemPrompt = `คุณเป็น parser สำหรับรายงานยอดขายสาขา Goodchoose จาก LINE chat

รูปแบบรายงาน:
- Code สาขา : XXX
- ชื่อสาขา : ชื่อ
- วันที่ : DD/MM/YY (ปี พ.ศ. 2 หลัก เช่น 69 = 2569 = 2026)
- Sales : ยอดขาย (อาจมี comma)
- Sales Target : เป้า
- Diff target: ส่วนต่าง / เปอร์เซ็นต์
- TC : จำนวนลูกค้า
- Stock lemon : สต็อกมะนาว
- เมนูน้ำเลม่อนที่ขายดี 3 อันดับ
- น้ำสเลอปี้ที่ขายดี 3 อย่าง
- แก้ว size s/m
- เลมอนอบแห้ง
- พริกเกลือ
- น้ำผึ้งขวด
- ขนม
- น้ำขวด
- Lineman orders

Branch Mapping (ใช้ชื่อมาตรฐานเสมอ):
- CDP = เซ็นทรัลพาร์ค ดุสิต
- SQC = สยามสแควร์วัน
- EMQ = เอ็มควอเทียร์
- CTP = เซ็นทรัลภูเก็ต
- CED = เซ็นทรัลอีสต์วิลล์

สำคัญมาก:
1. แปลงวันที่จาก DD/MM/YY (พ.ศ.) เป็น YYYY-MM-DD (ค.ศ.)
   - ปี 69 = 2026, ปี 68 = 2025, ปี 67 = 2024
   - ตัวอย่าง: 07/01/69 -> 2026-01-07
2. ถ้า sales มี comma เช่น 1,624 ให้แปลงเป็นตัวเลข 1624
3. ถ้า diff_target เป็นค่าลบ ให้ใส่เครื่องหมายลบ
4. ถ้าหาข้อมูลไม่เจอ ให้ใส่ null
5. ใช้ branch_name มาตรฐานจาก Branch Mapping เสมอ`;

  const tool = {
    type: "function",
    function: {
      name: "save_reports",
      description: "บันทึกรายงานยอดขายที่ parse แล้ว",
      parameters: {
        type: "object",
        properties: {
          reports: {
            type: "array",
            items: {
              type: "object",
              properties: {
                branch_code: { type: "string" },
                branch_name: { type: "string" },
                report_date: { type: "string", description: "YYYY-MM-DD format" },
                sales: { type: "number", nullable: true },
                sales_target: { type: "number", nullable: true },
                diff_target: { type: "number", nullable: true },
                diff_target_percent: { type: "number", nullable: true },
                tc: { type: "number", nullable: true },
                stock_lemon: { type: "number", nullable: true },
                top_lemonade: { type: "array", items: { type: "string" }, nullable: true },
                top_slurpee: { type: "array", items: { type: "string" }, nullable: true },
                cup_size_s: { type: "number", nullable: true },
                cup_size_m: { type: "number", nullable: true },
                dried_lemon: { type: "number", nullable: true },
                chili_salt: { type: "number", nullable: true },
                honey_bottle: { type: "number", nullable: true },
                snacks: { type: "number", nullable: true },
                bottled_water: { type: "number", nullable: true },
                lineman_orders: { type: "number", nullable: true }
              },
              required: ["branch_code", "branch_name", "report_date"]
            }
          }
        },
        required: ["reports"]
      }
    }
  };

  const userMessage = `Parse รายงานต่อไปนี้ (${blocks.length} รายงาน):

${blocks.map((block, i) => `--- รายงานที่ ${i + 1} ---\n${block}`).join('\n\n')}`;

  console.log(`Sending ${blocks.length} blocks to AI for parsing...`);

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "save_reports" } }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('AI API error:', response.status, errorText);
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  console.log('AI response received');

  // Extract tool call result
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.function.name !== 'save_reports') {
    console.error('No valid tool call in response:', JSON.stringify(data));
    throw new Error('AI did not return expected tool call');
  }

  const parsedData = JSON.parse(toolCall.function.arguments);
  console.log(`AI parsed ${parsedData.reports?.length || 0} reports`);

  return parsedData.reports || [];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { content, dryRun = false } = await req.json();

    if (!content || typeof content !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Content is required and must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing content: ${content.length} characters`);

    // Step 1: Split into report blocks
    const blocks = splitIntoReportBlocks(content);
    
    if (blocks.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No report blocks found in content',
          hint: 'Make sure the content contains reports with "Code สาขา" pattern'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Process in batches (10 reports per batch to avoid token limits)
    const BATCH_SIZE = 10;
    const allReports: ParsedReport[] = [];
    const errors: string[] = [];

    for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
      const batch = blocks.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(blocks.length / BATCH_SIZE)}`);
      
      try {
        const parsedReports = await parseReportsWithAI(batch);
        
        // Add raw_message_text to each report
        parsedReports.forEach((report, idx) => {
          report.raw_message_text = batch[idx] || '';
        });
        
        allReports.push(...parsedReports);
      } catch (error) {
        const errMessage = error instanceof Error ? error.message : String(error);
        const errorMsg = `Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${errMessage}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    console.log(`Total parsed reports: ${allReports.length}`);

    // Step 3: Validate and deduplicate
    const validReports = allReports.filter(r => 
      r.branch_code && 
      r.branch_name && 
      r.report_date && 
      /^\d{4}-\d{2}-\d{2}$/.test(r.report_date)
    );

    // Deduplicate by branch_code + report_date
    const uniqueKey = (r: ParsedReport) => `${r.branch_code}_${r.report_date}`;
    const seen = new Set<string>();
    const uniqueReports = validReports.filter(r => {
      const key = uniqueKey(r);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`Valid unique reports: ${uniqueReports.length}`);

    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          dryRun: true,
          summary: {
            totalBlocks: blocks.length,
            parsedReports: allReports.length,
            validReports: validReports.length,
            uniqueReports: uniqueReports.length,
            errors: errors.length
          },
          reports: uniqueReports.map(r => ({
            branch_code: r.branch_code,
            branch_name: r.branch_name,
            report_date: r.report_date,
            sales: r.sales,
            sales_target: r.sales_target,
            diff_target: r.diff_target,
            diff_target_percent: r.diff_target_percent,
            tc: r.tc,
            stock_lemon: r.stock_lemon,
            top_lemonade: r.top_lemonade,
            top_slurpee: r.top_slurpee
          })),
          errors
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 4: Upsert to database
    const insertData = uniqueReports.map(r => ({
      branch_code: r.branch_code,
      branch_name: r.branch_name,
      report_date: r.report_date,
      sales: r.sales,
      sales_target: r.sales_target,
      diff_target: r.diff_target,
      diff_target_percent: r.diff_target_percent,
      tc: r.tc,
      stock_lemon: r.stock_lemon,
      top_lemonade: r.top_lemonade,
      top_slurpee: r.top_slurpee,
      cup_size_s: r.cup_size_s,
      cup_size_m: r.cup_size_m,
      dried_lemon: r.dried_lemon,
      chili_salt: r.chili_salt,
      honey_bottle: r.honey_bottle,
      snacks: r.snacks,
      bottled_water: r.bottled_water,
      lineman_orders: r.lineman_orders,
      raw_message_text: r.raw_message_text,
      parsed_at: new Date().toISOString()
    }));

    const { data: upsertedData, error: upsertError } = await supabase
      .from('branch_daily_reports')
      .upsert(insertData, {
        onConflict: 'branch_code,report_date',
        ignoreDuplicates: false
      })
      .select('id');

    if (upsertError) {
      console.error('Upsert error:', upsertError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Database upsert failed',
          details: upsertError.message,
          parsed: uniqueReports.length
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Successfully upserted ${upsertedData?.length || 0} reports`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          totalBlocks: blocks.length,
          parsedReports: allReports.length,
          validReports: validReports.length,
          uniqueReports: uniqueReports.length,
          insertedReports: upsertedData?.length || 0,
          errors: errors.length
        },
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in import-line-chat:', error);
    const errMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errMessage
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
