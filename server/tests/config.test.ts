import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('Configuration Validation & Production Safety Rules', () => {
  it('throws fast error if MOCK_PAYMENTS=true is set in production', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        MOCK_PAYMENTS: 'true',
        PAY_TO_ADDRESS: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        FACILITATOR_URL: 'https://api.x402.org/v2/x402',
        CORS_ORIGINS: 'https://buglens.app',
      })
    ).toThrow('MOCK_PAYMENTS=true is strictly forbidden when NODE_ENV=production');
  });

  it('throws fast error if wildcard CORS_ORIGINS is set in production', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        MOCK_PAYMENTS: 'false',
        PAY_TO_ADDRESS: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        FACILITATOR_URL: 'https://api.x402.org/v2/x402',
        CORS_ORIGINS: '*',
      })
    ).toThrow('Wildcard CORS_ORIGINS="*" is forbidden when NODE_ENV=production');
  });

  it('loads valid configuration successfully in development', () => {
    const cfg = loadConfig({
      NODE_ENV: 'development',
      MOCK_PAYMENTS: 'true',
    });
    expect(cfg.isMockMode).toBe(true);
    expect(cfg.PORT).toBe(8787);
  });
});
