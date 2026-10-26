import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { decodePaymentRequiredHeader } from '@x402/core/http';

describe('x402 Unpaid Request Handling', () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    MOCK_PAYMENTS: 'true',
    REPORT_PRICE: '150000',
    PAY_TO_ADDRESS: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    X402_NETWORK: 'eip155:84532',
    X402_ASSET: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  });
  const app = createApp(config);

  it('returns HTTP 402 with PAYMENT-REQUIRED header when payment signature is missing', async () => {
    const payload = {
      language: 'javascript',
      errorText: 'ReferenceError: window is not defined at SSR (server.js:10:5)',
    };

    const res = await request(app)
      .post('/api/debug/report')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(402);
    expect(res.body.error).toBe('Payment Required');
    expect(res.body.statusCode).toBe(402);

    // Verify header exists
    const paymentRequiredHeader = res.headers['payment-required'];
    expect(paymentRequiredHeader).toBeDefined();

    // Decode header and verify requirements match server config
    const decoded = decodePaymentRequiredHeader(paymentRequiredHeader);
    expect(decoded.x402Version).toBe(2);
    expect(decoded.accepts.length).toBeGreaterThan(0);

    const req = decoded.accepts[0];
    expect(req.network).toBe('eip155:84532');
    expect(req.asset).toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e');
    expect(req.maxAmountRequired).toBe('150000');
    expect(req.payTo).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
    expect(req.resource).toBe('/api/debug/report');

    // Asserts response body contains NO report content
    expect(res.body.summary).toBeUndefined();
    expect(res.body.rootCause).toBeUndefined();
    expect(res.body.suggestedFix).toBeUndefined();
    expect(res.body.receipt).toBeUndefined();
  });
});
