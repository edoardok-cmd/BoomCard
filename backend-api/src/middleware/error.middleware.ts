import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { logger } from '../utils/logger';
import { trackError } from '../config/monitoring.config';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  details?: any;

  constructor(message: string, statusCode: number, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let isOperational = false;
  // Populated by the ZodError branch with per-field validation issues. AppError
  // carries its own `details`; this local handles non-AppError validation errors.
  let details: any;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    isOperational = err.isOperational;
  } else if (err instanceof multer.MulterError) {
    // Multer validation errors are client mistakes, not server faults
    statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.code === 'LIMIT_FILE_SIZE'
      ? 'File too large'
      : `Upload error: ${err.message}`;
    isOperational = true;
  } else if (err.message?.includes('Boundary not found') || err.message?.includes('Multipart')) {
    // Malformed multipart request (e.g. Content-Type without boundary)
    statusCode = 400;
    message = 'Malformed multipart request';
    isOperational = true;
  } else if (
    (err as any).name === 'ZodError' && Array.isArray((err as any).issues)
  ) {
    // Zod validation failure from a bare schema.parse() call. Without this branch
    // it falls through to the default 500 (+ stack in dev). A failed body/params
    // validation is a client mistake → map to 400 with a clean message and the
    // per-field issues in `details` (no stack leaked, since stack is 5xx-only below).
    statusCode = 400;
    message = 'Validation Error';
    isOperational = true;
    const issues = (err as any).issues as Array<{ path?: (string | number)[]; message?: string }>;
    details = issues.map((i) => ({
      field: Array.isArray(i.path) ? i.path.join('.') : undefined,
      message: i.message,
    }));
  } else if ((err as any).name === 'PrismaClientValidationError') {
    // Unvalidated/ill-typed input reached Prisma (e.g. NaN take/skip, wrong
    // field type, unknown arg). Prisma throws PrismaClientValidationError, which
    // is a CLIENT mistake, not a server fault — without this branch it falls
    // through to the default 500 (+ stack in dev, which leaks the query shape).
    // Map the whole class to a clean 400 with no stack and no Prisma internals.
    statusCode = 400;
    message = 'Invalid request parameters';
    isOperational = true;
  } else if ((err as any).name === 'PrismaClientKnownRequestError') {
    // Known, coded Prisma faults. A subset are client-attributable and map to
    // precise 4xx; everything else stays a 500 server fault (default below).
    const code = (err as any).code;
    if (code === 'P2025') {
      // Record required for the operation was not found.
      statusCode = 404;
      message = 'Resource not found';
      isOperational = true;
    } else if (code === 'P2002') {
      // Unique constraint violation — caller tried to create a duplicate.
      statusCode = 409;
      message = 'Resource already exists';
      isOperational = true;
    }
    // Other P-codes (P2003 FK, connection errors, etc.) are not mapped here and
    // remain 500 so they still get tracked/alerted as genuine faults.
  } else if (
    err instanceof SyntaxError &&
    ('body' in err || (err as any).type === 'entity.parse.failed')
  ) {
    // Malformed JSON request body — body-parser throws a SyntaxError with a
    // `body` property / type 'entity.parse.failed'. This is a client mistake,
    // not a server fault, so map it to a clean 400 (no stack leak below since
    // the stack is only attached for 5xx).
    statusCode = 400;
    message = 'Validation Error: Invalid JSON in request body';
    isOperational = true;
  } else if (err instanceof URIError) {
    // Express URL-decodes path params before reaching the route handler.
    // Invalid percent-encoding (e.g. %ff — lone continuation byte) throws a
    // URIError from decodeURIComponent. This is a client mistake → 400.
    statusCode = 400;
    message = 'Invalid request path encoding';
    isOperational = true;
  } else if (
    err?.constructor?.name === 'DriverAdapterError' ||
    (typeof (err as any)?.message === 'string' &&
      /invalid byte sequence for encoding/i.test((err as any).message))
  ) {
    // Prisma's pg adapter throws DriverAdapterError when a string parameter
    // contains a byte sequence invalid for the server's encoding (UTF-8). The
    // most common case is a null byte (%00) in a URL param or request body
    // field that bypasses earlier string-length validation. This is a client
    // mistake (malformed input), not a server fault → 400.
    statusCode = 400;
    message = 'Invalid characters in request';
    isOperational = true;
  }

  // Log error
  logger.error({
    message: err.message,
    stack: err.stack,
    statusCode,
    path: req.path,
    method: req.method,
  });

  // Track server errors for alerting (5xx only)
  if (statusCode >= 500) {
    trackError(err, { path: req.path, method: req.method, statusCode });
  }

  // Send response — `error` is always a plain string so frontend toast handlers
  // can use it directly without drilling into .message.
  res.status(statusCode).json({
    error: message,
    ...(err instanceof AppError && err.details && { details: err.details }),
    ...(details && { details }),
    // Only attach a stack trace for genuine server faults (5xx), and only in dev.
    // 4xx client errors (validation/auth) must never leak absolute server paths,
    // even in development — they are routine and the stack is noise + disclosure.
    ...(process.env.NODE_ENV === 'development' && statusCode >= 500 && { stack: err.stack }),
  });
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
