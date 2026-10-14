import type { Env } from '../env';
import { bearerToken, errorResponse } from '../lib/http';
import { resolveStaff, type StaffIdentity } from '../lib/supabase';
import { logWarn } from '../lib/logger';

export type StaffGuard = { ok: true; staff: StaffIdentity } | { ok: false; response: Response };

/**
 * Authentication is not authorisation. A valid Supabase session only gets a
 * staff member through if their account is also on the staff allow-list.
 */
export async function requireStaff(request: Request, env: Env): Promise<StaffGuard> {
  const token = bearerToken(request);
  if (!token) {
    return { ok: false, response: errorResponse('unauthenticated', 'Sign in to continue.', { status: 401 }) };
  }

  const staff = await resolveStaff(env, token);
  if (!staff) {
    logWarn('admin_access_denied', { reason: 'not_staff' });
    return {
      ok: false,
      response: errorResponse('forbidden', 'This account does not have staff access to admissions.', { status: 403 }),
    };
  }

  return { ok: true, staff };
}

export async function requireAdmin(request: Request, env: Env): Promise<StaffGuard> {
  const guard = await requireStaff(request, env);
  if (!guard.ok) return guard;
  if (guard.staff.role !== 'admin') {
    return {
      ok: false,
      response: errorResponse('forbidden', 'This action requires an administrator account.', { status: 403 }),
    };
  }
  return guard;
}
