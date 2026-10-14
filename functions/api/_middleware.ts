import type { Env } from '../../worker/env';
import { withSecurityHeaders } from '../../worker/lib/http';

/**
 * Security headers for the API surface. Static assets get the same set from
 * public/_headers, which is cheaper than running a Function for every asset.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const response = await context.next();
  const headers = new Headers(response.headers);
  withSecurityHeaders(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
