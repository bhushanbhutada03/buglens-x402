import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const RawEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z
      .string()
      .default('8787')
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().positive()),
    PAY_TO_ADDRESS: z.string().optional().default('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'),
    FACILITATOR_URL: z.string().url().optional().default('https://api.x402.org/v2/x402'),
    X402_NETWORK: z.string().default('eip155:84532'),
    X402_ASSET: z.string().default('0x036CbD53842c5426634e7929541eC2318f3dCF7e'),
    REPORT_PRICE: z.string().default('100000'), // 0.10 USDC (6 decimals)
    CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:8787,http://127.0.0.1:5173'),
    RATE_LIMIT_WINDOW_MS: z
      .string()
      .default('60000')
      .transform((val) => parseInt(val, 10)),
    RATE_LIMIT_MAX: z
      .string()
      .default('60')
      .transform((val) => parseInt(val, 10)),
    PAID_RATE_LIMIT_MAX: z
      .string()
      .default('30')
      .transform((val) => parseInt(val, 10)),
    BODY_LIMIT_BYTES: z
      .string()
      .default('32768')
      .transform((val) => parseInt(val, 10)),
    FACILITATOR_TIMEOUT_MS: z
      .string()
      .default('10000')
      .transform((val) => parseInt(val, 10)),
    AI_TIMEOUT_MS: z
      .string()
      .default('25000')
      .transform((val) => parseInt(val, 10)),
    AI_PROVIDER: z.string().optional(),
    AI_API_KEY: z.string().optional(),
    AI_MODEL: z.string().optional().default('gpt-4o-mini'),
    MOCK_PAYMENTS: z
      .string()
      .optional()
      .transform((val) => val === 'true' || val === '1'),
  })
  .superRefine((data, ctx) => {
    // Rule: MOCK_PAYMENTS is strictly forbidden in production
    if (data.NODE_ENV === 'production' && data.MOCK_PAYMENTS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'MOCK_PAYMENTS=true is strictly forbidden when NODE_ENV=production. Real facilitator is required.',
        path: ['MOCK_PAYMENTS'],
      });
    }

    // Rule: Wildcard CORS origin is forbidden in production
    if (data.NODE_ENV === 'production') {
      const origins = data.CORS_ORIGINS.split(',').map((o) => o.trim());
      if (origins.includes('*')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Wildcard CORS_ORIGINS="*" is forbidden when NODE_ENV=production.',
          path: ['CORS_ORIGINS'],
        });
      }
    }

    // In live mode (not mock), PAY_TO_ADDRESS and FACILITATOR_URL must be valid EVM address and URL
    if (!data.MOCK_PAYMENTS && data.NODE_ENV === 'production') {
      if (!/^0x[a-fA-F0-9]{40}$/.test(data.PAY_TO_ADDRESS)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'PAY_TO_ADDRESS must be a valid 20-byte EVM address in production live mode.',
          path: ['PAY_TO_ADDRESS'],
        });
      }
    }
  });

export function loadConfig(env = process.env) {
  const result = RawEnvSchema.safeParse(env);
  if (!result.success) {
    const formatted = result.error.errors
      .map((err) => `  - [${err.path.join('.') || 'root'}]: ${err.message}`)
      .join('\n');
    throw new Error(`Configuration startup validation failed:\n${formatted}`);
  }

  const parsed = result.data;
  const corsOriginsList = parsed.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    ...parsed,
    corsOriginsList,
    isMockMode: parsed.MOCK_PAYMENTS ?? (parsed.NODE_ENV !== 'production'),
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
export const config = loadConfig();
