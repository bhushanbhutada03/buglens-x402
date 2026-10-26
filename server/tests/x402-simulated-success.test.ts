import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MockFacilitator } from '../src/facilitator/mock.js';

describe('x402 Simulated Payment Success (Isolated Adapter)', () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    MOCK_PAYMENTS: 'true',
    X402_NETWORK: 'eip155:84532',
    REPORT_PRICE: '100000',
  });

  let mockFacilitator: MockFacilitator;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockFacilitator = new MockFacilitator();
    app = createApp(config, mockFacilitator);
  });

  it('[simulated] fulfills debugging report upon valid simulated payment authorization', async () => {
    const validPaymentHeader = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        scheme: 'exact',
        network: 'eip155:84532',
        payload: {
          from: '0x1111111111111111111111111111111111111111',
          nonce: '0xabc123456789',
          signature: '0xsimulated_signature_hash',
        },
      })
    ).toString('base64');

    const body = {
      language: 'javascript',
      errorText: 'TypeError: Cannot read properties of null (reading "map") at List.tsx:18:12',
      code: 'function List({ items }) { return items.map(i => <div key={i}>{i}</div>); }',
    };

    const res = await request(app)
      .post('/api/debug/report')
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', validPaymentHeader)
      .send(body);

    expect(res.status).toBe(200);

    // Verify facilitator spies
    expect(mockFacilitator.verifyCallCount).toBe(1);
    expect(mockFacilitator.settleCallCount).toBe(1);

    // Verify PAYMENT-RESPONSE header
    expect(res.headers['payment-response']).toBeDefined();

    // Verify Report Schema structure
    expect(res.body.summary).toBeDefined();
    expect(res.body.rootCause.confirmed).toBeInstanceOf(Array);
    expect(res.body.rootCause.hypotheses).toBeInstanceOf(Array);
    expect(res.body.debuggingSteps).toBeInstanceOf(Array);
    expect(res.body.suggestedFix).toBeDefined();
    expect(res.body.suggestedFix.executed).toBe(false); // Literal false per spec
    expect(res.body.verification).toBeInstanceOf(Array);

    // Verify receipt honesty
    expect(res.body.receipt).toBeDefined();
    expect(res.body.receipt.mode).toBe('mock');
    expect(res.body.receipt.transaction).toBeNull();
    expect(res.body.receipt.network).toBe('eip155:84532');
    expect(res.body.source).toBe('mock-template');
  });
});
