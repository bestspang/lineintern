import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface ReceiptSummary {
  lineUserId: string;
  displayName: string;
  totalReceipts: number;
  totalAmount: number;
  categoryBreakdown: Record<string, { count: number; amount: number }>;
  topVendors: { vendor: string; count: number; amount: number }[];
}

async function getMonthlyReceiptSummaries(year: number, month: number): Promise<ReceiptSummary[]> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = month === 12 
    ? `${year + 1}-01-01` 
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  console.log(`Fetching receipts from ${startDate} to ${endDate}`);

  // Get all receipts for the month grouped by user
  const { data: receipts, error } = await supabase
    .from('receipts')
    .select('line_user_id, vendor, total, category, receipt_date')
    .gte('receipt_date', startDate)
    .lt('receipt_date', endDate)
    .eq('status', 'saved')
    .not('total', 'is', null);

  if (error) {
    console.error('Error fetching receipts:', error);
    throw error;
  }

  if (!receipts || receipts.length === 0) {
    console.log('No receipts found for this period');
    return [];
  }

  // Group by user
  const userReceipts: Record<string, typeof receipts> = {};
  for (const receipt of receipts) {
    if (!receipt.line_user_id) continue;
    if (!userReceipts[receipt.line_user_id]) {
      userReceipts[receipt.line_user_id] = [];
    }
    userReceipts[receipt.line_user_id].push(receipt);
  }

  // Get user display names from employees table
  const lineUserIds = Object.keys(userReceipts);
  const { data: employees } = await supabase
    .from('employees')
    .select('line_user_id, name')
    .in('line_user_id', lineUserIds);

  const employeeNameMap: Record<string, string> = {};
  employees?.forEach(emp => {
    if (emp.line_user_id) {
      employeeNameMap[emp.line_user_id] = emp.name || 'User';
    }
  });

  // Calculate summaries
  const summaries: ReceiptSummary[] = [];

  for (const [lineUserId, userReceiptList] of Object.entries(userReceipts)) {
    const totalReceipts = userReceiptList.length;
    const totalAmount = userReceiptList.reduce((sum, r) => sum + (r.total || 0), 0);

    // Category breakdown
    const categoryBreakdown: Record<string, { count: number; amount: number }> = {};
    for (const receipt of userReceiptList) {
      const cat = receipt.category || 'other';
      if (!categoryBreakdown[cat]) {
        categoryBreakdown[cat] = { count: 0, amount: 0 };
      }
      categoryBreakdown[cat].count++;
      categoryBreakdown[cat].amount += receipt.total || 0;
    }

    // Top vendors
    const vendorStats: Record<string, { count: number; amount: number }> = {};
    for (const receipt of userReceiptList) {
      const vendor = receipt.vendor || 'Unknown';
      if (!vendorStats[vendor]) {
        vendorStats[vendor] = { count: 0, amount: 0 };
      }
      vendorStats[vendor].count++;
      vendorStats[vendor].amount += receipt.total || 0;
    }

    const topVendors = Object.entries(vendorStats)
      .map(([vendor, stats]) => ({ vendor, ...stats }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);

    summaries.push({
      lineUserId,
      displayName: employeeNameMap[lineUserId] || 'User',
      totalReceipts,
      totalAmount,
      categoryBreakdown,
      topVendors,
    });
  }

  return summaries;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getCategoryEmoji(category: string): string {
  const emojiMap: Record<string, string> = {
    food: '🍽️',
    transport: '🚗',
    utilities: '💡',
    office: '📎',
    entertainment: '🎬',
    other: '📦',
  };
  return emojiMap[category] || '📦';
}

function getCategoryName(category: string, locale: 'th' | 'en'): string {
  const names: Record<string, { th: string; en: string }> = {
    food: { th: 'อาหาร/เครื่องดื่ม', en: 'Food & Beverage' },
    transport: { th: 'การเดินทาง', en: 'Transportation' },
    utilities: { th: 'สาธารณูปโภค', en: 'Utilities' },
    office: { th: 'สำนักงาน', en: 'Office' },
    entertainment: { th: 'บันเทิง', en: 'Entertainment' },
    other: { th: 'อื่นๆ', en: 'Other' },
  };
  return names[category]?.[locale] || category;
}

function buildMonthlyReportFlex(summary: ReceiptSummary, year: number, month: number, locale: 'th' | 'en' = 'th') {
  const monthNames = locale === 'th' 
    ? ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
    : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const monthName = monthNames[month - 1];
  const title = locale === 'th' 
    ? `📊 สรุปใบเสร็จ ${monthName} ${year + 543}`
    : `📊 Receipt Summary ${monthName} ${year}`;

  // Build category rows
  const categoryRows = Object.entries(summary.categoryBreakdown)
    .sort(([, a], [, b]) => b.amount - a.amount)
    .slice(0, 4)
    .map(([cat, stats]) => ({
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'text',
          text: `${getCategoryEmoji(cat)} ${getCategoryName(cat, locale)}`,
          size: 'sm',
          color: '#555555',
          flex: 2,
        },
        {
          type: 'text',
          text: `${stats.count} ${locale === 'th' ? 'รายการ' : 'items'}`,
          size: 'sm',
          color: '#111111',
          align: 'end',
          flex: 1,
        },
        {
          type: 'text',
          text: formatCurrency(stats.amount),
          size: 'sm',
          color: '#111111',
          align: 'end',
          flex: 1,
        },
      ],
      margin: 'md',
    }));

  // Build top vendors
  const vendorRows = summary.topVendors.map((v, i) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: `${i + 1}. ${v.vendor}`,
        size: 'sm',
        color: '#555555',
        flex: 2,
      },
      {
        type: 'text',
        text: formatCurrency(v.amount),
        size: 'sm',
        color: '#111111',
        align: 'end',
        flex: 1,
      },
    ],
    margin: 'sm',
  }));

  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: title,
            weight: 'bold',
            size: 'lg',
            color: '#ffffff',
          },
        ],
        backgroundColor: '#27ACB2',
        paddingAll: 'lg',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          // Summary stats
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: locale === 'th' ? 'จำนวนใบเสร็จ' : 'Total Receipts',
                    size: 'xs',
                    color: '#8c8c8c',
                  },
                  {
                    type: 'text',
                    text: `${summary.totalReceipts}`,
                    size: 'xl',
                    weight: 'bold',
                    color: '#27ACB2',
                  },
                ],
                flex: 1,
              },
              {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: locale === 'th' ? 'ยอดรวม' : 'Total Amount',
                    size: 'xs',
                    color: '#8c8c8c',
                  },
                  {
                    type: 'text',
                    text: formatCurrency(summary.totalAmount),
                    size: 'lg',
                    weight: 'bold',
                    color: '#27ACB2',
                  },
                ],
                flex: 2,
              },
            ],
          },
          {
            type: 'separator',
            margin: 'lg',
          },
          // Category breakdown
          {
            type: 'text',
            text: locale === 'th' ? '📁 ตามหมวดหมู่' : '📁 By Category',
            weight: 'bold',
            size: 'sm',
            margin: 'lg',
          },
          ...categoryRows,
          {
            type: 'separator',
            margin: 'lg',
          },
          // Top vendors
          {
            type: 'text',
            text: locale === 'th' ? '🏪 ร้านค้ายอดนิยม' : '🏪 Top Vendors',
            weight: 'bold',
            size: 'sm',
            margin: 'lg',
          },
          ...vendorRows,
        ],
        paddingAll: 'lg',
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: locale === 'th' 
              ? `สวัสดี ${summary.displayName} 👋 นี่คือสรุปใบเสร็จของคุณ` 
              : `Hi ${summary.displayName} 👋 Here's your receipt summary`,
            size: 'xs',
            color: '#8c8c8c',
            wrap: true,
            align: 'center',
          },
        ],
        paddingAll: 'md',
        backgroundColor: '#f5f5f5',
      },
    },
  };
}

