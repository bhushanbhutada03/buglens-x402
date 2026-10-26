import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from '@x402/core/http';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5174';

async function runSmokeTests() {
  console.log(`Starting live smoke tests against ${BASE_URL}...`);
  const results = [];

  function record(testName, passed, detail) {
    results.push({ testName, passed, detail });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${testName}: ${detail}`);
  }

  try {
    // 1. Health check
    const hRes = await fetch(`${BASE_URL}/api/health`);
    const hData = await hRes.json();
    record(
      'Server Health Check',
      hRes.status === 200 && hData.status === 'ok' && hData.mode === 'mock',
      `HTTP ${hRes.status}, mode=${hData.mode}, network=${hData.network}`
    );

    // 2. Catalog
    const cRes = await fetch(`${BASE_URL}/api/catalog`);
    const cData = await cRes.json();
    const paid = cData.endpoints?.find((e) => e.path === '/api/debug/report');
    record(
      'Server Catalog Check',
      cRes.status === 200 && paid?.isPaid === true && paid?.price === '100000',
      `HTTP ${cRes.status}, price=${paid?.price} atomic units (${parseInt(paid?.price, 10) / 1e6} USDC)`
    );

    // 3. Free Basic Analysis
    const jsTrace = `TypeError: Cannot read properties of undefined (reading 'avatar')
    at renderUserProfile (components/UserProfile.tsx:42:26)
    at renderWithHooks (node_modules/react-dom/cjs/react-dom.development.js:14985:18)`;

    const bRes = await fetch(`${BASE_URL}/api/debug/basic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'javascript',
        errorText: jsTrace,
        code: 'export function UserProfile({ user }) { return user.avatar.url; }',
      }),
    });
    const bData = await bRes.json();
    const bPassed =
      bRes.status === 200 &&
      bData.errorType === 'TypeError: Nullish Property Access' &&
      bData.frames?.length >= 1 &&
      bData.rootCause === undefined &&
      bData.suggestedFix === undefined &&
      bData.receipt === undefined;

    record(
      'Free Basic Analysis (Deterministic, No AI)',
      bPassed,
      `HTTP ${bRes.status}, type="${bData.errorType}", frames=${bData.frames?.length}, scrubbed=${bData.redactions}, paidSectionsAbsent=true`
    );

    // 4. Secret Sanitization Check
    const secretTrace = `KeyError: 'auth'
File "auth.py", line 12
API_KEY = "sk-proj-123456789012345678901234567890123456789012"
DATABASE_URL = "postgres://admin:supersecretpw@prod-db.internal:5432/main"`;

    const sRes = await fetch(`${BASE_URL}/api/debug/basic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'python',
        errorText: secretTrace,
      }),
    });
    const sData = await sRes.json();
    const sPassed =
      sRes.status === 200 &&
      sData.redactions >= 2 &&
      sData.normalizedTrace.includes('[REDACTED_DATABASE_CONNECTION_STRING]') &&
      !sData.normalizedTrace.includes('supersecretpw');

    record(
      'Server-Side Secret Sanitization',
      sPassed,
      `HTTP ${sRes.status}, scrubbed=${sData.redactions} secrets, credentials sanitized before processing`
    );

    // 5. Validation Rejections
    const emptyRes = await fetch(`${BASE_URL}/api/debug/basic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'javascript', errorText: '' }),
    });
    record(
      'Input Validation: Empty Trace Rejected',
      emptyRes.status === 400,
      `HTTP ${emptyRes.status} (expected 400)`
    );

    const ctRes = await fetch(`${BASE_URL}/api/debug/basic`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'non-json payload',
    });
    record(
      'Input Validation: Content-Type 415 Enforcement',
      ctRes.status === 415,
      `HTTP ${ctRes.status} (expected 415 Unsupported Media Type)`
    );

    const spoofRes = await fetch(`${BASE_URL}/api/debug/basic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'javascript',
        errorText: 'Some trace',
        paid: true, // Spoofed payment key
      }),
    });
    record(
      'Security: Spoofed Payment Field in Body Rejected',
      spoofRes.status === 400,
      `HTTP ${spoofRes.status} (expected 400 Bad Request)`
    );

    // 6. Unpaid Premium Request -> HTTP 402
    const unpaidRes = await fetch(`${BASE_URL}/api/debug/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'javascript',
        errorText: jsTrace,
      }),
    });
    const unpaidBody = await unpaidRes.json();
    const reqHeader = unpaidRes.headers.get('payment-required');
    let decodedReq = null;
    if (reqHeader) {
      try {
        decodedReq = decodePaymentRequiredHeader(reqHeader);
      } catch {
        decodedReq = JSON.parse(Buffer.from(reqHeader, 'base64').toString('utf8'));
      }
    }

    const firstReq = decodedReq?.accepts?.[0];
    const unpaidPassed =
      unpaidRes.status === 402 &&
      reqHeader !== null &&
      firstReq?.network === 'eip155:84532' &&
      firstReq?.maxAmountRequired === '100000' &&
      firstReq?.payTo === '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb' &&
      unpaidBody.summary === undefined;

    record(
      'Premium Debugging Request (Unpaid -> HTTP 402)',
      unpaidPassed,
      `HTTP ${unpaidRes.status}, PAYMENT-REQUIRED header present, network=${firstReq?.network}, asset=${firstReq?.asset}, amount=${firstReq?.maxAmountRequired}, zero report content delivered`
    );

    // 7. Invalid Payment Signature Rejection
    const invalidSigRes = await fetch(`${BASE_URL}/api/debug/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': '@@@INVALID_NOT_BASE64@@@',
      },
      body: JSON.stringify({ language: 'javascript', errorText: jsTrace }),
    });
    record(
      'Security: Malformed Payment Signature Rejected',
      invalidSigRes.status === 400,
      `HTTP ${invalidSigRes.status} (expected 400 Bad Request)`
    );

    // 8. Valid Mock Payment -> HTTP 200 + Unlocked Report
    const mockSigPayload = {
      x402Version: 2,
      scheme: firstReq?.scheme || 'exact',
      network: firstReq?.network || 'eip155:84532',
      payload: {
        from: '0x1111111111111111111111111111111111111111',
        nonce: '0x' + Date.now().toString(16),
        signature: '0xmock_settled_signature_pass',
        amount: firstReq?.maxAmountRequired || '100000',
        payTo: firstReq?.payTo,
        asset: firstReq?.asset,
      },
    };
    const mockSigHeader = Buffer.from(JSON.stringify(mockSigPayload)).toString('base64');

    const paidRes = await fetch(`${BASE_URL}/api/debug/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': mockSigHeader,
      },
      body: JSON.stringify({
        language: 'javascript',
        errorText: jsTrace,
        code: 'export function UserProfile({ user }) { return user.avatar.url; }',
      }),
    });

    const paidBody = await paidRes.json();
    const respHeader = paidRes.headers.get('payment-response');
    let decodedResp = null;
    if (respHeader) {
      try {
        decodedResp = decodePaymentResponseHeader(respHeader);
      } catch {
        decodedResp = JSON.parse(Buffer.from(respHeader, 'base64').toString('utf8'));
      }
    }

    const paidPassed =
      paidRes.status === 200 &&
      respHeader !== null &&
      decodedResp?.success === true &&
      paidBody.summary !== undefined &&
      paidBody.rootCause?.confirmed?.length > 0 &&
      paidBody.suggestedFix?.executed === false &&
      paidBody.receipt?.mode === 'mock' &&
      paidBody.receipt?.transaction === null;

    record(
      'Premium Debugging Report (Mock Payment Settlement)',
      paidPassed,
      `HTTP ${paidRes.status}, PAYMENT-RESPONSE success=${decodedResp?.success}, executed=${paidBody.suggestedFix?.executed} (Not executed or verified), receipt.mode=${paidBody.receipt?.mode}, receipt.transaction=${paidBody.receipt?.transaction}`
    );

    // 9. Idempotency: Replay with Same Body (Must return cached report)
    const replayRes = await fetch(`${BASE_URL}/api/debug/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': mockSigHeader,
      },
      body: JSON.stringify({
        language: 'javascript',
        errorText: jsTrace,
        code: 'export function UserProfile({ user }) { return user.avatar.url; }',
      }),
    });
    record(
      'Idempotency: Replay With Same Body (Cached Outcome)',
      replayRes.status === 200,
      `HTTP ${replayRes.status} (returned completed report from idempotency cache)`
    );

    // 10. Idempotency: Replay with Different Body (Must Reject with 409 Conflict)
    const replayDiffRes = await fetch(`${BASE_URL}/api/debug/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': mockSigHeader,
      },
      body: JSON.stringify({
        language: 'javascript',
        errorText: 'Completely different error message attempting to hijack settled signature',
      }),
    });
    record(
      'Idempotency: Replay With Different Body Rejected (409 Conflict)',
      replayDiffRes.status === 409,
      `HTTP ${replayDiffRes.status} (expected 409 Conflict)`
    );

    console.log('\n=== Smoke Test Summary ===');
    const allPassed = results.every((r) => r.passed);
    console.log(`Total: ${results.length}, Passed: ${results.filter((r) => r.passed).length}, Failed: ${results.filter((r) => !r.passed).length}`);
    if (!allPassed) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Smoke test error:', err);
    process.exit(1);
  }
}

runSmokeTests();
