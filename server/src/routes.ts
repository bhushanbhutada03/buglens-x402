import { Router, Request, Response } from 'express';
import { AppConfig } from './config.js';
import { performBasicAnalysis } from './analyzer.js';
import { CatalogItem, DebugInput } from './schemas.js';
import { validateContentType, validateDebugInput } from './middleware/validation.js';

export function createRouter(
  config: AppConfig,
  x402Handler: ReturnType<typeof import('./middleware/x402.js').createX402Handler>,
  paidLimiter: import('express-rate-limit').RateLimitRequestHandler
): Router {
  const router = Router();

  // 1. Health check endpoint (free)
  router.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'BugLens Debugging Assistant',
      version: '1.0.0',
      mode: config.isMockMode ? 'mock' : 'live',
      network: config.X402_NETWORK,
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Catalog endpoint (free) - prices and endpoints from server config
  router.get('/catalog', (_req: Request, res: Response) => {
    const catalog: CatalogItem[] = [
      {
        path: '/api/health',
        method: 'GET',
        isPaid: false,
        price: null,
        asset: null,
        network: config.X402_NETWORK,
        description: 'Server health, liveness, and payment mode status',
      },
      {
        path: '/api/catalog',
        method: 'GET',
        isPaid: false,
        price: null,
        asset: null,
        network: config.X402_NETWORK,
        description: 'Catalog of free and x402-monetized API endpoints and current pricing',
      },
      {
        path: '/api/debug/basic',
        method: 'POST',
        isPaid: false,
        price: null,
        asset: null,
        network: null,
        description:
          'Free deterministic error analysis: stack frame extraction, language classification, and static hints without AI',
      },
      {
        path: '/api/debug/report',
        method: 'POST',
        isPaid: true,
        price: config.REPORT_PRICE,
        asset: config.X402_ASSET,
        network: config.X402_NETWORK,
        description:
          'Comprehensive AI debugging report: root cause diagnosis, step-by-step guidance, and suggested fix (x402 payment required)',
      },
    ];

    res.status(200).json({
      service: 'BugLens',
      currency: 'USDC',
      decimals: 6,
      network: config.X402_NETWORK,
      mode: config.isMockMode ? 'mock' : 'live',
      endpoints: catalog,
    });
  });

  // 3. Deterministic basic analysis (free, no AI call, no payment)
  router.post(
    '/debug/basic',
    validateContentType,
    validateDebugInput,
    (req: Request, res: Response) => {
      const input = (req as Request & { validatedInput: DebugInput }).validatedInput;
      const result = performBasicAnalysis(input);
      res.status(200).json(result);
    }
  );

  // 4. Paid report endpoint (x402 protected)
  router.post(
    '/debug/report',
    paidLimiter,
    validateContentType,
    validateDebugInput,
    x402Handler
  );

  return router;
}
