import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { group_id, user_id, summary_type } = await req.json();
    
    // summary_type: 'working_week' | 'working_month' | 'long_term'
    if (!summary_type) {
      return new Response(
        JSON.stringify({ error: 'summary_type is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let memories: any[] = [];
    let promptContext = '';

    if (summary_type === 'working_week' || summary_type === 'working_month') {
      // Query working_memory
      const daysBack = summary_type === 'working_week' ? 7 : 30;
      const dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - daysBack);

      let query = supabase
        .from('working_memory')
        .select('*')
        .gte('created_at', dateThreshold.toISOString())
        .order('importance_score', { ascending: false });

      if (group_id) {
        query = query.eq('group_id', group_id);
      }
      if (user_id) {
        query = query.eq('user_id', user_id);
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      memories = data || [];

      if (memories.length === 0) {
        return new Response(
          JSON.stringify({ 
            summary: summary_type === 'working_week' 
              ? 'ไม่มีความจำระยะสั้นในสัปดาห์นี้'
              : 'ไม่มีความจำระยะสั้นในเดือนนี้',
            count: 0
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Group by memory_type
      const grouped: Record<string, string[]> = {};
      memories.forEach(m => {
        const type = m.memory_type || 'general';
        if (!grouped[type]) grouped[type] = [];
        grouped[type].push(m.content);
      });

      promptContext = Object.entries(grouped)
        .map(([type, contents]) => `[${type}]\n${contents.map((c, i) => `${i+1}. ${c}`).join('\n')}`)
        .join('\n\n');

    } else if (summary_type === 'long_term') {
      // Query memory_items
      let query = supabase
        .from('memory_items')
        .select('*')
        .eq('is_deleted', false)
        .order('importance_score', { ascending: false });

      if (group_id) {
        query = query.eq('group_id', group_id);
      }
      if (user_id) {
        query = query.eq('user_id', user_id);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      memories = data || [];

      if (memories.length === 0) {
        return new Response(
          JSON.stringify({ 
            summary: 'ยังไม่มีความจำระยะยาวที่บันทึกไว้',
            count: 0
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Group by category
      const grouped: Record<string, string[]> = {};
      memories.forEach(m => {
        const cat = m.category || 'general';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(`${m.title}: ${m.content}`);
      });

      promptContext = Object.entries(grouped)
        .map(([cat, contents]) => `[${cat}]\n${contents.map((c, i) => `${i+1}. ${c}`).join('\n')}`)
        .join('\n\n');
    }

    // Build AI prompt
    let systemPrompt = '';
    let userPrompt = '';

    if (summary_type === 'working_week') {
      systemPrompt = 'คุณคือผู้ช่วยสรุปข้อมูลภาษาไทย สรุปกระชับ ใช้รูปแบบที่กำหนด';
      userPrompt = `สรุปความจำ "สัปดาห์นี้":

${promptContext}

จำนวน: ${memories.length} รายการ

สรุปกระชับในรูปแบบนี้:

**📋 ภาพรวม:** (2-3 ประโยคสั้นๆ)

**📌 หัวข้อหลัก:**
• หัวข้อ 1
• หัวข้อ 2

**⏳ ต้องติดตาม:** (ถ้ามี)
• งาน 1

กฎ: แต่ละ bullet ไม่เกิน 10 คำ ตอบภาษาไทย`;
    } else if (summary_type === 'working_month') {
      systemPrompt = 'คุณคือผู้ช่วยสรุปข้อมูลภาษาไทย สรุปกระชับ ใช้รูปแบบที่กำหนด';
      userPrompt = `สรุปความจำ "เดือนนี้":

${promptContext}

จำนวน: ${memories.length} รายการ

สรุปกระชับในรูปแบบนี้:

**📋 ภาพรวม:** (2-3 ประโยคสั้นๆ)

**📌 หัวข้อหลัก:**
• หัวข้อ 1
• หัวข้อ 2

**⏳ ต้องติดตาม:** (ถ้ามี)
• งาน 1

กฎ: แต่ละ bullet ไม่เกิน 10 คำ ตอบภาษาไทย`;
    } else if (summary_type === 'long_term') {
      systemPrompt = 'คุณคือผู้ช่วยสรุปข้อมูลภาษาไทย วิเคราะห์บริบทกลุ่ม(ธุรกิจ/คุยเล่น) แล้วสรุปให้เหมาะสม';
      userPrompt = `สรุปความจำระยะยาว:

${promptContext}

จำนวน: ${memories.length} รายการ

วิเคราะห์บริบทกลุ่ม แล้วสรุปกระชับ:

**📋 ภาพรวม:** (2-3 ประโยคตามบริบทกลุ่ม)

**💡 ความรู้สำคัญ:**
• ข้อ 1
• ข้อ 2

**👥 บุคคล/ความสัมพันธ์:**
• คน 1
• คน 2

**📜 การตัดสินใจ/นโยบาย:**
• เรื่อง 1

ข้ามหมวดที่ไม่มีข้อมูล กฎ: แต่ละ bullet ไม่เกิน 10 คำ ตอบภาษาไทย`;
    }

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ 
          summary: `พบข้อมูล ${memories.length} รายการ (ไม่สามารถสร้างสรุปได้)`,
          count: memories.length,
          error: 'AI not configured'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 600,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ 
          summary: `พบข้อมูล ${memories.length} รายการ`,
          count: memories.length,
          error: 'AI generation failed'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const summary = aiData.choices?.[0]?.message?.content?.trim() || `พบข้อมูล ${memories.length} รายการ`;

    console.log(`Generated ${summary_type} summary for group=${group_id}, count=${memories.length}`);

    return new Response(
      JSON.stringify({ 
        summary,
        count: memories.length,
        summary_type
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in memory-summary:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
