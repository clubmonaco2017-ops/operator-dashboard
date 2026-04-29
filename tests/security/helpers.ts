import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function anonClient(): SupabaseClient {
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function signInAs(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signInAs(${email}) failed: ${error.message}`);
  return c;
}

export function adminClient(): SupabaseClient {
  if (!SERVICE_ROLE) throw new Error('SUPABASE_SERVICE_ROLE_KEY required for admin operations');
  return createClient(URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function adminSetActive(dashboardUserId: number, isActive: boolean): Promise<void> {
  const admin = adminClient();
  const { error } = await admin.from('dashboard_users').update({ is_active: isActive }).eq('id', dashboardUserId);
  if (error) throw error;
}
