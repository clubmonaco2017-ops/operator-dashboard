import { describe, it, expect, beforeAll } from 'vitest';
import { anonClient, signInAs, adminSetActive, adminClient } from './helpers';

// Privileged RPCs that all callers must be authenticated to invoke.
// Stages 5-12 will, one bucket at a time, switch each to use
// current_dashboard_user_id() and revoke anon EXECUTE.
// The final cleanup stage (14) runs the full security suite and gates
// merge on it being entirely green.
const ALL_PRIVILEGED_RPCS = [
  // permissions / attributes (Stage 5)
  'grant_permission', 'revoke_permission', 'set_user_attribute', 'delete_user_attribute',
  'get_user_permissions', 'get_user_attributes', 'get_user_team_membership',
  // clients CRUD (Stage 6)
  'list_clients', 'get_client_detail', 'create_client', 'update_client',
  'archive_client', 'restore_client', 'list_client_activity', 'list_unassigned_clients',
  // client media (Stage 7)
  'add_client_media', 'update_client_media', 'delete_client_media',
  'reorder_client_media', 'list_client_media',
  // tasks CRUD (Stage 8)
  'create_task', 'update_task', 'cancel_task', 'delete_task',
  'list_tasks', 'get_task_detail', 'take_task_in_progress',
  'submit_task_report', 'update_task_report', 'count_overdue_tasks',
  'can_assign_task',
  // teams CRUD (Stage 9)
  'create_team', 'update_team', 'archive_team', 'restore_team',
  'list_teams', 'get_team_detail', 'list_team_activity',
  'add_team_member', 'remove_team_member', 'move_team_member',
  'assign_team_clients', 'unassign_team_client', 'move_team_client',
  'list_active_teams_for_assignment', 'list_assignable_users',
  // staff (Stage 10)
  'create_staff', 'update_staff_profile', 'deactivate_staff',
  'list_staff', 'get_staff_detail',
  // deletion workflow (Stage 11)
  'request_deletion', 'approve_deletion', 'reject_deletion',
  'list_deletion_requests', 'count_pending_deletions',
  // dashboard / curatorship (Stage 12)
  'get_operator_curator', 'set_operator_curator',
  'bulk_assign_curated_operators',
  'list_curated_operators', 'list_unassigned_operators',
  // hydration RPC (foundation)
  'get_current_user_profile',
];

describe('anon caller — gate enforcement', () => {
  it('cannot read dashboard_users directly', async () => {
    const anon = anonClient();
    const { error } = await anon.from('dashboard_users').select('id').limit(1);
    expect(error).toBeTruthy();
  });

  it('cannot read clients table directly', async () => {
    const anon = anonClient();
    const { error } = await anon.from('clients').select('id').limit(1);
    expect(error).toBeTruthy();
  });

  it.each(ALL_PRIVILEGED_RPCS)('cannot call RPC %s', async (rpcName) => {
    const anon = anonClient();
    const { error } = await anon.rpc(rpcName, {});
    expect(error).toBeTruthy();
    // PGRST202 = "function not found in schema cache". We DO NOT want that —
    // would mean we are testing a non-existent function and silently passing.
    expect(error!.code).not.toBe('PGRST202');
  });
});

describe('authenticated caller — impersonation gate', () => {
  it('cannot impersonate another user by passing arbitrary p_caller_id', async () => {
    const sessionA = await signInAs('userA@test.local', 'TestPwUserA1');
    // Post-migration, list_clients no longer accepts p_caller_id.
    // PostgREST returns a function-signature error.
    const { error } = await sessionA.rpc('list_clients', { p_caller_id: 1 } as any);
    expect(error).toBeTruthy();
    // Either "function does not exist" or schema-cache mismatch:
    const matchesExpectedShape =
      error!.code === 'PGRST202' ||
      error!.code === '42883' ||
      /function .* does not exist/i.test(error!.message);
    expect(matchesExpectedShape).toBe(true);
  });

  it('can call list_clients with the param-stripped signature', async () => {
    const sessionA = await signInAs('userA@test.local', 'TestPwUserA1');
    const { error } = await sessionA.rpc('list_clients', {});
    expect(error).toBeFalsy();
  });

  it('can fetch own profile via get_current_user_profile', async () => {
    const sessionA = await signInAs('userA@test.local', 'TestPwUserA1');
    const { data, error } = await sessionA.rpc('get_current_user_profile').single();
    expect(error).toBeFalsy();
    expect((data as any).email).toBe('userA@test.local');
  });
});

describe('deactivation invalidates session immediately', () => {
  it('deactivated user fails next RPC with unauthorized', async () => {
    const sessionC = await signInAs('userC@test.local', 'TestPwUserC1');
    const { data: profile } = await sessionC.rpc('get_current_user_profile').single();
    expect(profile).toBeTruthy();
    const userCId = (profile as any).id as number;

    try {
      await adminSetActive(userCId, false);
      const { error } = await sessionC.rpc('list_clients', {});
      expect(error).toBeTruthy();
      expect(error!.message?.toLowerCase() ?? '').toMatch(/unauthorized|28000/);
    } finally {
      // Always re-activate so subsequent runs work.
      await adminSetActive(userCId, true);
    }
  });
});
