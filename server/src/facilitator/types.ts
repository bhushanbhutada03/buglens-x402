import { PaymentPayload, PaymentRequirements } from '@x402/core/types';

export interface VerifyResult {
  isValid: boolean;
  payer?: string;
  invalidReason?: string;
}

export interface SettleResult {
  success: boolean;
  transaction?: string | null;
  network: string;
  payer?: string;
  isPending?: boolean;
  errorReason?: string;
  errorMessage?: string;
}

export interface IFacilitator {
  readonly isMock: boolean;
  verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<VerifyResult>;
  settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<SettleResult>;
}
