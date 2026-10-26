import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

describe('Free Endpoints: Health and Catalog', () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    MOCK_PAYMENTS: 'true',
    REPORT_PRICE: '100000',
    X402_NETWORK: 'eip155:84532',
    X402_ASSET: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  });
  const app = createApp(config);

  it('GET /api/health returns liveness, mode, and network', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.mode).toBe('mock');
    expect(res.body.network).toBe('eip155:84532');
    expect(res.body.version).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });

  it('GET /api/catalog returns free and paid endpoints with prices from server config', async () => {
    const res = await request(app).get('/api/catalog');

    expect(res.status).toBe(200);
    expect(res.body.service).toBe('BugLens');
    expect(res.body.currency).toBe('USDC');
    expect(res.body.network).toBe('eip155:84532');

    const endpoints = res.body.endpoints;
    expect(Array.isArray(endpoints)).toBe(true);

    const paidEndpoint = endpoints.find((e: { path: string }) => e.path === '/api/debug/report');
    expect(paidEndpoint).toBeDefined();
    expect(paidEndpoint.isPaid).toBe(true);
    expect(paidEndpoint.price).toBe('100000');
    expect(paidEndpoint.network).toBe('eip155:84532');
    expect(paidEndpoint.asset).toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e');

    const basicEndpoint = endpoints.find((e: { path: string }) => e.path === '/api/debug/basic');
    expect(basicEndpoint).toBeDefined();
    expect(basicEndpoint.isPaid).toBe(false);
    expect(basicEndpoint.price).toBeNull();
  });
});
