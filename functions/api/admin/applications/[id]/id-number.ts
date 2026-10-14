import type { Env } from '../../../../../worker/env';
import { errorResponse, jsonResponse, methodNotAllowed } from '../../../../../worker/lib/http';
import { requireStaff } from '../../../../../worker/services/adminGuard';
import { runHandler } from '../../../../../worker/lib/respond';
import { assertConfigured, readIdNumberForStaff } from '../../../../../worker/store/supabase';

/**
 * GET /api/admin/applications/:id/id-number
 *
 * The ID or passport number is stored encrypted. Staff need it to check the
 * certified copy they were given, so it is decrypted on the server, for staff
 * only, and returned for that one request. It is never included in the general
 * application record, so it cannot leak through a broad read.
 */
export const onRequestGet: PagesFunction<Env> = async (context) =>
  runHandler(async () => {
    const { request, env, params } = context;

    const guard = await requireStaff(request, env);
    if (!guard.ok) return guard.response;

    assertConfigured(env);

    const applicationId = typeof params.id === 'string' ? params.id : '';
    if (!/^[0-9a-f-]{36}$/i.test(applicationId)) {
      return errorResponse('invalid_application', 'That application reference is not valid.', { status: 400 });
    }

    const idNumber = await readIdNumberForStaff(env, applicationId);
    return jsonResponse({ ok: true, idNumber });
  });

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(['GET']);
