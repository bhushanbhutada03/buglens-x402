import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

describe('Security, Validation, and Content-Type Middleware', () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    MOCK_PAYMENTS: 'true',
    CORS_ORIGINS: 'https://trusted.app,http://localhost:5173',
    RATE_LIMIT_WINDOW_MS: '60000',
    RATE_LIMIT_MAX: '5', // Small threshold for testing
  });

  const app = createApp(config);

  it('rejects non-JSON Content-Type with HTTP 415', async () => {
    const res = await request(app)
      .post('/api/debug/basic')
      .set('Content-Type', 'text/plain')
      .send('Not JSON data');

    expect(res.status).toBe(415);
    expect(res.body.error).toContain('Unsupported Media Type');
  });

  it('rejects body containing forbidden payment fields with HTTP 400', async () => {
    const res = await request(app)
      .post('/api/debug/basic')
      .set('Content-Type', 'application/json')
      .send({
        language: 'javascript',
        errorText: 'Some error',
        paid: true, // Forbidden field attempting to spoof payment
      });

    expect(res.status).toBe(400);
    expect(res.body.details?.[0]?.message).toMatch(/paid/i);
  });

  it('rejects unknown fields in DebugInput with HTTP 400', async () => {
    const res = await request(app)
      .post('/api/debug/basic')
      .set('Content-Type', 'application/json')
      .send({
        language: 'javascript',
        errorText: 'Some error',
        unknownCustomField: 'inject',
      });

    expect(res.status).toBe(400);
  });

  it('includes Helmet security headers in responses', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('enforces rate limiting when request threshold is exceeded (HTTP 429)', async () => {
    // Send 6 requests rapidly when limit is 5
    const calls = [];
    for (let i = 0; i < 6; i++) {
      calls.push(request(app).get('/api/health'));
    }

    const results = await Promise.all(calls);
    const has429 = results.some((r) => r.status === 429);
    expect(has429).toBe(true);
  });
});
