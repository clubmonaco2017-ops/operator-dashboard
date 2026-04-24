-- Migration 07: RPC functions for user_attributes
-- get_user_attributes, set_user_attribute, delete_user_attribute
-- All user_id parameters are integer (matches dashboard_users.id type).

BEGIN;

-- get_user_attributes: returns jsonb object { key: value, ... }
CREATE OR REPLACE FUNCTION get_user_attributes(p_user_id integer)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
  FROM user_attributes
  WHERE user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION get_user_attributes(integer) TO anon, authenticated;

-- set_user_attribute: upsert; caller must have create_users OR be the target user
CREATE OR REPLACE FUNCTION set_user_attribute(
  p_caller_id integer, p_user_id integer, p_key text, p_value text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    has_permission(p_caller_id, 'create_users')
    OR p_caller_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'caller % cannot set attributes on user %', p_caller_id, p_user_id;
  END IF;
  INSERT INTO user_attributes (user_id, key, value)
    VALUES (p_user_id, p_key, p_value)
  ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value;
END $$;

GRANT EXECUTE ON FUNCTION set_user_attribute(integer, integer, text, text) TO anon, authenticated;

-- delete_user_attribute: caller must have create_users
CREATE OR REPLACE FUNCTION delete_user_attribute(
  p_caller_id integer, p_user_id integer, p_key text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_permission(p_caller_id, 'create_users') THEN
    RAISE EXCEPTION 'caller % lacks create_users', p_caller_id;
  END IF;
  DELETE FROM user_attributes WHERE user_id = p_user_id AND key = p_key;
END $$;

GRANT EXECUTE ON FUNCTION delete_user_attribute(integer, integer, text) TO anon, authenticated;

COMMIT;

-- VERIFY (replace <sa_id> with integer id of a user who has create_users permission):
--   SELECT set_user_attribute(<sa_id>, <sa_id>, 'test_key', 'test_val');
--   SELECT get_user_attributes(<sa_id>);
--   -- Expected: contains "test_key":"test_val"
--   SELECT delete_user_attribute(<sa_id>, <sa_id>, 'test_key');
--   SELECT get_user_attributes(<sa_id>);
--   -- Expected: test_key no longer present
--
-- ROLLBACK:
--   DROP FUNCTION get_user_attributes(integer);
--   DROP FUNCTION set_user_attribute(integer, integer, text, text);
--   DROP FUNCTION delete_user_attribute(integer, integer, text);
