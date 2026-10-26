import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

describe('Deterministic Basic Analysis (Free)', () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    MOCK_PAYMENTS: 'true',
  });
  const app = createApp(config);

  it('performs deterministic analysis and stack frame extraction without payment', async () => {
    const payload = {
      language: 'javascript',
      errorText:
        'TypeError: Cannot read properties of undefined (reading "name")\n    at getUser (file:///src/user.ts:42:15)\n    at processHandler (file:///src/handler.ts:108:5)',
      code: 'function getUser(req) { return req.user.name; }',
      context: 'User login flow',
    };

    const res = await request(app)
      .post('/api/debug/basic')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.detectedLanguage).toBe('javascript');
    expect(res.body.errorType).toBe('TypeError: Nullish Property Access');
    expect(res.body.frames.length).toBeGreaterThanOrEqual(2);
    expect(res.body.frames[0]).toMatchObject({ line: 42 });
    expect(res.body.hints.length).toBeGreaterThan(0);
    expect(res.body.limitations).toBeDefined();

    // STRICT CHECK: basic analysis must NEVER contain paid report sections
    expect(res.body.rootCause).toBeUndefined();
    expect(res.body.suggestedFix).toBeUndefined();
    expect(res.body.debuggingSteps).toBeUndefined();
    expect(res.body.verification).toBeUndefined();
    expect(res.body.receipt).toBeUndefined();
  });

  it('redacts secrets server-side and reports redactions count', async () => {
    const payload = {
      language: 'python',
      errorText:
        'KeyError: "token"\nTraceback (most recent call last):\n  File "auth.py", line 12, in <module>\nAPI_KEY = "sk-proj-123456789012345678901234567890123456789012"\npostgres://user:secretpw@localhost:5432/mydb',
    };

    const res = await request(app)
      .post('/api/debug/basic')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.redactions).toBeGreaterThanOrEqual(2);
    expect(res.body.normalizedTrace).toContain('[REDACTED_DATABASE_CONNECTION_STRING]');
    expect(res.body.normalizedTrace).not.toContain('secretpw');
  });
});
