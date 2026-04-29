/**
 * Admin tool to rollback response points for a specific date.
 * Creates reversal entries (deduct) to correct balances without deleting history.
 * Logs action in audit_logs for transparency.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger } from '../_shared/logger.ts';
import { getBangkokDateString } from '../_shared/timezone.ts';
import { requireRole, authzErrorResponse } from '../_shared/authz.ts';
import { writeAuditLog } from '../_shared/audit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Phase 0A: only admin/owner may rollback the points ledger.
    let actorUserId: string | null = null;
    let actorRole: string | null = null;
    try {
      const r = await requireRole(req, ['admin', 'owner'], { functionName: 'admin-response-points-rollback' });
      actorUserId = r.userId;
      actorRole = r.role ?? null;
    } catch (e) {
      const r = authzErrorResponse(e, corsHeaders);
      if (r) return r;
      throw e;
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { date, reason } = await req.json();
    const targetDate = date || getBangkokDateString(); // Default to today
    const rollbackReason = reason || 'Response rules disabled but awarded (admin rollback)';

    logger.info('Starting admin response points rollback', { targetDate, reason: rollbackReason });

    // Call the database function
    const { data, error } = await supabase.rpc('rollback_response_points_for_date', {
      p_date: targetDate,
      p_reason: rollbackReason,
      p_actor_user_id: null // Admin tool, no specific user
    });

    if (error) {
      logger.error('Rollback failed', { error });
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse result
    const result = data || { processed_count: 0, affected_employees: [], total_reversed: 0 };

    logger.info('Rollback completed', {
      date: targetDate,
      processed_count: result.processed_count,
      affected_employees: result.affected_employees?.length || 0,
      total_reversed: result.total_reversed
    });

    await writeAuditLog(supabase, {
      functionName: 'admin-response-points-rollback',
      actionType: 'rollback',
      resourceType: 'points',
      performedByUserId: actorUserId,
      callerRole: actorRole,
      reason: rollbackReason,
      metadata: {
        date: targetDate,
        processed_count: result.processed_count,
        affected_employees: result.affected_employees?.length ?? 0,
        total_reversed: result.total_reversed,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        date: targetDate,
        reason: rollbackReason,
        processed_count: result.processed_count,
        affected_employees: result.affected_employees,
        total_reversed: result.total_reversed
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    logger.error('Error in admin-response-points-rollback', { error });
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
