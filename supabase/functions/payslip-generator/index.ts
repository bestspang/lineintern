import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole, authzErrorResponse } from "../_shared/authz.ts";
import { writeAuditLog } from "../_shared/audit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ⚠️ SECURITY: HTML escape function to prevent XSS attacks
// DO NOT REMOVE - Required for safe HTML generation
function escapeHtml(unsafe: string | null | undefined): string {
  if (unsafe == null) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Phase 0A: payslip generation is sensitive — admin/owner/hr only.
    try {
      await requireRole(req, ['admin', 'owner', 'hr'], { functionName: 'payslip-generator' });
    } catch (e) {
      const r = authzErrorResponse(e, corsHeaders);
      if (r) return r;
      throw e;
    }

    const { employee_id, period_id } = await req.json();

    if (!employee_id || !period_id) {
      return new Response(
        JSON.stringify({ error: 'employee_id and period_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch payroll record
    const { data: record, error: recordError } = await supabase
      .from('payroll_records')
      .select(`
        *,
        employee:employees (
          id,
          full_name,
          code,
          bank_name,
          bank_account_number,
          bank_branch,
          branches (name)
        )
      `)
      .eq('employee_id', employee_id)
      .eq('period_id', period_id)
      .single();

    if (recordError || !record) {
      console.error('Error fetching payroll record:', recordError);
      return new Response(
        JSON.stringify({ error: 'Payroll record not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch period info
    const { data: period, error: periodError } = await supabase
      .from('payroll_periods')
      .select('*')
      .eq('id', period_id)
      .single();

    if (periodError || !period) {
      return new Response(
        JSON.stringify({ error: 'Period not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate HTML payslip
    const payslipHtml = generatePayslipHTML(record, period);

    return new Response(
      JSON.stringify({ 
        success: true, 
        html: payslipHtml,
        employee_name: record.employee?.full_name,
        period_name: period.name,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating payslip:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generatePayslipHTML(record: any, period: any): string {
  const employee = record.employee || {};
  const deductions = record.deductions || [];
  const allowances = record.allowances || [];
  
  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2 }).format(amount || 0);

  // ⚠️ SECURITY: All dynamic values are escaped to prevent XSS
  const safeName = escapeHtml(employee.full_name);
  const safeCode = escapeHtml(employee.code);
  const safeBranchName = escapeHtml(employee.branches?.name) || '-';
  const safeBankName = escapeHtml(employee.bank_name);
  const safeBankAccountNumber = escapeHtml(employee.bank_account_number) || '-';
  const safeBankBranch = escapeHtml(employee.bank_branch) || '-';
  const safePeriodName = escapeHtml(period.name);

  return `
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>สลิปเงินเดือน - ${safeName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Sarabun', 'Segoe UI', sans-serif; font-size: 14px; background: #fff; color: #333; }
    .payslip { max-width: 800px; margin: 20px auto; padding: 30px; border: 1px solid #ddd; }
    .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #333; }
    .header h1 { font-size: 24px; margin-bottom: 5px; }
    .header p { color: #666; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
    .info-box { padding: 15px; background: #f9f9f9; border-radius: 5px; }
    .info-box h3 { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 8px; }
    .info-box p { font-size: 16px; font-weight: bold; }
    .info-box .label { font-size: 12px; color: #666; }
    .info-box .value { font-size: 14px; }
    .details-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .details-table th, .details-table td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }
    .details-table th { background: #f5f5f5; font-weight: 600; }
    .details-table td.amount { text-align: right; }
    .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 30px; }
    .summary-box { padding: 20px; background: #f5f5f5; border-radius: 5px; }
    .summary-box.net { background: #4CAF50; color: white; }
    .summary-box h4 { font-size: 12px; margin-bottom: 5px; opacity: 0.8; }
    .summary-box .amount { font-size: 24px; font-weight: bold; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 12px; color: #666; }
    .bank-info { margin-top: 20px; padding: 15px; background: #e3f2fd; border-radius: 5px; }
    .bank-info h4 { margin-bottom: 10px; }
    @media print {
      .payslip { margin: 0; border: none; }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="payslip">
    <div class="header">
      <h1>สลิปเงินเดือน</h1>
      <p>Pay Slip - ${safePeriodName}</p>
    </div>
    
    <div class="info-grid">
      <div class="info-box">
        <h3>ข้อมูลพนักงาน</h3>
        <p>${safeName}</p>
        <div style="margin-top: 10px;">
          <span class="label">รหัสพนักงาน:</span> <span class="value">${safeCode}</span><br>
          <span class="label">สาขา:</span> <span class="value">${safeBranchName}</span><br>
          <span class="label">ประเภท:</span> <span class="value">${record.pay_type === 'salary' ? 'รายเดือน' : 'รายชั่วโมง'}</span>
        </div>
      </div>
      <div class="info-box">
        <h3>ข้อมูลการทำงาน</h3>
        <div>
          <span class="label">วันทำงาน:</span> <span class="value">${record.actual_work_days}/${record.scheduled_work_days} วัน</span><br>
          <span class="label">ชั่วโมงรวม:</span> <span class="value">${(record.total_work_hours || 0).toFixed(1)} ชม.</span><br>
          <span class="label">OT:</span> <span class="value">${(record.ot_hours || 0).toFixed(1)} ชม.</span><br>
          <span class="label">สาย:</span> <span class="value">${record.late_count || 0} ครั้ง (${record.late_minutes || 0} นาที)</span><br>
          <span class="label">ลามีเงินเดือน:</span> <span class="value">${record.paid_leave_days || record.leave_days || 0} วัน</span><br>
          <span class="label">ลาไม่รับค่าจ้าง:</span> <span class="value">${record.unpaid_leave_days || 0} วัน</span>
        </div>
      </div>
    </div>
    
    <table class="details-table">
      <thead>
        <tr>
          <th colspan="2">รายได้</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>เงินเดือน/ค่าจ้าง</td>
          <td class="amount">฿${formatCurrency(record.base_salary)}</td>
        </tr>
        ${record.ot_pay > 0 ? `
        <tr>
          <td>ค่าล่วงเวลา (OT)</td>
          <td class="amount">฿${formatCurrency(record.ot_pay)}</td>
        </tr>
        ` : ''}
        ${allowances.map((a: any) => `
        <tr>
          <td>${escapeHtml(a.name)}</td>
          <td class="amount">฿${formatCurrency(a.amount)}</td>
        </tr>
        `).join('')}
        <tr style="font-weight: bold; background: #e8f5e9;">
          <td>รวมรายได้</td>
          <td class="amount">฿${formatCurrency(record.gross_pay + record.total_allowances)}</td>
        </tr>
      </tbody>
    </table>
    
    <table class="details-table">
      <thead>
        <tr>
          <th colspan="2">รายการหัก</th>
        </tr>
      </thead>
      <tbody>
        ${deductions.map((d: any) => `
        <tr>
          <td>${escapeHtml(d.name)}</td>
          <td class="amount">฿${formatCurrency(d.amount)}</td>
        </tr>
        `).join('')}
        <tr style="font-weight: bold; background: #ffebee;">
          <td>รวมรายการหัก</td>
          <td class="amount">฿${formatCurrency(record.total_deductions)}</td>
        </tr>
      </tbody>
    </table>
    
    <div class="summary">
      <div class="summary-box">
        <h4>รายได้รวม</h4>
        <div class="amount">฿${formatCurrency(record.gross_pay + record.total_allowances)}</div>
      </div>
      <div class="summary-box net">
        <h4>เงินสุทธิ</h4>
        <div class="amount">฿${formatCurrency(record.net_pay)}</div>
      </div>
    </div>
    
    ${employee.bank_name ? `
    <div class="bank-info">
      <h4>🏦 ข้อมูลบัญชีธนาคาร</h4>
      <span class="label">ธนาคาร:</span> ${safeBankName}<br>
      <span class="label">เลขบัญชี:</span> ${safeBankAccountNumber}<br>
      <span class="label">สาขา:</span> ${safeBankBranch}
    </div>
    ` : ''}
    
    <div class="footer">
      <p>เอกสารนี้ออกโดยระบบอัตโนมัติ | วันที่ออก: ${new Date().toLocaleDateString('th-TH')}</p>
    </div>
  </div>
</body>
</html>
  `;
}
