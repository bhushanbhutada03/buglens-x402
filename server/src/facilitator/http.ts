import { PaymentPayload, PaymentRequirements } from '@x402/core/types';
import { IFacilitator, SettleResult, VerifyResult } from './types.js';

export class HttpFacilitatorClient implements IFacilitator {
  readonly isMock = false;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, timeoutMs = 10000) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
  }

  async verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<VerifyResult> {
    const endpoint = `${this.baseUrl}/verify`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          x402Version: 2,
          paymentPayload,
          paymentRequirements,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          isValid: false,
          invalidReason: `facilitator_error_${response.status}: ${errorText.slice(0, 200)}`,
        };
      }

      const data = (await response.json()) as Record<string, unknown>;
      return {
        isValid: data.isValid === true,
        payer: typeof data.payer === 'string' ? data.payer : undefined,
        invalidReason: typeof data.invalidReason === 'string' ? data.invalidReason : undefined,
      };
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        const error = new Error(`Facilitator verify request timed out after ${this.timeoutMs}ms`);
        error.name = 'FacilitatorTimeoutError';
        throw error;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<SettleResult> {
    const endpoint = `${this.baseUrl}/settle`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          x402Version: 2,
          paymentPayload,
          paymentRequirements,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          network: paymentRequirements.network,
          errorReason: `facilitator_http_${response.status}`,
          errorMessage: errorText.slice(0, 300),
        };
      }

      const data = (await response.json()) as Record<string, unknown>;
      const isPending =
        data.settlementStatus === 'settlement_pending' || data.isPending === true;

      return {
        success: data.success === true,
        transaction: typeof data.transaction === 'string' ? data.transaction : null,
        network: typeof data.network === 'string' ? data.network : paymentRequirements.network,
        payer: typeof data.payer === 'string' ? data.payer : undefined,
        isPending,
        errorReason: typeof data.errorReason === 'string' ? data.errorReason : undefined,
        errorMessage: typeof data.errorMessage === 'string' ? data.errorMessage : undefined,
      };
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        const error = new Error(`Facilitator settle request timed out after ${this.timeoutMs}ms`);
        error.name = 'FacilitatorTimeoutError';
        throw error;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
