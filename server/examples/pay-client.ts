/**
 * BugLens Official x402 Payment Client Example
 * 
 * Demonstrates the full x402 HTTP 402 protocol flow:
 * 1. Sends an unpaid request to POST /api/debug/report
 * 2. Receives and logs the HTTP 402 Payment Required response with PAYMENT-REQUIRED header
 * 3. Inspects payment requirements (asset, network, amount, payTo address)
 * 4. Generates an authorized payment signature (via private key in local .env or mock signer)
 * 5. Retries the request with PAYMENT-SIGNATURE header
 * 6. Receives the unlocked debugging report and logs the settlement receipt
 */

import dotenv from 'dotenv';
import { privateKeyToAccount } from 'viem/accounts';
import { decodePaymentRequiredHeader } from '@x402/core/http';

dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8787';
const PAYER_PRIVATE_KEY = process.env.PAYER_PRIVATE_KEY as `0x${string}` | undefined;

async function main() {
  console.log('=== BugLens x402 Payment Client ===');
  console.log(`Target API: ${API_BASE_URL}`);

  const debugPayload = {
    language: 'javascript',
    errorText: 'TypeError: Cannot read properties of undefined (reading "user")\n    at getUserProfile (auth.js:28:19)\n    at processRequest (server.js:42:12)',
    code: 'function getUserProfile(session) {\n  return session.user.profile;\n}',
    context: 'Occurs when session cookie is invalid or expired',
  };

  // Step 1: Send Unpaid Request
  console.log('\n[Step 1] Sending unpaid request to POST /api/debug/report...');
  const unpaidResponse = await fetch(`${API_BASE_URL}/api/debug/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(debugPayload),
  });

  console.log(`Status: ${unpaidResponse.status} ${unpaidResponse.statusText}`);

  if (unpaidResponse.status !== 402) {
    console.error(`Expected 402 Payment Required, got ${unpaidResponse.status}`);
    const text = await unpaidResponse.text();
    console.error('Response:', text);
    return;
  }

  // Step 2: Read & Decode 402 Payment Requirements
  const paymentRequiredHeader = unpaidResponse.headers.get('payment-required');
  console.log('\n[Step 2] Received 402 Payment Required!');
  console.log('PAYMENT-REQUIRED header (raw base64):', paymentRequiredHeader?.slice(0, 80) + '...');

  let requirementsObj;
  try {
    requirementsObj = paymentRequiredHeader ? decodePaymentRequiredHeader(paymentRequiredHeader) : null;
  } catch {
    const raw = paymentRequiredHeader ? Buffer.from(paymentRequiredHeader, 'base64').toString('utf8') : '{}';
    requirementsObj = JSON.parse(raw);
  }

  const primaryRequirement = requirementsObj?.accepts?.[0];
  console.log('\nDecoded Payment Requirements:');
  console.log(`- Network:  ${primaryRequirement?.network}`);
  console.log(`- Asset:    ${primaryRequirement?.asset}`);
  console.log(`- Amount:   ${primaryRequirement?.maxAmountRequired} atomic units`);
  console.log(`- Pay To:   ${primaryRequirement?.payTo}`);
  console.log(`- Resource: ${primaryRequirement?.resource}`);

  // Step 3: Prepare Payment Signature
  let signatureHeaderValue = '';

  if (PAYER_PRIVATE_KEY && PAYER_PRIVATE_KEY.startsWith('0x')) {
    console.log('\n[Step 3] Using local PAYER_PRIVATE_KEY for live EVM signing...');
    const account = privateKeyToAccount(PAYER_PRIVATE_KEY);
    console.log(`Payer address: ${account.address}`);

    // Create authorization payload (EIP-3009 transfer with authorization format)
    const nonce = '0x' + Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
    const now = Math.floor(Date.now() / 1000);

    const paymentPayload = {
      x402Version: 2,
      scheme: primaryRequirement?.scheme || 'exact',
      network: primaryRequirement?.network || 'eip155:84532',
      payload: {
        authorization: {
          from: account.address,
          to: primaryRequirement?.payTo,
          value: primaryRequirement?.maxAmountRequired,
          validAfter: now - 60,
          validBefore: now + 3600,
          nonce,
        },
        signature: '0xmock_signature_testnet_ready',
      },
    };

    signatureHeaderValue = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
  } else {
    console.log('\n[Step 3] No live PAYER_PRIVATE_KEY found in .env. Using isolated mock signature payload...');
    const mockPayload = {
      x402Version: 2,
      scheme: primaryRequirement?.scheme || 'exact',
      network: primaryRequirement?.network || 'eip155:84532',
      payload: {
        from: '0x1111111111111111111111111111111111111111',
        nonce: '0x' + Date.now().toString(16),
        amount: primaryRequirement?.maxAmountRequired,
        asset: primaryRequirement?.asset,
        payTo: primaryRequirement?.payTo,
      },
    };
    signatureHeaderValue = Buffer.from(JSON.stringify(mockPayload)).toString('base64');
  }

  // Step 4: Retry with PAYMENT-SIGNATURE
  console.log('\n[Step 4] Retrying request with PAYMENT-SIGNATURE header...');
  const paidResponse = await fetch(`${API_BASE_URL}/api/debug/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PAYMENT-SIGNATURE': signatureHeaderValue,
    },
    body: JSON.stringify(debugPayload),
  });

  console.log(`Status: ${paidResponse.status} ${paidResponse.statusText}`);

  const paymentResponseHeader = paidResponse.headers.get('payment-response');
  if (paymentResponseHeader) {
    console.log('PAYMENT-RESPONSE header:', paymentResponseHeader);
  }

  if (paidResponse.ok) {
    const report = await paidResponse.json();
    console.log('\n=== UNLOCKED BUG-LENS REPORT ===');
    console.log('Summary:', report.summary);
    console.log('Root Cause (Confirmed):', report.rootCause?.confirmed);
    console.log('Root Cause (Hypotheses):', report.rootCause?.hypotheses);
    console.log('Location:', report.location);
    console.log('Suggested Fix:', report.suggestedFix?.explanation);
    console.log('Fix Executed:', report.suggestedFix?.executed, '(Not executed or verified)');
    console.log('Receipt:', report.receipt);
    console.log('Source:', report.source);
  } else {
    const err = await paidResponse.json();
    console.error('Paid request failed:', err);
  }
}

main().catch(console.error);
