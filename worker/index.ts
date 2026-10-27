import type { Env } from './env';
import { onRequest as apiMiddleware } from '../functions/api/_middleware';
import { onRequestPost as applicationsPost, onRequest as applicationsOther } from '../functions/api/applications';
import { onRequestPost as statusPost, onRequest as statusOther } from '../functions/api/status';
import { onRequestGet as earlyBirdGet, onRequest as earlyBirdOther } from '../functions/api/early-bird';
import { onRequestGet as thankYouGet, onRequest as thankYouOther } from '../functions/apply/thank-you/[[ref]]';
import { onRequestPost as deletePost, onRequest as deleteOther } from '../functions/api/admin/applications/[id]/delete';
import { onRequestGet as idNumberGet, onRequest as idNumberOther } from '../functions/api/admin/applications/[id]/id-number';
import { onRequestPost as signedUrlPost, onRequest as signedUrlOther } from '../functions/api/admin/documents/[id]/signed-url';
import { methodNotAllowed } from './lib/http';

interface RouteContext { request: Request; env: Env; params: Record<string, string | string[]>; next: () => Promise<Response> }
type PagesHandler = (context: RouteContext) => Promise<Response>;
const adapt = (handler: PagesFunction<Env>): PagesHandler => async (ctx) => handler({
  request: ctx.request, env: ctx.env, params: ctx.params, next: ctx.next,
  functionPath: '', data: {}, waitUntil: () => {}, passThroughOnException: () => {},
} as unknown as EventContext<Env, string, Record<string, unknown>>);
const makeContext = (request: Request, env: Env, params: Record<string, string | string[]> = {}): RouteContext => ({
  request, env, params, next: async () => env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 }),
});
const routes: Record<string, { GET?: PagesHandler; POST?: PagesHandler }> = {
  '/api/applications': { POST: adapt(applicationsPost), GET: adapt(applicationsOther) },
  '/api/status': { POST: adapt(statusPost), GET: adapt(statusOther) },
  '/api/early-bird': { GET: adapt(earlyBirdGet), POST: adapt(earlyBirdOther) },
};
async function withApiHeaders(request: Request, env: Env, params: Record<string, string | string[]>, handler: PagesHandler): Promise<Response> {
  const pageContext = makeContext(request, env, params);
  return adapt(apiMiddleware)({ ...pageContext, next: () => handler(pageContext) });
}
const methodNotAllowedForRoute = (route: { GET?: PagesHandler; POST?: PagesHandler }): Response => {
  const allowed = [route.GET && 'GET', route.POST && 'POST'].filter(Boolean) as string[];
  return methodNotAllowed(allowed);
};
const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url), method = request.method;
    const route = routes[url.pathname];
    if (route) {
      const handler = route[method as 'GET' | 'POST'];
      if (!handler) return methodNotAllowedForRoute(route);
      return withApiHeaders(request, env, {}, handler);
    }
    const matchDelete = /^\/api\/admin\/applications\/([^/]+)\/delete$/.exec(url.pathname);
    const matchId = /^\/api\/admin\/applications\/([^/]+)\/id-number$/.exec(url.pathname);
    const matchSigned = /^\/api\/admin\/documents\/([^/]+)\/signed-url$/.exec(url.pathname);
    let handler: PagesHandler | undefined;
    let params: Record<string, string | string[]> = {};
    if (matchDelete) { params = { id: decodeURIComponent(matchDelete[1]!) }; handler = adapt(method === 'POST' ? deletePost : deleteOther); }
    else if (matchId) { params = { id: decodeURIComponent(matchId[1]!) }; handler = adapt(method === 'GET' ? idNumberGet : idNumberOther); }
    else if (matchSigned) { params = { id: decodeURIComponent(matchSigned[1]!) }; handler = adapt(method === 'POST' ? signedUrlPost : signedUrlOther); }
    const thankYou = /^\/apply\/thank-you(?:\/(.*))?$/.exec(url.pathname);
    if (!handler && thankYou) { params = { ref: thankYou[1] ?? '' }; handler = adapt(method === 'GET' || method === 'HEAD' ? thankYouGet : thankYouOther); }
    if (handler) return url.pathname.startsWith('/api/') ? withApiHeaders(request, env, params, handler) : handler(makeContext(request, env, params));
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Static asset binding unavailable', { status: 404 });
  },
};
export default worker;
