import type { ErrorCode } from '@app/shared';

/** Typed application error thrown by services; converted to the API envelope by error middleware. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode | string,
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(message = 'Not found') {
    return new AppError('NOT_FOUND', 404, message);
  }
  static unauthenticated(message = 'Not authenticated') {
    return new AppError('UNAUTHENTICATED', 401, message);
  }
  static forbidden(message = 'Permission denied') {
    return new AppError('PERMISSION_DENIED', 403, message);
  }
  static conflict(message = 'Conflict') {
    return new AppError('CONFLICT', 409, message);
  }
  static badRequest(code: string, message: string, details?: unknown) {
    return new AppError(code, 400, message, details);
  }
}
