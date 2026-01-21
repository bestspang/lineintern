-- Rollback response points for a specific Bangkok date (ledger-safe)
-- Creates per-transaction reversal entries and an audit log record.

CREATE OR REPLACE FUNCTION public.rollback_response_points_for_date(
  p_date date,
  p_reason text,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS TABLE(processed_count int, affected_employees int, total_reversed int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp RECORD;
  tx RECORD;
  hp RECORD;
  running_balance int;
  reversed_for_emp int;
  processed int := 0;
  affected int := 0;
  total int := 0;
BEGIN
  -- Loop employees who received response points on the given Bangkok date
  FOR emp IN
    SELECT pt.employee_id, SUM(pt.amount)::int AS sum_points
    FROM public.point_transactions pt
    WHERE pt.category = 'response'
      AND pt.transaction_type = 'earn'
      AND (pt.created_at AT TIME ZONE 'Asia/Bangkok')::date = p_date
      AND NOT EXISTS (
        SELECT 1
        FROM public.point_transactions rb
        WHERE rb.category = 'response'
          AND rb.transaction_type = 'deduct'
          AND (rb.metadata->>'rolled_back_tx_id') = pt.id::text
      )
    GROUP BY pt.employee_id
  LOOP
    reversed_for_emp := 0;

    SELECT * INTO hp
    FROM public.happy_points
    WHERE employee_id = emp.employee_id
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    running_balance := hp.point_balance;
    affected := affected + 1;

    -- Reverse each response transaction (newest-first) so balance_after stays consistent.
    FOR tx IN
      SELECT pt.*
      FROM public.point_transactions pt
      WHERE pt.employee_id = emp.employee_id
        AND pt.category = 'response'
        AND pt.transaction_type = 'earn'
        AND (pt.created_at AT TIME ZONE 'Asia/Bangkok')::date = p_date
        AND NOT EXISTS (
          SELECT 1
          FROM public.point_transactions rb
          WHERE rb.category = 'response'
            AND rb.transaction_type = 'deduct'
            AND (rb.metadata->>'rolled_back_tx_id') = pt.id::text
        )
      ORDER BY pt.created_at DESC
    LOOP
      running_balance := running_balance - tx.amount;

      INSERT INTO public.point_transactions(
        employee_id,
        transaction_type,
        category,
        amount,
        balance_after,
        description,
        reference_id,
        reference_type,
        metadata,
        created_at
      ) VALUES (
        emp.employee_id,
        'deduct',
        'response',
        -tx.amount,
        running_balance,
        '↩️ Rollback response points (rules disabled)',
        tx.id,
        'point_transaction',
        jsonb_build_object(
          'rollback_reason', p_reason,
          'rolled_back_tx_id', tx.id,
          'rolled_back_date', p_date
        ),
        now()
      );

      processed := processed + 1;
      reversed_for_emp := reversed_for_emp + tx.amount;
      total := total + tx.amount;
    END LOOP;

    IF reversed_for_emp > 0 THEN
      UPDATE public.happy_points
      SET
        point_balance = running_balance,
        total_earned = GREATEST(0, total_earned - reversed_for_emp),
        daily_response_score = CASE
          WHEN daily_score_date = p_date THEN GREATEST(0, COALESCE(daily_response_score, 0) - reversed_for_emp)
          ELSE daily_response_score
        END,
        updated_at = now()
      WHERE id = hp.id;
    END IF;
  END LOOP;

  -- Always write an audit log entry (even if nothing to rollback)
  INSERT INTO public.audit_logs(
    action_type,
    resource_type,
    reason,
    metadata,
    performed_by_user_id,
    created_at
  ) VALUES (
    'rollback',
    'points',
    p_reason,
    jsonb_build_object(
      'date', p_date,
      'category', 'response',
      'processed_count', processed,
      'affected_employees', affected,
      'total_reversed', total
    ),
    p_actor_user_id,
    now()
  );

  processed_count := processed;
  affected_employees := affected;
  total_reversed := total;
  RETURN NEXT;
END;
$$;

-- Execute rollback for "today" in Bangkok timezone (user-approved: เฉพาะวันนี้)
SELECT *
FROM public.rollback_response_points_for_date(
  (now() AT TIME ZONE 'Asia/Bangkok')::date,
  'Rollback response points (rules disabled but awarded)',
  NULL
);
