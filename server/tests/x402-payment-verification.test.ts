import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MockFacilitator } from '../src/facilitator/mock.js';

describe('x402 Payment Verification & Edge Cases', () => {
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
    language: 'python',
    errorText: 'ZeroDivisionError: division by zero at math.py:10',
  };

  it('rejects malformed non-base64 PAYMENT-SIGNATURE with 400', async () => {
    const res = await request(app)
      .post('/api/debug/report')
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', '@@@INVALID_BASE64_NOT_JSON@@@')
      .send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Malformed PAYMENT-SIGNATURE header');
    expect(mockFacilitator.verifyCallCount).toBe(0);
    expect(mockFacilitator.settleCallCount).toBe(0);
  });

  it('rejects invalid signature payload when facilitator verification fails', async () => {
    const invalidSigHeader = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        scheme: 'exact',
        network: 'eip155:84532',
        payload: {
          testFlag: '__MOCK_FAIL_VERIFY__',
          signature: '0xinvalid',
        },
      })
    ).toString('base64');

    const res = await request(app)
      .post('/api/debug/report')
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', invalidSigHeader)
      .send(validBody);

    expect(res.status).toBe(402);
    expect(res.body.error).toContain('Payment authorization verification rejected');
    expect(mockFacilitator.verifyCallCount).toBe(1);
    expect(mockFacilitator.settleCallCount).toBe(0); // Settle must NEVER be called
    expect(res.body.summary).toBeUndefined(); // Zero report content
  });

  it('rejects payment on network mismatch and never calls settle', async () => {
    const wrongNetworkHeader = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        scheme: 'exact',
        network: 'eip155:1', // Ethereum mainnet instead of Base Sepolia 84532
        payload: {
          signature: '0xabc',
        },
      })
    ).toString('base64');

    const res = await request(app)
      .post('/api/debug/report')
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', wrongNetworkHeader)
      .send(validBody);

    expect(res.status).toBe(402);
    expect(mockFacilitator.settleCallCount).toBe(0);
  });
});
