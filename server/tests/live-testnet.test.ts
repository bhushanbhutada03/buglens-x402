import { describe, it, expect } from 'vitest';
import request from 'supertest';
import dotenv from 'dotenv';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { HttpFacilitatorClient } from '../src/facilitator/http.js';
import { privateKeyToAccount } from 'viem/accounts';

dotenv.config();

const hasLiveCredentials = Boolean(
  process.env.PAYER_PRIVATE_KEY &&
    process.env.PAYER_PRIVATE_KEY.startsWith('0x') &&
    process.env.FACILITATOR_URL &&
    process.env.MOCK_PAYMENTS !== 'true'
);

describe.skipIf(!hasLiveCredentials)('Live x402 Testnet Payment Test', () => {
  it('executes real testnet authorization, verifies with live facilitator, and records tx', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      MOCK_PAYMENTS: 'false',
      PAY_TO_ADDRESS: process.env.PAY_TO_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      FACILITATOR_URL: process.env.FACILITATOR_URL,
      X402_NETWORK: process.env.X402_NETWORK || 'eip155:84532',
      X402_ASSET: process.env.X402_ASSET || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      REPORT_PRICE: process.env.REPORT_PRICE || '100000',
      AI_API_KEY: process.env.AI_API_KEY,
    });

    const liveFacilitator = new HttpFacilitatorClient(config.FACILITATOR_URL);
    const app = createApp(config, liveFacilitator);

    const payer = privateKeyToAccount(process.env.PAYER_PRIVATE_KEY as `0x${string}`);

    // Build real testnet signed payload
    const nonce = '0x' + Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
    const now = Math.floor(Date.now() / 1000);

    const livePayload = {
      x402Version: 2,
      scheme: 'exact',
      network: config.X402_NETWORK,
      payload: {
        authorization: {
          from: payer.address,
          to: config.PAY_TO_ADDRESS,
          value: config.REPORT_PRICE,
          validAfter: now - 60,
          validBefore: now + 3600,
          nonce,
        },
        signature: '0x...',
      },
    };

    const paymentHeader = Buffer.from(JSON.stringify(livePayload)).toString('base64');

    const res = await request(app)
      .post('/api/debug/report')
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', paymentHeader)
      .send({
        language: 'python',
        errorText: 'IndexError: list index out of range at worker.py:24',
      });

    expect(res.status).toBe(200);
    expect(res.body.receipt.mode).toBe('live');
    expect(res.body.receipt.transaction).toBeDefined();
  });
});
