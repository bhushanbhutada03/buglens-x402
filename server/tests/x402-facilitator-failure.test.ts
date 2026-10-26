import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MockFacilitator } from '../src/facilitator/mock.js';

describe('x402 Facilitator Failures & Settlement Edge Cases', () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    MOCK_PAYMENTS: 'true',
    X402_NETWORK: 'eip155:84532',
  });

  let mockFacilitator: MockFacilitator;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockFacilitator = new MockFacilitator();
    app = createApp(config, mockFacilitator);
  });

  const validBody = {
    language: 'rust',
    errorText: 'error[E0382]: use of moved value: `v` at main.rs:12:5',
  };

  it('handles facilitator verification timeout safely (returns 504, zero content)', async () => {
    const timeoutHeader = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        scheme: 'exact',
        network: 'eip155:84532',
        payload: {
          testFlag: '__MOCK_TIMEOUT_VERIFY__',
          signature: '0x123',
        },
      })
    ).toString('base64');

    const res = await request(app)
      .post('/api/debug/report')
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', timeoutHeader)
      .send(validBody);

    expect(res.status).toBe(504);
    expect(res.body.error).toContain('Facilitator verification timed out');
    expect(res.body.summary).toBeUndefined();
    expect(mockFacilitator.settleCallCount).toBe(0);
  });

  it('handles onchain settlement failure (withholds report, records failure)', async () => {
    const failSettleHeader = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        scheme: 'exact',
        network: 'eip155:84532',
        payload: {
          testFlag: '__MOCK_FAIL_SETTLE__',
          signature: '0xsettle_fail_key',
        },
      })
    ).toString('base64');

    const res = await request(app)
      .post('/api/debug/report')
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', failSettleHeader)
      .send(validBody);

    expect(res.status).toBe(402);
    expect(res.body.error).toContain('Settlement failed');
    expect(res.body.summary).toBeUndefined(); // Zero report content
    expect(mockFacilitator.settleCallCount).toBe(1);
  });

  it('handles pending settlement safely (returns 202, withholds report)', async () => {
    const pendingHeader = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        scheme: 'exact',
        network: 'eip155:84532',
        payload: {
          testFlag: '__MOCK_PENDING_SETTLE__',
          signature: '0xpending_key',
        },
      })
    ).toString('base64');

    const res = await request(app)
      .post('/api/debug/report')
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', pendingHeader)
      .send(validBody);

    expect(res.status).toBe(202);
    expect(res.body.error).toContain('pending');
    expect(res.body.summary).toBeUndefined(); // Zero report content
  });
});
