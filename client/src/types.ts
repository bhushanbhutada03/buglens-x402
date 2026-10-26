export interface StackFrame {
  file: string;
  line: number;
  column?: number;
}

export interface BasicAnalysis {
  detectedLanguage: string;
  errorType: string | null;
  frames: StackFrame[];
  normalizedTrace: string;
  hints: string[];
  redactions: number;
  limitations: string;
}

export interface SuggestedFix {
  explanation: string;
  codeExample?: {
    language: string;
    code: string;
  };
  whyItHelps: string;
  executed: false;
}

export interface Location {
  file: string;
  line: number;
  basis: string;
}

export interface RootCause {
  confirmed: string[];
  hypotheses: string[];
}

export interface Receipt {
  mode: 'mock' | 'live';
  network: string;
  payer?: string;
  transaction: string | null;
}

export interface Report {
  summary: string;
  rootCause: RootCause;
  location: Location | null;
  debuggingSteps: string[];
  suggestedFix: SuggestedFix;
  verification: string[];
  alternativeCauses: string[];
  limitations: string;
  source: 'ai' | 'mock-template';
  model: string | null;
  generatedAt: string;
  receipt: Receipt;
}

export interface PaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: Record<string, unknown>;
}

export interface PaymentRequiredResponse {
  error: string;
  statusCode: number;
  requirements: {
    x402Version: number;
    error?: string;
    accepts: PaymentRequirement[];
  };
  instructions: string;
}

export interface CatalogEndpoint {
  path: string;
  method: string;
  isPaid: boolean;
  price: string | null;
  asset: string | null;
  network: string | null;
  description: string;
}

export interface CatalogResponse {
  service: string;
  currency: string;
  decimals: number;
  network: string;
  mode: 'mock' | 'live';
  endpoints: CatalogEndpoint[];
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  mode: 'mock' | 'live';
  network: string;
  timestamp: string;
}

export interface InspectorState {
  method: string;
  url: string;
  status: number | null;
  statusText?: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody: unknown;
  responseBody: unknown;
  timestamp: string;
}
