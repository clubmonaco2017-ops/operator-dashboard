#!/usr/bin/env node
// Idempotent. Creates / refreshes a superadmin dashboard_users row + linked
// auth.users row, then sends a password-recovery email so the operator
// sets their own password via /set-password (Stage 15 cutover-flow rehearsal).
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/create-dev-superadmin.mjs <email> <first_name> <last_name>

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE_ROLE) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.');
  process.exit(1);
}

const [, , email, firstName, lastName] = process.argv;
if (!email || !firstName || !lastName) {
  console.error('Usage: node scripts/create-dev-superadmin.mjs <email> <first_name> <last_name>');
  process.exit(1);
}

// dashboard_users.password_hash is NOT NULL — supply a stub to satisfy the
// constraint. Real auth happens via Supabase Auth, this column is unused at
// runtime and will be dropped in Stage 16.
const SEED_PASSWORD_HASH_STUB = '$2a$04$VTlDOq/bqe7KK5j4C1V9/.j6NQv.QXl1j5J8Yku5gB5TzmA1.SqTu';

const admin = createClient(URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findOrCreateAuthUser(email) {
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) return existing.id;
  const tempPassword = randomBytes(24).toString('base64url');
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

async function findOrCreateDashboardUser({ email, firstName, lastName, authUserId }) {
  const { data: existing } = await admin.from('dashboard_users').select('id').eq('email', email).maybeSingle();
  if (existing) {
    const { error } = await admin.from('dashboard_users')
      .update({
        auth_user_id: authUserId,
        is_active: true,
        role: 'superadmin',
        first_name: firstName,
        last_name: lastName,
      })
      .eq('id', existing.id);
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await admin.from('dashboard_users')
    .insert({
      email,
      role: 'superadmin',
      is_active: true,
      auth_user_id: authUserId,
      first_name: firstName,
      last_name: lastName,
      password_hash: SEED_PASSWORD_HASH_STUB,
      permissions: {},
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function main() {
  const authUserId = await findOrCreateAuthUser(email);
  const dashboardId = await findOrCreateDashboardUser({ email, firstName, lastName, authUserId });
  // Mirrors scripts/migrate-users-to-supabase-auth.mjs — uses the
  // dashboard-configured Site URL for the recovery redirect, no guesswork.
  const { error: resetErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
  });
  if (resetErr) throw resetErr;
  console.log(`OK ${email}`);
  console.log(`  auth_user_id=${authUserId}`);
  console.log(`  dashboard_user_id=${dashboardId}`);
  console.log(`  role=superadmin, is_active=true`);
  console.log(`  Password recovery email sent — check inbox and click the link.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
