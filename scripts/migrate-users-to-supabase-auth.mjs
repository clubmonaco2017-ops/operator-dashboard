#!/usr/bin/env node
// scripts/migrate-users-to-supabase-auth.mjs
//
// Idempotent. Re-runnable. Skips inactive users; skips users already linked.
// For each active dashboard_users row:
//   1. Find or create matching auth.users row (no password set).
//   2. Update dashboard_users.auth_user_id with that row's UUID.
//   3. Generate a recovery link → triggers "set your password" email.

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE_ROLE) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.');
  process.exit(1);
}

const admin = createClient(URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findExistingAuthUser(email) {
  // listUsers is paginated; iterate until we either find or exhaust.
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < 1000) return null;
    page += 1;
  }
}

async function main() {
  const { data: users, error: listErr } = await admin
    .from('dashboard_users')
    .select('id, email, is_active, auth_user_id')
    .eq('is_active', true);
  if (listErr) {
    console.error('Failed to read dashboard_users:', listErr.message);
    process.exit(1);
  }

  let okCount = 0;
  let skipCount = 0;
  let errCount = 0;

  for (const u of users) {
    if (u.auth_user_id) {
      console.log(`SKIP ${u.email} (already linked)`);
      skipCount += 1;
      continue;
    }
    if (!u.email) {
      console.log(`ERR  user_id=${u.id} has no email — skipping`);
      errCount += 1;
      continue;
    }

    let authUserId = await findExistingAuthUser(u.email);
    if (!authUserId) {
      const { data, error } = await admin.auth.admin.createUser({
        email: u.email,
        email_confirm: true,
      });
      if (error) {
        console.log(`ERR  ${u.email}: ${error.message}`);
        errCount += 1;
        continue;
      }
      authUserId = data.user.id;
    }

    const { error: linkErr } = await admin
      .from('dashboard_users')
      .update({ auth_user_id: authUserId })
      .eq('id', u.id);
    if (linkErr) {
      console.log(`ERR  ${u.email} link: ${linkErr.message}`);
      errCount += 1;
      continue;
    }

    const { error: linkSendErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: u.email,
    });
    if (linkSendErr) {
      console.log(`WARN ${u.email} recovery link: ${linkSendErr.message} (linked, but email not sent)`);
    }

    console.log(`OK   ${u.email} → ${authUserId}`);
    okCount += 1;
  }

  console.log(`\nDone. ok=${okCount} skipped=${skipCount} errors=${errCount} total=${users.length}`);
  if (errCount > 0) process.exit(2);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
