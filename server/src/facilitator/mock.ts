import { PaymentPayload, PaymentRequirements } from '@x402/core/types';
import { IFacilitator, SettleResult, VerifyResult } from './types.js';

export class MockFacilitator implements IFacilitator {
  readonly isMock = true;
  public verifyCallCount = 0;
  public settleCallCount = 0;

  async verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<VerifyResult> {
    this.verifyCallCount++;

    const payload = paymentPayload.payload as Record<string, unknown>;
    const flag = typeof payload.testFlag === 'string' ? payload.testFlag : '';

    if (flag === '__MOCK_TIMEOUT_VERIFY__') {
      const err = new Error('Facilitator request timed out after 10000ms');
      err.name = 'FacilitatorTimeoutError';
      throw err;
    }

    if (flag === '__MOCK_FAIL_VERIFY__') {
      return {
        isValid: false,
        invalidReason: 'mock_signature_invalid',
      };
    }

    if (flag === '__MOCK_INSUFFICIENT_FUNDS__') {
      return {
        isValid: false,
        invalidReason: 'insufficient_funds',
      };
    }

    const anyPayload = paymentPayload as unknown as Record<string, unknown>;
    const payloadScheme =
      typeof anyPayload.scheme === 'string'
        ? anyPayload.scheme
        : (anyPayload.accepted as Record<string, unknown>)?.scheme;

    const payloadNetwork =
      typeof anyPayload.network === 'string'
        ? anyPayload.network
        : (anyPayload.accepted as Record<string, unknown>)?.network;

    // Verify scheme and network match
    if (payloadScheme && payloadScheme !== paymentRequirements.scheme) {
      return {
        isValid: false,
        invalidReason: `scheme_mismatch: expected ${paymentRequirements.scheme}, got ${payloadScheme}`,
      };
    }

    if (payloadNetwork && payloadNetwork !== paymentRequirements.network) {
      return {
        isValid: false,
        invalidReason: `network_mismatch: expected ${paymentRequirements.network}, got ${payloadNetwork}`,
      };
    }

    // Extract payer
    const payer =
      (typeof payload.from === 'string' && payload.from) ||
      (typeof payload.payer === 'string' && payload.payer) ||
      (typeof payload.authorization === 'object' &&
        payload.authorization !== null &&
        typeof (payload.authorization as Record<string, unknown>).from === 'string' &&
        (payload.authorization as Record<string, unknown>).from as string) ||
      '0x1111111111111111111111111111111111111111';

    return {
      isValid: true,
      payer,
    };
  }

  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<SettleResult> {
    this.settleCallCount++;

    const payload = paymentPayload.payload as Record<string, unknown>;
    const flag = typeof payload.testFlag === 'string' ? payload.testFlag : '';

    if (flag === '__MOCK_TIMEOUT_SETTLE__') {
      const err = new Error('Facilitator settlement timed out after 10000ms');
      err.name = 'FacilitatorTimeoutError';
      throw err;
    }

    if (flag === '__MOCK_FAIL_SETTLE__') {
      return {
        success: false,
        network: paymentRequirements.network,
        errorReason: 'mock_settlement_reverted',
        errorMessage: 'Execution reverted: transaction cancelled on chain',
      };
    }

    if (flag === '__MOCK_PENDING_SETTLE__') {
      return {
        success: false,
        isPending: true,
        network: paymentRequirements.network,
        transaction: null,
        errorReason: 'settlement_pending',
        errorMessage: 'Settlement is currently pending confirmation',
      };
    }

    const payer =
      (typeof payload.from === 'string' && payload.from) ||
      (typeof payload.payer === 'string' && payload.payer) ||
      '0x1111111111111111111111111111111111111111';

    // In mock mode, the receipt has mode: "mock" and transaction: null (honesty rule)
    return {
      success: true,
      transaction: null,
      network: paymentRequirements.network,
      payer,
    };
  }

  reset() {
    this.verifyCallCount = 0;
    this.settleCallCount = 0;
  }
}
