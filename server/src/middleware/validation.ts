import { Request, Response, NextFunction } from 'express';
import { DebugInputSchema } from '../schemas.js';

/**
 * Validates Content-Type header on POST requests (must be application/json).
 * Returns HTTP 415 Unsupported Media Type if invalid.
 */
export function validateContentType(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.method === 'POST') {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.toLowerCase().includes('application/json')) {
      res.status(415).json({
        error: 'Unsupported Media Type. Content-Type must be application/json.',
        statusCode: 415,
      });
      return;
    }
  }
  next();
}

/**
 * Middleware that parses and validates DebugInput against the strict Zod schema.
 * Rejects unknown fields, oversize strings, and forbidden payment fields.
 * Returns HTTP 400 if validation fails.
 */
export function validateDebugInput(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const result = DebugInputSchema.safeParse(req.body);

  if (!result.success) {
    const errorDetails = result.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    res.status(400).json({
      error: 'Invalid request payload',
      details: errorDetails,
      statusCode: 400,
    });
    return;
  }

  // Attach sanitized/validated data to request
  (req as Request & { validatedInput: typeof result.data }).validatedInput = result.data;
  next();
}
