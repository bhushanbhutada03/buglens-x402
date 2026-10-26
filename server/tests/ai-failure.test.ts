import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MockFacilitator } from '../src/facilitator/mock.js';

describe('AI Failure & Readiness Safeguards', () => {
  it('returns HTTP 503 before any 402 when outside mock mode and AI provider is unconfigured', async () => {
    // Live mode without AI key
    const liveConfig = loadConfig({
      NODE_ENV: 'test',
      MOCK_PAYMENTS: 'false',
      AI_API_KEY: '', // Missing key
      PAY_TO_ADDRESS: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      FACILITATOR_URL: 'https://api.x402.org/v2/x402',
    });

    const mockFacilitator = new MockFacilitator();
    const app = createApp(liveConfig, mockFacilitator);

    const res = await request(app)
      .post('/api/debug/report')
      .set('Content-Type', 'application/json')
      .send({
        language: 'javascript',
        errorText: 'Error: Connection lost',
      });

    // Mandatory rule: Server must not request payment for a service it cannot deliver
    expect(res.status).toBe(503);
    expect(res.body.error).toContain('temporarily unavailable');
    expect(res.headers['payment-required']).toBeUndefined();
    expect(mockFacilitator.verifyCallCount).toBe(0);
    expect(mockFacilitator.settleCallCount).toBe(0);
  });
});
