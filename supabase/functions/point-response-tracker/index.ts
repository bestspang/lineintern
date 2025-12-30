/**
 * ⚠️ HAPPY POINT SYSTEM - Smart Response Point Tracker
 * 
 * Tracks and awards points for message responses:
 * - Perfect Action: Fast response (<10 min) with content (+8 points)
 * - Helpful Ack: Fast but short response (+3 points)
 * - Late but Sure: Slow response (>1 hr) with content (+2 points)
 * - Spam: Stickers, "555", etc (+0 points)
 * 
 * Daily cap: 20 points maximum
 * Anti-fraud: Session debounce (2 min), working hours only
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger } from '../_shared/logger.ts';
import { getBangkokDateString, formatBangkokTime } from '../_shared/timezone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DAILY_CAP = 20;
const DEBOUNCE_MINUTES = 2;
const WORK_START_HOUR = 8;
const WORK_END_HOUR = 19;

// Score definitions
const SCORE_PERFECT = 8;
const SCORE_HELPFUL_ACK = 3;
const SCORE_LATE_BUT_SURE = 2;
const SCORE_SPAM = 0;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { 
      employee_id, 
      message_id,
      response_time_seconds,
      message_length,
      is_sticker,
      is_file_upload,
      is_task_completion,
      trigger_source // 'bot_notification' | 'manager' | 'official_group'
    } = await req.json();

    if (!employee_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'employee_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Layer C: Working Hours Only Check
    const now = new Date();
    const bangkokHour = parseInt(formatBangkokTime(now, 'HH'));
    if (bangkokHour < WORK_START_HOUR || bangkokHour >= WORK_END_HOUR) {
      logger.info('Response outside working hours - no points', { 
        employee_id, 
        hour: bangkokHour 
      });
      return new Response(
        JSON.stringify({ 
          success: true, 
          points_awarded: 0, 
          reason: 'outside_working_hours' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get or create happy_points record
    let { data: happyPoints, error: hpError } = await supabase
      .from('happy_points')
      .select('*')
      .eq('employee_id', employee_id)
      .maybeSingle();

    if (hpError) {
      logger.error('Error fetching happy_points', { error: hpError });
      throw hpError;
    }

    if (!happyPoints) {
      const currentMonth = new Date().getFullYear() * 100 + (new Date().getMonth() + 1);
      const { data: newHp, error: createError } = await supabase
        .from('happy_points')
        .insert({ employee_id, health_bonus_month: currentMonth })
        .select()
        .single();
      
      if (createError) throw createError;
      happyPoints = newHp;
    }

    const today = getBangkokDateString();
    
    // Layer B: Session Debounce Check
    // Check for recent point transaction from this employee
    const debounceTime = new Date(now.getTime() - DEBOUNCE_MINUTES * 60 * 1000);
    const { data: recentTx } = await supabase
      .from('point_transactions')
      .select('id, created_at')
      .eq('employee_id', employee_id)
      .eq('category', 'response')
      .gte('created_at', debounceTime.toISOString())
      .limit(1);

    if (recentTx && recentTx.length > 0) {
      logger.info('Debounce active - skipping point award', { 
        employee_id, 
        last_tx: recentTx[0].id 
      });
      return new Response(
        JSON.stringify({ 
          success: true, 
          points_awarded: 0, 
          reason: 'debounce_active' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check daily cap
    let currentDailyScore = happyPoints.daily_response_score || 0;
    const lastScoreDate = happyPoints.daily_score_date;
    
    // Reset if new day
    if (lastScoreDate !== today) {
      currentDailyScore = 0;
    }

    if (currentDailyScore >= DAILY_CAP) {
      logger.info('Daily cap reached', { employee_id, current_score: currentDailyScore });
      return new Response(
        JSON.stringify({ 
          success: true, 
          points_awarded: 0, 
          reason: 'daily_cap_reached',
          current_daily: currentDailyScore 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate score based on response quality
    let rawScore = 0;
    let scoreReason = '';

    if (is_sticker || (message_length && message_length < 5)) {
      // Spam detection
      rawScore = SCORE_SPAM;
      scoreReason = 'spam_or_too_short';
    } else if (is_task_completion || is_file_upload) {
      // Task done or file upload = Perfect Action
      rawScore = SCORE_PERFECT;
      scoreReason = 'task_completion';
    } else if (response_time_seconds && response_time_seconds < 600) {
      // Response within 10 minutes
      if (message_length && message_length > 20) {
        rawScore = SCORE_PERFECT;
        scoreReason = 'fast_with_content';
      } else {
        rawScore = SCORE_HELPFUL_ACK;
        scoreReason = 'fast_but_short';
      }
    } else if (response_time_seconds && response_time_seconds >= 3600) {
      // Response after 1 hour
      if (message_length && message_length > 20) {
        rawScore = SCORE_LATE_BUT_SURE;
        scoreReason = 'late_with_content';
      } else {
        rawScore = SCORE_SPAM;
        scoreReason = 'late_and_short';
      }
    } else {
      // Between 10 min and 1 hour
      rawScore = SCORE_HELPFUL_ACK;
      scoreReason = 'moderate_response';
    }

    // Apply cap
    const pointsToAdd = Math.min(rawScore, DAILY_CAP - currentDailyScore);

    if (pointsToAdd <= 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          points_awarded: 0, 
          reason: 'no_points_earned',
          raw_score: rawScore 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create transaction
    const newBalance = happyPoints.point_balance + pointsToAdd;
    const { error: txError } = await supabase
      .from('point_transactions')
      .insert({
        employee_id,
        transaction_type: 'earn',
        category: 'response',
        amount: pointsToAdd,
        balance_after: newBalance,
        description: `💬 Smart Response - ${scoreReason}`,
        reference_id: message_id,
        reference_type: 'message',
        metadata: {
          reason: scoreReason,
          raw_score: rawScore,
          response_time_seconds,
          message_length,
          trigger_source,
          daily_score_before: currentDailyScore,
          daily_score_after: currentDailyScore + pointsToAdd
        }
      });

    if (txError) {
      logger.error('Error inserting transaction', { error: txError });
      throw txError;
    }

    // Update happy_points
    const { error: updateError } = await supabase
      .from('happy_points')
      .update({
        point_balance: newBalance,
        total_earned: happyPoints.total_earned + pointsToAdd,
        daily_response_score: currentDailyScore + pointsToAdd,
        daily_score_date: today,
        updated_at: new Date().toISOString()
      })
      .eq('id', happyPoints.id);

    if (updateError) {
      logger.error('Error updating happy_points', { error: updateError });
      throw updateError;
    }

    logger.info('Response points awarded', {
      employee_id,
      points_awarded: pointsToAdd,
      reason: scoreReason,
      new_balance: newBalance,
      daily_score: currentDailyScore + pointsToAdd
    });

    return new Response(
      JSON.stringify({
        success: true,
        points_awarded: pointsToAdd,
        raw_score: rawScore,
        reason: scoreReason,
        new_balance: newBalance,
        daily_score: currentDailyScore + pointsToAdd,
        daily_cap: DAILY_CAP
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    logger.error('Error in point-response-tracker', { error });
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
