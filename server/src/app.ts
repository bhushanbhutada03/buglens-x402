import express, { Express } from 'express';
import { AppConfig, config as defaultConfig } from './config.js';
import { createSecurityMiddlewares, safeErrorHandler } from './middleware/security.js';
import { createX402Handler } from './middleware/x402.js';
import { createRouter } from './routes.js';
import { IFacilitator } from './facilitator/types.js';
import { MockFacilitator } from './facilitator/mock.js';
import { HttpFacilitatorClient } from './facilitator/http.js';
import { IdempotencyStore } from './idempotency.js';

export function createApp(
  cfg: AppConfig = defaultConfig,
  customFacilitator?: IFacilitator,
  customStore?: IdempotencyStore
): Express {
  const app = express();

  // Create facilitator (mock or HTTP)
  const facilitator =
    customFacilitator ||
    (cfg.isMockMode
      ? new MockFacilitator()
      : new HttpFacilitatorClient(cfg.FACILITATOR_URL, cfg.FACILITATOR_TIMEOUT_MS));

  // Create idempotency store
  const idempotencyStore = customStore || new IdempotencyStore();

  // Security middlewares
  const { helmetMiddleware, corsMiddleware, generalLimiter, paidLimiter } =
    createSecurityMiddlewares(cfg);

  app.use(helmetMiddleware);
  app.use(corsMiddleware);

  // Body parser with strict size limit
  app.use(express.json({ limit: cfg.BODY_LIMIT_BYTES }));

  // General rate limiter on /api
  app.use('/api', generalLimiter);

  // x402 Handler
  const x402Handler = createX402Handler(cfg, facilitator, idempotencyStore);

  // Mount API router
  const router = createRouter(cfg, x402Handler, paidLimiter);
  app.use('/api', router);

  // Global safe error handler
  app.use(safeErrorHandler);

  return app;
}
