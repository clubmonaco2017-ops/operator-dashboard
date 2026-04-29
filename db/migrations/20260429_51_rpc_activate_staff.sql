-- Migration 51: activate_staff — обратная операция к deactivate_staff
--
-- Исправляет баг: тоггл активности на /staff был «в одну сторону» —
-- deactivate_staff существовал, а activate_staff не было, поэтому
-- реактивировать пользователя через UI было невозможно.
--
-- Permission gate: только superadmin.
--   Самореактивация запрещена: деактивированный пользователь не может
--   залогиниться (auth_login дропнут в Stage 14, но supabase auth для
--   неактивного юзера на нашем фронте упирается в is_active = false),
--   соответственно вызвать RPC от своего имени он физически не может.
--   Симметрия с deactivate_staff (self|superadmin) тут не нужна.
--
-- Cascade-эффекты НЕ восстанавливаются:
--   apply_user_archived_side_effects удаляет team_members и
--   moderator_operators при деактивации. Эти связи не хранятся —
--   восстанавливать нечего. После реактивации лида/оператора нужно
--   заново назначить в команду / кураторство вручную. В staff_activity
--   пишется событие 'user_reactivated' для аудита.

BEGIN;

CREATE OR REPLACE FUNCTION public.activate_staff(
  p_user_id integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_was_active boolean;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM dashboard_users
    WHERE id = v_caller_id AND role = 'superadmin'
  ) THEN
    RAISE EXCEPTION 'only superadmin can activate users' USING errcode = '42501';
  END IF;

  SELECT is_active INTO v_was_active
    FROM dashboard_users
    WHERE id = p_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user % not found', p_user_id;
  END IF;

  -- Идемпотентно: повторный вызов на уже активном пользователе — no-op.
  IF v_was_active THEN
    RETURN;
  END IF;

  UPDATE dashboard_users SET is_active = true WHERE id = p_user_id;

  INSERT INTO staff_activity (user_id, actor_id, event_type, payload)
  VALUES (
    p_user_id,
    v_caller_id,
    'user_reactivated',
    '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_staff(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_staff(integer) TO authenticated;

COMMIT;

-- VERIFY:
--   SELECT proname, pg_get_function_identity_arguments(oid)
--     FROM pg_proc WHERE proname = 'activate_staff';
--   -- Expected: 1 row, args = 'p_user_id integer'.
--
--   SELECT has_function_privilege('anon', 'public.activate_staff(integer)', 'EXECUTE');
--   -- Expected: false
--   SELECT has_function_privilege('authenticated', 'public.activate_staff(integer)', 'EXECUTE');
--   -- Expected: true
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.activate_staff(integer);
