import type { Env } from '../../../../../worker/env';
import { errorResponse, jsonResponse, methodNotAllowed, readJson } from '../../../../../worker/lib/http';
import { logInfo } from '../../../../../worker/lib/logger';
import { requireAdmin } from '../../../../../worker/services/adminGuard';
import { runHandler } from '../../../../../worker/lib/respond';
import { assertConfigured, deleteApplicationData } from '../../../../../worker/store/supabase';

/**
 * POST /api/admin/applications/:id/delete
 *
 * POPIA deletion on request. Removes the documents from storage, the
 * application row and everything that cascades from it, then records that the
 * deletion happened - the audit row keeps the reference number and who actioned
 * it, not the personal data that was removed.
 *
 * Restricted to administrators, and it requires an explicit confirmation
 * phrase so a mis-click cannot destroy an application.
 */
const CONFIRMATION_PHRASE = 'DELETE';

export const onRequestPost: PagesFunction<Env> = async (context) =>
  runHandler(async () => {
    const { request, env, params } = context;

    const guard = await requireAdmin(request, env);
    if (!guard.ok) return guard.response;

    assertConfigured(env);

    const applicationId = typeof params.id === 'string' ? params.id : '';
    if (!/^[0-9a-f-]{36}$/i.test(applicationId)) {
      return errorResponse('invalid_application', 'That application reference is not valid.', { status: 400 });
    }

    const body = await readJson<{ confirm?: unknown; reason?: unknown }>(request);
    if (body?.confirm !== CONFIRMATION_PHRASE) {
      return errorResponse(
        'confirmation_required',
        `Type ${CONFIRMATION_PHRASE} to confirm that this applicant's data must be erased.`,
        { status: 400 },
      );
    }

    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : null;

    const summary = await deleteApplicationData(env, {
      id: applicationId,
      actorId: guard.staff.userId,
      actorLabel: guard.staff.email,
      reason: reason || null,
    });

    if (!summary) return errorResponse('not_found', 'That application no longer exists.', { status: 404 });

    logInfo('application_data_deleted', { documents: summary.documentsDeleted, role: guard.staff.role });

    return jsonResponse({
      ok: true,
      referenceNumber: summary.referenceNumber,
      documentsDeleted: summary.documentsDeleted,
    });
  });

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(['POST']);
