import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MockFacilitator } from '../src/facilitator/mock.js';
import { IdempotencyStore } from '../src/idempotency.js';

describe('Idempotency, Replay Prevention, and Concurrency', () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    MOCK_PAYMENTS: 'true',
  });

  let mockFacilitator: MockFacilitator;
  let idempotencyStore: IdempotencyStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockFacilitator = new MockFacilitator();
    idempotencyStore = new IdempotencyStore();
    app = createApp(config, mockFacilitator, idempotencyStore);
  });

  const paymentHeader = Buffer.from(
    JSON.stringify({
      x402Version: 2,
      scheme: 'exact',
      network: 'eip155:84532',
      payload: {
        from: '0x2222222222222222222222222222222222222222',
        nonce: '0xidempotency_test_nonce_999',
        signature: '0xidempotency_signature_999',
      },
    })
  ).toString('base64');

  const originalBody = {
    language: 'typescript',
    errorText: 'TS2339: Property "id" does not exist on type "User".',
  };

  it('returns cached report on exact retry without re-calling verify or settle', async () => {
    // First attempt: settles
    const res1 = await request(app)
      .post('/api/debug/report')
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', paymentHeader)
      .send(originalBody);

    expect(res1.status).toBe(200);
    expect(mockFacilitator.verifyCallCount).toBe(1);
    expect(mockFacilitator.settleCallCount).toBe(1);

    // Second attempt (identical retry): must return cached outcome
    const res2 = await request(app)
      .post('/api/debug/report')
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', paymentHeader)
      .send(originalBody);

    expect(res2.status).toBe(200);
    expect(res2.body.summary).toBe(res1.body.summary);
    // Crucial check: verify and settle were NOT called a second time!
    expect(mockFacilitator.verifyCallCount).toBe(1);
    expect(mockFacilitator.settleCallCount).toBe(1);
  });

  it('rejects attempt to replay same payment signature on a DIFFERENT request body (409 Conflict)', async () => {
    // Settle for original body
    await request(app)
      .post('/api/debug/report')
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', paymentHeader)
      .send(originalBody);

    expect(mockFacilitator.settleCallCount).toBe(1);

    // Attempt to reuse same payment signature for a completely different error body
    const differentBody = {
      language: 'typescript',
      errorText: 'TS2304: Cannot find name "ConfigService".',
    };

    const resReplay = await request(app)
      .post('/api/debug/report')
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', paymentHeader)
      .send(differentBody);

    // Replay on different input MUST be rejected!
    expect(resReplay.status).toBe(409);
    expect(resReplay.body.error).toContain('bound to a different request body');
    // Settle count must remain 1
    expect(mockFacilitator.settleCallCount).toBe(1);
  });

  it('handles concurrent duplicate requests by sharing lock and settling only once', async () => {
    const concurrentHeader = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        scheme: 'exact',
        network: 'eip155:84532',
        payload: {
          from: '0x3333333333333333333333333333333333333333',
          nonce: '0xconcurrent_nonce_777',
          signature: '0xconcurrent_sig_777',
        },
      })
    ).toString('base64');

    const body = {
      language: 'go',
      errorText: 'panic: runtime error: index out of range [5] with length 3 at main.go:15',
    };

    // Fire 3 simultaneous requests with identical payload
    const [r1, r2, r3] = await Promise.all([
      request(app).post('/api/debug/report').set('Content-Type', 'application/json').set('PAYMENT-SIGNATURE', concurrentHeader).send(body),
      request(app).post('/api/debug/report').set('Content-Type', 'application/json').set('PAYMENT-SIGNATURE', concurrentHeader).send(body),
      request(app).post('/api/debug/report').set('Content-Type', 'application/json').set('PAYMENT-SIGNATURE', concurrentHeader).send(body),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);

    // Guaranteed: Settle called exactly once across all 3 concurrent requests!
    expect(mockFacilitator.settleCallCount).toBe(1);
  });
});
