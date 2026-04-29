#!/usr/bin/env node
// scripts/seed-test-users.mjs
//
// Idempotent. Creates / refreshes three test users used by tests/security/.
// userA: regular operator, has list_clients + create_clients permissions
// userB: regular operator, no special permissions
// userC: regular operator (deactivation target in tests)
// Each user has a Supabase Auth row with a known password.

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE_ROLE) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.');
  process.exit(1);
}

// dashboard_users.password_hash is NOT NULL with no default.
// Seed users authenticate exclusively via Supabase Auth (signInWithPassword),
// NOT via the legacy auth_login RPC, so this value is never read at runtime.
// We use a literal bcrypt-format stub purely to satisfy the NOT NULL constraint.
const SEED_PASSWORD_HASH_STUB = '$2a$04$VTlDOq/bqe7KK5j4C1V9/.j6NQv.QXl1j5J8Yku5gB5TzmA1.SqTu';

const admin = createClient(URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

// Permission names match those checked in the bucket-migration RPCs
// (see has_permission(_, '...') calls in db/migrations/20260428_3*-4*.sql).
const FIXTURES = [
  { email: 'userA@test.local', password: 'TestPwUserA1', role: 'operator', perms: ['manage_clients'] },
  { email: 'userB@test.local', password: 'TestPwUserB1', role: 'operator', perms: [] },
  { email: 'userC@test.local', password: 'TestPwUserC1', role: 'operator', perms: ['manage_clients'] },
];

async function findOrCreateAuthUser({ email, password }) {
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, { password });
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

async function findOrCreateDashboardUser({ email, role, authUserId }) {
  const { data: existing } = await admin.from('dashboard_users').select('id').eq('email', email).maybeSingle();
  if (existing) {
    const { error: updateErr } = await admin.from('dashboard_users')
      .update({ auth_user_id: authUserId, is_active: true, role })
      .eq('id', existing.id);
    if (updateErr) throw updateErr;
    return existing.id;
  }
  const { data: created, error } = await admin
    .from('dashboard_users')
    .insert({
      email,
      role,
      is_active: true,
      auth_user_id: authUserId,
      first_name: email.split('@')[0],
      last_name: 'Test',
      password_hash: SEED_PASSWORD_HASH_STUB,
      // permissions is a legacy jsonb column (NOT NULL in some deployments);
      // supply an empty object to satisfy any such constraint.
      permissions: {},
    })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

async function setPermissions(dashboardUserId, perms) {
  const { error: delErr } = await admin.from('user_permissions').delete().eq('user_id', dashboardUserId);
  if (delErr) throw delErr;
  if (perms.length > 0) {
    const { error: insErr } = await admin.from('user_permissions')
      .insert(perms.map((p) => ({ user_id: dashboardUserId, permission: p })));
    if (insErr) throw insErr;
  }
}

async function main() {
  for (const f of FIXTURES) {
    const authUserId = await findOrCreateAuthUser(f);
    const dashboardId = await findOrCreateDashboardUser({ ...f, authUserId });
    await setPermissions(dashboardId, f.perms);
    console.log(`OK ${f.email} (auth=${authUserId} dashboard=${dashboardId})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
