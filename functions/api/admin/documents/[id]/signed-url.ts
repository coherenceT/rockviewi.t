import type { Env } from '../../../../../worker/env';
import { errorResponse, jsonResponse, methodNotAllowed, readJson } from '../../../../../worker/lib/http';
import { requireStaff } from '../../../../../worker/services/adminGuard';
import { runHandler } from '../../../../../worker/lib/respond';
import { assertConfigured, createDocumentSignedUrl } from '../../../../../worker/store/supabase';

/**
 * POST /api/admin/documents/:id/signed-url
 *
 * Issues a short-lived signed URL so a signed-in staff member can open one
 * document. The bucket stays private: no permanent URL exists, and the link
 * stops working minutes later. The service key never reaches the browser.
 */
const DEFAULT_EXPIRY_SECONDS = 300;
const MAX_EXPIRY_SECONDS = 900;

export const onRequestPost: PagesFunction<Env> = async (context) =>
  runHandler(async () => {
    const { request, env, params } = context;

    const guard = await requireStaff(request, env);
    if (!guard.ok) return guard.response;

    assertConfigured(env);

    const documentId = typeof params.id === 'string' ? params.id : '';
    if (!/^[0-9a-f-]{36}$/i.test(documentId)) {
      return errorResponse('invalid_document', 'That document reference is not valid.', { status: 400 });
    }

    const body = await readJson<{ expiresInSeconds?: unknown }>(request);
    const requested = Number(body?.expiresInSeconds);
    const expiresInSeconds =
      Number.isFinite(requested) && requested > 0
        ? Math.min(Math.trunc(requested), MAX_EXPIRY_SECONDS)
        : DEFAULT_EXPIRY_SECONDS;

    const signed = await createDocumentSignedUrl(env, documentId, expiresInSeconds);
    if (!signed) return errorResponse('not_found', 'That document no longer exists.', { status: 404 });

    return jsonResponse({
      ok: true,
      url: signed.url,
      expiresAt: signed.expiresAt,
      expiresInSeconds,
      downloadName: signed.downloadName,
      documentType: signed.documentType,
    });
  });

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(['POST']);
