/**
 * ⚠️ HAPPY POINT SYSTEM - Reward Redemption
 * 
 * Handles point redemption for rewards:
 * - Validates employee has enough points
 * - Checks cooldown period
 * - Checks stock availability
 * - Creates redemption record
 * - Deducts points
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger } from '../_shared/logger.ts';
import { gachaPull } from './gacha.ts';
import { requireRole, authzErrorResponse, AuthzError, type AppRole } from '../_shared/authz.ts';
import { writeAuditLog } from '../_shared/audit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-source',
};

const SELF_ACTIONS = new Set([
  'redeem',
  'redeem_to_bag',
  'use_bag_item',
  'gacha_pull',
]);

const ADMIN_ACTIONS = new Set([
  'approve',
  'reject',
  'use',
]);

const ADMIN_ROLES: AppRole[] = ['admin', 'owner', 'hr', 'manager'];

const ALL_ROLES: AppRole[] = [
  'admin', 'owner', 'hr', 'executive', 'manager',
  'moderator', 'field', 'user', 'employee',
];

function jsonError(message: string, status: number, code?: string) {
  return new Response(
    JSON.stringify({ success: false, error: message, ...(code ? { code } : {}) }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Phase 0B: require a valid JWT for browser calls. portal-data may call
    // this internally after it has already validated the portal session and
    // employee ownership.
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    const isPortalDataInternalCall =
      req.headers.get('x-internal-source') === 'portal-data' &&
      Boolean(serviceRoleKey) &&
      authHeader === `Bearer ${serviceRoleKey}`;

    let userId: string | null = null;
    let role: AppRole | null;
    if (isPortalDataInternalCall) {
      role = null;
    } else {
      try {
        const r = await requireRole(req, ALL_ROLES, {
          functionName: 'point-redemption',
          strict: false,
        });
        if (!r.userId) {
          return jsonError('Unauthorized', 401, 'unauthorized');
        }
        userId = r.userId;
        role = r.role;
      } catch (e) {
        const r = authzErrorResponse(e, corsHeaders);
        if (r) return r;
        throw e;
      }
    }

    const body = await req.json().catch(() => ({}));
    const {
      action,
      employee_id,
      reward_id,
      redemption_id,
      notes,
      admin_id,
      rejection_reason,
      bag_item_id,
    } = body || {};

    if (!action || typeof action !== 'string') {
      return jsonError('Missing or invalid action', 400, 'invalid_action');
    }

    // Resolve caller's employee record (used for self-actions and audit).
    let callerEmployeeId: string | null = null;
    if (!isPortalDataInternalCall && userId) {
      const { data: emp } = await supabase
        .from('employees')
        .select('id')
        .eq('auth_user_id', userId)
        .maybeSingle();
      callerEmployeeId = emp?.id ?? null;
    }

    // --- Per-action authorization ---
    if (SELF_ACTIONS.has(action)) {
      // Caller must own the target employee_id.
      if (isPortalDataInternalCall) {
        if (!employee_id || typeof employee_id !== 'string') {
          return jsonError('employee_id is required', 400, 'missing_employee_id');
        }
        callerEmployeeId = employee_id;
      } else if (!callerEmployeeId) {
        console.warn(`[authz] point-redemption actor=${userId} role=${role ?? '-'} decision=deny:no-employee-link action=${action}`);
        return jsonError('No employee record linked to this user', 403, 'no_employee_link');
      }
      if (!employee_id || typeof employee_id !== 'string') {
        return jsonError('employee_id is required', 400, 'missing_employee_id');
      }
      if (employee_id !== callerEmployeeId) {
        console.warn(`[authz] point-redemption actor=${userId} role=${role ?? '-'} decision=deny:employee-mismatch action=${action} target=${employee_id} caller_emp=${callerEmployeeId}`);
        return jsonError('You can only act on your own employee record', 403, 'forbidden_employee_mismatch');
      }
    } else if (ADMIN_ACTIONS.has(action)) {
      if (isPortalDataInternalCall) {
        callerEmployeeId = typeof admin_id === 'string' ? admin_id : null;
      } else if (!role || !ADMIN_ROLES.includes(role)) {
        console.warn(`[authz] point-redemption actor=${userId} role=${role ?? '-'} decision=deny:not-admin action=${action}`);
        return jsonError('Admin role required', 403, 'forbidden');
      }
    } else {
      return jsonError('Invalid action', 400, 'invalid_action');
    }

    // --- Execute action ---
    let response: Response;
    switch (action) {
      case 'redeem':
        response = await processRedemption(supabase, employee_id, reward_id, notes, false);
        break;
      case 'redeem_to_bag':
        response = await processRedemption(supabase, employee_id, reward_id, notes, true);
        break;
      case 'approve':
        response = await approveRedemption(supabase, redemption_id, admin_id, notes);
        break;
      case 'reject':
        response = await rejectRedemption(supabase, redemption_id, admin_id, rejection_reason);
        break;
      case 'use':
        response = await markAsUsed(supabase, redemption_id);
        break;
      case 'use_bag_item':
        response = await useBagItem(supabase, bag_item_id, employee_id);
        break;
      case 'gacha_pull':
        response = await gachaPull(supabase, employee_id, reward_id);
        break;
      default:
        return jsonError('Invalid action', 400, 'invalid_action');
    }

    // --- Audit (only on 2xx) ---
    if (response.ok) {
      // Clone so we don't consume the response body before returning it.
      try {
        const cloned = response.clone();
        const payload = await cloned.json().catch(() => ({} as any));

        const resourceId =
          payload?.redemption_id ??
          payload?.redemption?.id ??
          redemption_id ??
          payload?.bag_item_id ??
          bag_item_id ??
          reward_id ??
          null;

        await writeAuditLog(supabase, {
          functionName: 'point-redemption',
          actionType: action,
          resourceType: 'point_redemption',
          resourceId: typeof resourceId === 'string' ? resourceId : null,
          performedByUserId: userId,
          performedByEmployeeId: callerEmployeeId,
          callerRole: isPortalDataInternalCall ? 'internal:portal-data' : role ?? null,
          metadata: {
            target_employee_id: employee_id ?? null,
            reward_id: reward_id ?? null,
            bag_item_id: bag_item_id ?? null,
            points_spent: payload?.points_spent ?? null,
            new_balance: payload?.new_balance ?? null,
            redemption_status: payload?.status ?? null,
            refunded: payload?.refunded ?? null,
          },
        });
      } catch (e) {
        // Audit write must never break the response.
        console.warn('[point-redemption] audit write skipped:', (e as Error).message);
      }
    }

    return response;

  } catch (error: any) {
    if (error instanceof AuthzError) {
      return jsonError(error.message, error.status, error.code);
    }
    logger.error('Error in point-redemption', { error });
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function processRedemption(supabase: any, employee_id: string, reward_id: string, notes?: string, toBag: boolean = false) {
  logger.info('Processing redemption', { employee_id, reward_id });

  // 1. Get reward details
  const { data: reward, error: rewardError } = await supabase
    .from('point_rewards')
    .select('*')
    .eq('id', reward_id)
    .eq('is_active', true)
    .maybeSingle();

  if (rewardError || !reward) {
    return new Response(
      JSON.stringify({ success: false, error: 'Reward not found or inactive' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 2. Check validity dates
  const now = new Date();
  if (reward.valid_from && new Date(reward.valid_from) > now) {
    return new Response(
      JSON.stringify({ success: false, error: 'Reward not yet available' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  if (reward.valid_until && new Date(reward.valid_until) < now) {
    return new Response(
      JSON.stringify({ success: false, error: 'Reward has expired' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 3. Check stock
  if (reward.stock_limit !== null && reward.stock_used >= reward.stock_limit) {
    return new Response(
      JSON.stringify({ success: false, error: 'Reward out of stock' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 4. Get employee's points
  const { data: hp, error: hpError } = await supabase
    .from('happy_points')
    .select('*')
    .eq('employee_id', employee_id)
    .maybeSingle();

  if (hpError || !hp) {
    return new Response(
      JSON.stringify({ success: false, error: 'Employee points record not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 5. Check balance
  if (hp.point_balance < reward.point_cost) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Insufficient points',
        required: reward.point_cost,
        available: hp.point_balance
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 6. Check cooldown
  if (reward.cooldown_days > 0) {
    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() - reward.cooldown_days);

    const { data: recentRedemption } = await supabase
      .from('point_redemptions')
      .select('id, created_at')
      .eq('employee_id', employee_id)
      .eq('reward_id', reward_id)
      .neq('status', 'cancelled')
      .neq('status', 'rejected')
      .gte('created_at', cooldownDate.toISOString())
      .maybeSingle();

    if (recentRedemption) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Cooldown period not over. Please wait ${reward.cooldown_days} days between redemptions.`
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  // 7. Create redemption record
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 day expiry

  const initialStatus = reward.requires_approval ? 'pending' : 'approved';

  const { data: redemption, error: redemptionError } = await supabase
    .from('point_redemptions')
    .insert({
      employee_id,
      reward_id,
      point_cost: reward.point_cost,
      status: initialStatus,
      notes,
      expires_at: expiresAt.toISOString(),
      approved_at: initialStatus === 'approved' ? new Date().toISOString() : null
    })
    .select()
    .single();

  if (redemptionError) {
    throw redemptionError;
  }

  // 8. Deduct points
  const newBalance = hp.point_balance - reward.point_cost;

  await supabase.from('point_transactions').insert({
    employee_id,
    transaction_type: 'spend',
    category: 'redemption',
    amount: -reward.point_cost,
    balance_after: newBalance,
    description: `🎁 Redeemed: ${reward.name}`,
    reference_id: redemption.id,
    reference_type: 'redemption',
    metadata: { reward_name: reward.name, reward_id }
  });

  // 9. Determine if item goes to bag
  const useMode = reward.use_mode || 'use_now';
  const shouldBag = toBag || useMode === 'bag_only';

  if (shouldBag || reward.name === 'Streak Shield') {
    // Create bag item
    const bagItem: any = {
      employee_id,
      reward_id,
      redemption_id: redemption.id,
      item_name: reward.name,
      item_name_th: reward.name_th,
      item_icon: reward.icon || '🎁',
      item_type: reward.name === 'Streak Shield' ? 'shield' : 'reward',
      status: 'active',
      auto_activate: reward.name === 'Streak Shield',
      granted_by: 'purchase',
      usage_rules: reward.description,
      usage_rules_th: reward.description_th,
      expires_at: expiresAt.toISOString(),
    };

    if (reward.name === 'Streak Shield') {
      bagItem.usage_rules = 'Auto-activates when you are late or miss a work day. Protects your punctuality streak from resetting.';
      bagItem.usage_rules_th = 'ใช้อัตโนมัติเมื่อคุณมาสายหรือขาดงาน ช่วยป้องกันไม่ให้ streak ตรงเวลาถูกรีเซ็ต';
    }

    await supabase.from('employee_bag_items').insert(bagItem);

    // Update points (including streak_shields for backward compat)
    const updateData: any = {
      point_balance: newBalance,
      total_spent: hp.total_spent + reward.point_cost,
      updated_at: new Date().toISOString()
    };
    if (reward.name === 'Streak Shield') {
      updateData.streak_shields = (hp.streak_shields || 0) + 1;
    }

    await supabase
      .from('happy_points')
      .update(updateData)
      .eq('id', hp.id);

    logger.info('Item added to bag', { 
      employee_id, 
      item_type: reward.name === 'Streak Shield' ? 'shield' : 'reward',
      reward_name: reward.name
    });
  } else {
    // Regular redemption (use_now) - original behavior
    await supabase
      .from('happy_points')
      .update({
        point_balance: newBalance,
        total_spent: hp.total_spent + reward.point_cost,
        updated_at: new Date().toISOString()
      })
      .eq('id', hp.id);
  }

  // 10. Update stock
  if (reward.stock_limit !== null) {
    await supabase
      .from('point_rewards')
      .update({ stock_used: reward.stock_used + 1 })
      .eq('id', reward_id);
  }

  logger.info('Redemption successful', {
    employee_id,
    reward_id,
    reward_name: reward.name,
    points_spent: reward.point_cost,
    new_balance: newBalance,
    requires_approval: reward.requires_approval
  });

  return new Response(
    JSON.stringify({
      success: true,
      redemption_id: redemption.id,
      status: initialStatus,
      points_spent: reward.point_cost,
      new_balance: newBalance,
      requires_approval: reward.requires_approval
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function approveRedemption(supabase: any, redemption_id: string, admin_id: string, notes?: string) {
  const { data: redemption, error } = await supabase
    .from('point_redemptions')
    .update({
      status: 'approved',
      approved_by_admin_id: admin_id,
      approved_at: new Date().toISOString(),
      notes: notes || undefined,
      updated_at: new Date().toISOString()
    })
    .eq('id', redemption_id)
    .eq('status', 'pending')
    .select()
    .maybeSingle();

  if (error || !redemption) {
    return new Response(
      JSON.stringify({ success: false, error: 'Redemption not found or not pending' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  logger.info('Redemption approved', { redemption_id, admin_id });

  return new Response(
    JSON.stringify({ success: true, redemption }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function rejectRedemption(supabase: any, redemption_id: string, admin_id: string, rejection_reason?: string) {
  // Get redemption details for refund
  const { data: redemption, error: fetchError } = await supabase
    .from('point_redemptions')
    .select('*, employee:employees(id), reward:point_rewards(name)')
    .eq('id', redemption_id)
    .eq('status', 'pending')
    .maybeSingle();

  if (fetchError || !redemption) {
    return new Response(
      JSON.stringify({ success: false, error: 'Redemption not found or not pending' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Refund points
  const { data: hp } = await supabase
    .from('happy_points')
    .select('*')
    .eq('employee_id', redemption.employee_id)
    .single();

  const newBalance = hp.point_balance + redemption.point_cost;

  await supabase.from('point_transactions').insert({
    employee_id: redemption.employee_id,
    transaction_type: 'earn',
    category: 'redemption',
    amount: redemption.point_cost,
    balance_after: newBalance,
    description: `↩️ Refund: ${redemption.reward?.name} (rejected)`,
    reference_id: redemption_id,
    reference_type: 'redemption',
    metadata: { reason: 'rejected', rejection_reason }
  });

  await supabase
    .from('happy_points')
    .update({
      point_balance: newBalance,
      total_spent: Math.max(0, hp.total_spent - redemption.point_cost),
      updated_at: new Date().toISOString()
    })
    .eq('id', hp.id);

  // Update redemption status
  await supabase
    .from('point_redemptions')
    .update({
      status: 'rejected',
      approved_by_admin_id: admin_id,
      rejection_reason,
      updated_at: new Date().toISOString()
    })
    .eq('id', redemption_id);

  logger.info('Redemption rejected and refunded', { redemption_id, admin_id, refund: redemption.point_cost });

  return new Response(
    JSON.stringify({ success: true, refunded: redemption.point_cost }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function markAsUsed(supabase: any, redemption_id: string) {
  const { data: redemption, error } = await supabase
    .from('point_redemptions')
    .update({
      status: 'used',
      used_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', redemption_id)
    .eq('status', 'approved')
    .select()
    .maybeSingle();

  if (error || !redemption) {
    return new Response(
      JSON.stringify({ success: false, error: 'Redemption not found or not approved' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  logger.info('Redemption marked as used', { redemption_id });

  return new Response(
    JSON.stringify({ success: true, redemption }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function useBagItem(supabase: any, bag_item_id: string, employee_id: string) {
  const { data: item, error } = await supabase
    .from('employee_bag_items')
    .update({
      status: 'used',
      used_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', bag_item_id)
    .eq('employee_id', employee_id)
    .eq('status', 'active')
    .select()
    .maybeSingle();

  if (error || !item) {
    return new Response(
      JSON.stringify({ success: false, error: 'Item not found or not active' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  logger.info('Bag item used', { bag_item_id, employee_id, item_name: item.item_name });

  return new Response(
    JSON.stringify({ success: true, item }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
