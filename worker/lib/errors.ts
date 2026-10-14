import type { FieldError } from './http';

/** An error that is safe to show the client, with an explicit status code. */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: FieldError[];

  constructor(code: string, message: string, status = 400, fields?: FieldError[]) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

export class ValidationError extends AppError {
  constructor(fields: FieldError[]) {
    super('validation_failed', 'Please correct the highlighted fields and submit again.', 422, fields);
    this.name = 'ValidationError';
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super('server_misconfigured', message, 503);
    this.name = 'ConfigurationError';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
