import type { Env } from '../../../worker/env';
import { methodNotAllowed, withSecurityHeaders } from '../../../worker/lib/http';
import { isReferenceNumber } from '../../../shared/reference';

/**
 * GET /apply/thank-you/:ref
 *
 * The confirmation page needs the reference number in the URL, but Cloudflare
 * Pages only serves a static `index.html` for `/apply/thank-you/`. A `_redirects`
 * rewrite to that file is rejected by Pages as an infinite loop, so the route is
 * handled here instead: the dynamic path is rewritten internally to the built
 * page asset and returned with the original URL intact.
 *
 * A path that is not a valid reference number is passed through untouched, so
 * the static page renders its "we could not find a reference" message rather
 * than this function inventing a response.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const raw = context.params.ref;
  const ref = Array.isArray(raw) ? raw.join('/') : raw;

  if (!ref || !isReferenceNumber(ref)) {
    // Fall through to the static page.
    return context.next();
  }

  if (!context.env.ASSETS) {
    return context.next();
  }

  const assetUrl = new URL(context.request.url);
  assetUrl.pathname = '/apply/thank-you/index.html';
  assetUrl.search = '';

  const asset = await context.env.ASSETS.fetch(
    new Request(assetUrl.toString(), { method: 'GET', headers: context.request.headers }),
  );

  if (!asset.ok) return context.next();

  const headers = new Headers(asset.headers);
  withSecurityHeaders(headers);
  // The page is identical for everyone and holds no personal data, but it is
  // keyed by a reference number, so it is not cached by shared caches.
  headers.set('Cache-Control', 'no-store, private');

  return new Response(asset.body, { status: 200, headers });
};

export const onRequest: PagesFunction<Env> = async (context) =>
  context.request.method === 'HEAD' ? onRequestGet(context) : methodNotAllowed(['GET', 'HEAD']);
