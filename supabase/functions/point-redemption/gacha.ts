/**
 * Gacha Box Pull Logic
 * Handles weighted random prize selection and prize granting
 */
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function gachaPull(supabase: any, employee_id: string, reward_id: string) {
  logger.info('Gacha pull started', { employee_id, reward_id });

  // 1. Get reward (the Gacha Box item)
  const { data: reward, error: rewardError } = await supabase
    .from('point_rewards')
    .select('*')
    .eq('id', reward_id)
    .eq('is_active', true)
    .maybeSingle();

  if (rewardError || !reward) {
    return jsonResponse({ success: false, error: 'Gacha box not found or inactive' }, 404);
  }

  // 2. Get employee points
  const { data: hp, error: hpError } = await supabase
    .from('happy_points')
    .select('*')
    .eq('employee_id', employee_id)
    .maybeSingle();

  if (hpError || !hp) {
    return jsonResponse({ success: false, error: 'Employee points record not found' }, 404);
  }

  // 3. Check balance
  if (hp.point_balance < reward.point_cost) {
    return jsonResponse({
      success: false,
      error: 'Insufficient points',
      required: reward.point_cost,
      available: hp.point_balance,
    }, 400);
  }

  // 4. Check cooldown
  if (reward.cooldown_days > 0) {
    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() - reward.cooldown_days);
    const { data: recent } = await supabase
      .from('point_transactions')
      .select('id')
      .eq('employee_id', employee_id)
      .eq('category', 'gacha')
      .eq('transaction_type', 'spend')
      .gte('created_at', cooldownDate.toISOString())
      .limit(1)
      .maybeSingle();

    if (recent) {
      return jsonResponse({
        success: false,
        error: `Cooldown active. Wait ${reward.cooldown_days} day(s).`,
      }, 400);
    }
  }

  // 4.5 Check daily pull limit
  if (reward.daily_pull_limit && reward.daily_pull_limit > 0) {
    // Calculate Bangkok today start in UTC (Bangkok = UTC+7)
    const now = new Date();
    const bangkokOffset = 7 * 60 * 60 * 1000;
    const bangkokNow = new Date(now.getTime() + bangkokOffset);
    const bangkokTodayStart = new Date(Date.UTC(bangkokNow.getUTCFullYear(), bangkokNow.getUTCMonth(), bangkokNow.getUTCDate()) - bangkokOffset);

    const { count } = await supabase
      .from('point_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', employee_id)
      .eq('category', 'gacha')
      .eq('transaction_type', 'spend')
      .gte('created_at', bangkokTodayStart.toISOString());

    if ((count || 0) >= reward.daily_pull_limit) {
      return jsonResponse({
        success: false,
        error: `Daily limit reached (${reward.daily_pull_limit} pulls/day)`,
        daily_limit: reward.daily_pull_limit,
        pulls_today: count,
      }, 400);
    }
  }

  // 5. Get active gacha prizes for this reward
  const { data: prizes, error: prizesError } = await supabase
    .from('gacha_box_items')
    .select('*')
    .eq('reward_id', reward_id)
    .eq('is_active', true);

  if (prizesError || !prizes || prizes.length === 0) {
    return jsonResponse({ success: false, error: 'No prizes configured for this gacha box' }, 400);
  }

  // 6. Weighted random selection
  const totalWeight = prizes.reduce((sum: number, p: any) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;
  let winningPrize = prizes[prizes.length - 1]; // fallback
  for (const prize of prizes) {
    random -= prize.weight;
    if (random <= 0) {
      winningPrize = prize;
      break;
    }
  }

  // 7. Deduct points (gacha cost)
  const newBalance = hp.point_balance - reward.point_cost;

  await supabase.from('point_transactions').insert({
    employee_id,
    transaction_type: 'spend',
    category: 'gacha',
    amount: -reward.point_cost,
    balance_after: newBalance,
    description: `🎲 Gacha Pull: ${reward.name}`,
    reference_type: 'gacha',
    metadata: { reward_name: reward.name, reward_id, prize_id: winningPrize.id },
  });

  let finalBalance = newBalance;

  // 8. Grant prize based on type
  if (winningPrize.prize_type === 'points' && winningPrize.prize_value > 0) {
    // Give points back
    finalBalance = newBalance + winningPrize.prize_value;
    await supabase.from('point_transactions').insert({
      employee_id,
      transaction_type: 'earn',
      category: 'gacha',
      amount: winningPrize.prize_value,
      balance_after: finalBalance,
      description: `🎉 Gacha Prize: ${winningPrize.prize_name} (+${winningPrize.prize_value} pts)`,
      reference_type: 'gacha',
      metadata: { prize_name: winningPrize.prize_name, prize_id: winningPrize.id },
    });
  } else if (winningPrize.prize_type === 'reward' && winningPrize.prize_reward_id) {
    // Grant bag item from referenced reward
    const { data: prizeReward } = await supabase
      .from('point_rewards')
      .select('*')
      .eq('id', winningPrize.prize_reward_id)
      .maybeSingle();

    if (prizeReward) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      await supabase.from('employee_bag_items').insert({
        employee_id,
        reward_id: prizeReward.id,
        item_name: prizeReward.name,
        item_name_th: prizeReward.name_th,
        item_icon: prizeReward.icon || '🎁',
        item_type: prizeReward.name === 'Streak Shield' ? 'shield' : 'reward',
        status: 'active',
        auto_activate: prizeReward.name === 'Streak Shield',
        granted_by: 'gacha',
        usage_rules: prizeReward.description,
        usage_rules_th: prizeReward.description_th,
        expires_at: expiresAt.toISOString(),
      });
    }
  }
  // type === 'nothing' → no extra action

  // 9. Update happy_points
  await supabase
    .from('happy_points')
    .update({
      point_balance: finalBalance,
      total_spent: hp.total_spent + reward.point_cost - (winningPrize.prize_type === 'points' ? winningPrize.prize_value : 0),
      updated_at: new Date().toISOString(),
    })
    .eq('id', hp.id);

  // 10. Update stock if applicable
  if (reward.stock_limit !== null) {
    await supabase
      .from('point_rewards')
      .update({ stock_used: reward.stock_used + 1 })
      .eq('id', reward_id);
  }

  logger.info('Gacha pull complete', {
    employee_id,
    prize: winningPrize.prize_name,
    rarity: winningPrize.rarity,
    type: winningPrize.prize_type,
  });

  return jsonResponse({
    success: true,
    prize: {
      name: winningPrize.prize_name,
      name_th: winningPrize.prize_name_th,
      icon: winningPrize.prize_icon,
      type: winningPrize.prize_type,
      value: winningPrize.prize_value,
      rarity: winningPrize.rarity,
    },
    points_spent: reward.point_cost,
    new_balance: finalBalance,
    animation_seed: Math.floor(Math.random() * 1000),
  });
}
