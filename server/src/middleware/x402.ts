import { Request, Response, NextFunction } from 'express';
import { AppConfig } from '../config.js';
import { IFacilitator } from '../facilitator/types.js';
import { IdempotencyStore } from '../idempotency.js';
import { sanitizeInput, computeBodyHash } from '../sanitizer.js';
import { generateReport } from '../ai.js';
import {
  DebugInput,
  PaymentRequiredHeader,
  PaymentRequirementsV2,
  PaymentSignatureHeaderSchema,
} from '../schemas.js';
import {
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from '@x402/core/http';

export function createX402Handler(
  config: AppConfig,
  facilitator: IFacilitator,
  idempotencyStore: IdempotencyStore
) {
  return async function x402Middleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const input = (req as Request & { validatedInput: DebugInput }).validatedInput;
    if (!input) {
      res.status(400).json({ error: 'Request body must be validated before payment check.' });
      return;
    }

    // Step 2: Readiness check
    // Outside mock mode, if AI provider is not configured, fail with 503 before issuing 402
    if (!config.isMockMode && (!config.AI_API_KEY || config.AI_API_KEY.trim().length === 0)) {
      res.status(503).json({
        error: 'AI diagnostic service is temporarily unavailable. Provider credentials not configured.',
        statusCode: 503,
      });
      return;
    }

    // Step 3: Compute canonical bodyHash and build server requirements
    const { sanitizedInput } = sanitizeInput(input);
    const bodyHash = computeBodyHash(sanitizedInput);
    const resourcePath = req.originalUrl || req.path || '/api/debug/report';

    const requirements: PaymentRequirementsV2 = {
      scheme: 'exact',
      network: config.X402_NETWORK,
      maxAmountRequired: config.REPORT_PRICE,
      resource: resourcePath,
      description: 'BugLens Premium AI Debugging Diagnostic Report',
      mimeType: 'application/json',
      payTo: config.PAY_TO_ADDRESS,
      maxTimeoutSeconds: 60,
      asset: config.X402_ASSET,
      extra: {
        name: 'USDC',
        version: '2',
        decimals: 6,
        assetTransferMethod: 'eip3009',
      },
    };

    const paymentRequiredObj: PaymentRequiredHeader = {
      x402Version: 2,
      accepts: [requirements],
    };

    // Check for payment signature header
    const rawHeader =
      req.headers['payment-signature'] ||
      req.headers['payment_signature'] ||
      req.headers['x-payment-signature'];

    const signatureHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    // If no payment header: respond with HTTP 402
    if (!signatureHeader) {
      let encodedHeader: string;
      try {
        encodedHeader = encodePaymentRequiredHeader(paymentRequiredObj as unknown as Parameters<typeof encodePaymentRequiredHeader>[0]);
      } catch {
        encodedHeader = Buffer.from(JSON.stringify(paymentRequiredObj)).toString('base64');
      }

      res.setHeader('PAYMENT-REQUIRED', encodedHeader);
      res.status(402).json({
        error: 'Payment Required',
        statusCode: 402,
        requirements: paymentRequiredObj,
        instructions:
          'Sign an x402 payment authorization matching the required asset, network, and amount, then retry with the PAYMENT-SIGNATURE header.',
      });
      return;
    }

    // Step 4: Payment header present - decode and validate structurally
    let parsedSignatureHeader: Record<string, unknown>;
    try {
      const decodedStr = signatureHeader.trim().startsWith('{')
        ? signatureHeader.trim()
        : Buffer.from(signatureHeader.trim(), 'base64').toString('utf8');
      parsedSignatureHeader = JSON.parse(decodedStr);
    } catch {
      res.status(400).json({
        error: 'Malformed PAYMENT-SIGNATURE header. Must be valid base64-encoded JSON.',
        statusCode: 400,
      });
      return;
    }

    const sigResult = PaymentSignatureHeaderSchema.safeParse(parsedSignatureHeader);
    if (!sigResult.success) {
      res.status(400).json({
        error: 'Invalid payment signature structure',
        details: sigResult.error.errors.map((e) => e.message),
        statusCode: 400,
      });
      return;
    }

    const paymentPayload = sigResult.data;

    // Idempotency authorization key
    const authKey = idempotencyStore.computeAuthKey(paymentPayload.payload);

    // Check idempotency store for existing outcome or collision
    const existing = idempotencyStore.get(authKey, bodyHash, resourcePath);
    if (existing.mismatch) {
      res.status(409).json({
        error:
          'Payment authorization is bound to a different request body or endpoint. Each payment can only be settled for its original request.',
        statusCode: 409,
      });
      return;
    }

    if (existing.outcome) {
      if (existing.outcome.status === 'completed') {
        const receipt = existing.outcome.report.receipt;
        try {
          const encodedResp = encodePaymentResponseHeader({
            success: true,
            network: receipt.network as `${string}:${string}`,
            payer: receipt.payer,
            transaction: receipt.transaction || '',
          });
          res.setHeader('PAYMENT-RESPONSE', encodedResp);
        } catch {
          const raw = JSON.stringify({
            success: true,
            network: receipt.network,
            payer: receipt.payer,
            transaction: receipt.transaction || '',
          });
          res.setHeader('PAYMENT-RESPONSE', Buffer.from(raw).toString('base64'));
        }
        res.status(200).json(existing.outcome.report);
        return;
      }

      if (existing.outcome.status === 'pending') {
        res.status(202).json({
          error: 'Settlement is currently pending onchain confirmation. Please retry shortly.',
          statusCode: 202,
        });
        return;
      }

      if (existing.outcome.status === 'failed') {
        res.status(402).json({
          error: `Payment settlement failed: ${existing.outcome.reason}`,
          statusCode: 402,
        });
        return;
      }
    }

    // Step 4b: Verify via Facilitator
    let verifyResult;
    try {
      verifyResult = await facilitator.verify(
        paymentPayload as unknown as Parameters<typeof facilitator.verify>[0],
        requirements as unknown as Parameters<typeof facilitator.verify>[1]
      );
    } catch (err: unknown) {
      const isTimeout = (err as Error)?.name === 'FacilitatorTimeoutError';
      res.status(isTimeout ? 504 : 502).json({
        error: isTimeout
          ? 'Facilitator verification timed out. Please retry.'
          : 'Facilitator verification service error.',
        statusCode: isTimeout ? 504 : 502,
      });
      return;
    }

    if (!verifyResult.isValid) {
      res.status(402).json({
        error: 'Payment authorization verification rejected by facilitator',
        reason: verifyResult.invalidReason || 'unauthorized',
        statusCode: 402,
      });
      return;
    }

    // Step 5 & 6: Concurrency lock around AI generation and settlement
    try {
      const finalReport = await idempotencyStore.executeWithLock(authKey, async () => {
        // Step 5: Generate Report (AI timeout enforced). If generation fails, do NOT settle!
        const receiptPlaceholder = {
          mode: config.isMockMode ? ('mock' as const) : ('live' as const),
          network: requirements.network,
          payer: verifyResult.payer,
          transaction: null,
        };

        const generated = await generateReport({
          language: sanitizedInput.language,
          sanitizedErrorText: sanitizedInput.errorText,
          sanitizedCode: sanitizedInput.code,
          sanitizedContext: sanitizedInput.context,
          isMockMode: config.isMockMode,
          aiApiKey: config.AI_API_KEY,
          aiProvider: config.AI_PROVIDER,
          aiModel: config.AI_MODEL,
          timeoutMs: config.AI_TIMEOUT_MS,
          receiptInfo: receiptPlaceholder,
        });

        // Step 6: Settle via Facilitator (timeout enforced)
        let settleResult;
        try {
          settleResult = await facilitator.settle(
            paymentPayload as unknown as Parameters<typeof facilitator.settle>[0],
            requirements as unknown as Parameters<typeof facilitator.settle>[1]
          );
        } catch (err: unknown) {
          const isTimeout = (err as Error)?.name === 'FacilitatorTimeoutError';
          idempotencyStore.set(authKey, {
            status: 'pending',
            reason: 'Settlement timed out awaiting facilitator response',
            recordedAt: new Date().toISOString(),
            bodyHash,
            resource: resourcePath,
          });
          const error = new Error(
            isTimeout
              ? 'Settlement timed out. Status is pending.'
              : 'Facilitator settlement communication error.'
          );
          (error as unknown as { statusCode: number }).statusCode = isTimeout ? 504 : 502;
          throw error;
        }

        if (settleResult.isPending) {
          idempotencyStore.set(authKey, {
            status: 'pending',
            reason: settleResult.errorMessage || 'Settlement pending finality confirmation',
            recordedAt: new Date().toISOString(),
            bodyHash,
            resource: resourcePath,
          });
          const error = new Error('Settlement is pending confirmation. Report withheld.');
          (error as unknown as { statusCode: number }).statusCode = 202;
          throw error;
        }

        if (!settleResult.success) {
          idempotencyStore.set(authKey, {
            status: 'failed',
            reason: settleResult.errorReason || 'Settlement execution reverted',
            recordedAt: new Date().toISOString(),
            bodyHash,
            resource: resourcePath,
          });
          const error = new Error(`Settlement failed: ${settleResult.errorReason || 'reverted'}`);
          (error as unknown as { statusCode: number }).statusCode = 402;
          throw error;
        }

        // Settlement succeeded! Attach authentic receipt
        generated.receipt = {
          mode: config.isMockMode ? 'mock' : 'live',
          network: settleResult.network,
          payer: settleResult.payer || verifyResult.payer,
          transaction: settleResult.transaction || null,
        };

        // Cache completed report
        idempotencyStore.set(authKey, {
          status: 'completed',
          report: generated,
          settledAt: new Date().toISOString(),
          bodyHash,
          resource: resourcePath,
        });

        return generated;
      });

      // Step 7: Deliver report and set PAYMENT-RESPONSE header
      const receipt = finalReport.receipt;
      try {
        const encodedResp = encodePaymentResponseHeader({
          success: true,
          network: receipt.network as `${string}:${string}`,
          payer: receipt.payer,
          transaction: receipt.transaction || '',
        });
        res.setHeader('PAYMENT-RESPONSE', encodedResp);
      } catch {
        const raw = JSON.stringify({
          success: true,
          network: receipt.network,
          payer: receipt.payer,
          transaction: receipt.transaction || '',
        });
        res.setHeader('PAYMENT-RESPONSE', Buffer.from(raw).toString('base64'));
      }

      res.status(200).json(finalReport);
    } catch (err: unknown) {
      next(err);
    }
  };
}
