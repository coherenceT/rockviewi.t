import { isAppError } from './errors';
import { errorResponse } from './http';
import { logError } from './logger';

/**
 * Turns an unexpected failure into a generic 500 (never leaking internals) and
 * a known AppError into its declared status and code.
 */
export async function runHandler(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (isAppError(error)) {
      logError('api_error', { reason: error.code, statusCode: error.status });
      return errorResponse(error.code, error.message, { status: error.status, fields: error.fields });
    }
    logError('unhandled_api_error', { reason: 'unexpected' }, error);
    return errorResponse('internal_error', 'Something went wrong on our side. Please try again shortly.', {
      status: 500,
    });
  }
}
