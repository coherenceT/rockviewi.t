/**
 * Structured logging that cannot leak personal data.
 *
 * Worker logs are not a personal-data store, so instead of trusting every call
 * site to remember, the logger itself refuses to emit a field whose name looks
 * like personal data. Anything it drops is replaced with '[redacted]' so the
 * omission is visible in the log line too.
 */

const PII_KEY_PATTERN =
  /(name|email|mail|mobile|phone|tel|address|suburb|city|postal|id_?number|passport|birth|dob|guardian|note|reference|body|html|token|secret|key)/i;

const ALLOWED_KEYS = new Set([
  'event',
  'level',
  'requestId',
  'path',
  'method',
  'status',
  'statusCode',
  'durationMs',
  'pathway',
  'documents',
  'documentType',
  'bytes',
  'attempts',
  'provider',
  'template',
  'outcome',
  'reason',
  'count',
  'remaining',
  'limit',
  'role',
  'environment',
  'ipHash',
  'errorCode',
]);

export type LogValue = string | number | boolean | null | undefined;

export interface LogFields {
  [key: string]: LogValue;
}

export type LogLevel = 'info' | 'warn' | 'error';

function sanitise(fields: LogFields | undefined): Record<string, LogValue> {
  if (!fields) return {};
  const output: Record<string, LogValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (ALLOWED_KEYS.has(key)) {
      output[key] = value;
      continue;
    }
    if (PII_KEY_PATTERN.test(key)) {
      output[key] = '[redacted]';
      continue;
    }
    // Unknown field: keep the name, drop the value. Never guess.
    output[key] = '[omitted]';
  }
  return output;
}

function emit(level: LogLevel, event: string, fields?: LogFields): void {
  const line = JSON.stringify({ level, event, ...sanitise(fields) });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function logInfo(event: string, fields?: LogFields): void {
  emit('info', event, fields);
}

export function logWarn(event: string, fields?: LogFields): void {
  emit('warn', event, fields);
}

export function logError(event: string, fields?: LogFields, error?: unknown): void {
  // Only the error class and a short, name-free message are recorded.
  const errorCode =
    error instanceof Error ? error.name : error === undefined ? undefined : typeof error;
  emit('error', event, { ...fields, errorCode: errorCode ?? null });
}

/**
 * A short, non-reversible correlation value. Lets us count attempts from one
 * source without storing the source address itself.
 */
export async function hashForLog(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex.slice(0, 16);
}
