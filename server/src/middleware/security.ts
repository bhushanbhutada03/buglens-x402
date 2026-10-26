import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { AppConfig } from '../config.js';

export function createSecurityMiddlewares(config: AppConfig) {
  // 1. Helmet headers
  const helmetMiddleware = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", ...config.corsOriginsList],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  // 2. CORS allowlist
  const corsMiddleware = cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (such as mobile apps, curl, or server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      if (config.corsOriginsList.includes(origin) || (!config.NODE_ENV.includes('prod') && origin.includes('localhost'))) {
        return callback(null, true);
      }

      callback(new Error(`CORS error: origin '${origin}' is not authorized by allowlist.`));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'PAYMENT-SIGNATURE',
      'payment-signature',
      'X-Payment-Signature',
      'Accept',
    ],
    exposedHeaders: ['PAYMENT-REQUIRED', 'PAYMENT-RESPONSE'],
    credentials: true,
  });

  // 3. Rate limiting
  const generalLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    limit: config.RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error: 'Too many requests. Please try again later.',
      retryAfterSeconds: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000),
    },
  });

  const paidLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    limit: config.PAID_RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error: 'Paid rate limit exceeded. Please back off before making further debug requests.',
      retryAfterSeconds: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000),
    },
  });

  return {
    helmetMiddleware,
    corsMiddleware,
    generalLimiter,
    paidLimiter,
  };
}

/**
 * Global safe error handler: never leaks stack traces, env secrets, or internal paths.
 */
export function safeErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const status =
    typeof (err as { statusCode?: number })?.statusCode === 'number'
      ? (err as { statusCode: number }).statusCode
      : typeof (err as { status?: number })?.status === 'number'
        ? (err as { status: number }).status
        : 500;

  const errorObj = err as Error;
  let message = errorObj?.message || 'Internal server error';

  // Sanitize message: never allow stack traces or paths
  if (status === 500 && process.env.NODE_ENV === 'production') {
    message = 'An unexpected internal error occurred. Please try again later.';
  }

  res.status(status).json({
    error: message,
    statusCode: status,
  });
}
