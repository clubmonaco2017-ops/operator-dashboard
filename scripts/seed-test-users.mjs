#!/usr/bin/env node
// scripts/seed-test-users.mjs
//
// Idempotent. Creates / refreshes three test users used by tests/security/.
// userA: regular operator, has create_clients permission
// userB: regular operator, no special permissions
// userC: regular operator (deactivation target in tests)
// Each user has a Supabase Auth row with a known password.

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE_ROLE) { console.error('Missing env'); process.exit(1); }

const admin = createClient(URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

const FIXTURES = [
  { email: 'userA@test.local', password: 'TestPwUserA1', role: 'operator', perms: ['list_clients', 'create_clients'] },
  { email: 'userB@test.local', password: 'TestPwUserB1', role: 'operator', perms: [] },
  { email: 'userC@test.local', password: 'TestPwUserC1', role: 'operator', perms: ['list_clients'] },
];

async function findOrCreateAuthUser({ email, password }) {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
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
    await admin.from('dashboard_users').update({ auth_user_id: authUserId, is_active: true, role }).eq('id', existing.id);
    return existing.id;
  }
  const { data: created, error } = await admin
    .from('dashboard_users')
    .insert({ email, role, is_active: true, auth_user_id: authUserId, first_name: email.split('@')[0], last_name: 'Test' })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

async function setPermissions(dashboardUserId, perms) {
  await admin.from('user_permissions').delete().eq('user_id', dashboardUserId);
  if (perms.length > 0) {
    await admin.from('user_permissions').insert(perms.map((p) => ({ user_id: dashboardUserId, permission: p })));
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