async function sendLineMessage(lineUserId: string, message: object): Promise<boolean> {
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [message],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to send message to ${lineUserId}:`, errorText);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Error sending message to ${lineUserId}:`, error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Receipt Monthly Report triggered');

    // Get the previous month
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth(); // 0-indexed, so this is already "previous month"
    
    if (month === 0) {
      month = 12;
      year -= 1;
    }

    // Allow override via request body
    try {
      const body = await req.json();
      if (body.year && body.month) {
        year = body.year;
        month = body.month;
      }
    } catch {
      // No body provided, use default (previous month)
    }

    console.log(`Generating report for ${year}-${month}`);

    const summaries = await getMonthlyReceiptSummaries(year, month);
    console.log(`Found ${summaries.length} users with receipts`);

    let successCount = 0;
    let failCount = 0;

    for (const summary of summaries) {
      // Determine locale (default to Thai)
      const locale: 'th' | 'en' = 'th';
      
      const message = buildMonthlyReportFlex(summary, year, month, locale);
      const success = await sendLineMessage(summary.lineUserId, message);
      
      if (success) {
        successCount++;
        console.log(`Sent report to ${summary.displayName} (${summary.lineUserId})`);
      } else {
        failCount++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Log the run
    await supabase.from('bot_message_logs').insert({
      edge_function_name: 'receipt-monthly-report',
      destination_type: 'system',
      destination_id: 'monthly-report',
      message_type: 'flex',
      message_text: `Monthly receipt report for ${year}-${month}: ${successCount} sent, ${failCount} failed`,
      delivery_status: failCount === 0 ? 'sent' : 'partial',
    });

    return new Response(
      JSON.stringify({
        success: true,
        year,
        month,
        totalUsers: summaries.length,
        sent: successCount,
        failed: failCount,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in receipt-monthly-report:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
