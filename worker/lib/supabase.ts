import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';

/**
 * Supabase access is confined to the Worker. The service key is read from the
 * Worker environment and never leaves the server, so the browser cannot reach
 * the database with elevated rights at all.
 */

export function serviceClient(env: Env): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service credentials are not configured');
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'it-career-foundation-worker' } },
  });
}

export interface StaffIdentity {
  userId: string;
  email: string | null;
  role: 'staff' | 'admin';
}

/**
 * Verifies a staff access token with Supabase Auth and then confirms the user
 * is on the staff allow-list. Authentication alone is not authorisation: an
 * ordinary signed-in account must not be able to read applications.
 */
export async function resolveStaff(env: Env, accessToken: string): Promise<StaffIdentity | null> {
  const client = serviceClient(env);

  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return null;

  const { data: staffRow, error: staffError } = await client
    .from('staff_users')
    .select('user_id, email, role')
    .eq('user_id', data.user.id)
    .maybeSingle();

  if (staffError || !staffRow) return null;

  return {
    userId: staffRow.user_id as string,
    email: (staffRow.email as string | null) ?? data.user.email ?? null,
    role: staffRow.role === 'admin' ? 'admin' : 'staff',
  };
}
