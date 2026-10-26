import { z } from 'zod';

export const SupportedLanguages = [
  'javascript',
  'typescript',
  'python',
  'java',
  'go',
  'rust',
  'csharp',
  'cpp',
  'other',
] as const;

export type SupportedLanguage = (typeof SupportedLanguages)[number];

// DebugInput: unknown keys rejected, strict bounds, forbidden payment-spoofing fields
export const DebugInputSchema = z
  .object({
    language: z.enum(SupportedLanguages),
    errorText: z.string().min(1, 'errorText is required').max(6000, 'errorText cannot exceed 6000 characters'),
    code: z.string().max(8000, 'code cannot exceed 8000 characters').optional().default(''),
    context: z.string().max(500, 'context cannot exceed 500 characters').optional().default(''),
  })
  .strict()
  .superRefine((data, ctx) => {
    // Explicitly reject any fields attempting to simulate or inject payment
    const raw = data as Record<string, unknown>;
    const forbiddenKeys = ['price', 'amount', 'payer', 'txHash', 'transaction', 'paid', 'receipt', 'isPaid'];
    for (const key of forbiddenKeys) {
      if (key in raw) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Body must not contain payment parameter '${key}'`,
          path: [key],
        });
      }
    }
  });

export type DebugInput = z.infer<typeof DebugInputSchema>;

// BasicAnalysis: Deterministic free output schema
export const StackFrameSchema = z.object({
  file: z.string().max(300),
  line: z.number().int().nonnegative(),
  column: z.number().int().nonnegative().optional(),
});

export type StackFrame = z.infer<typeof StackFrameSchema>;

export const BasicAnalysisSchema = z.object({
  detectedLanguage: z.string().max(50),
  errorType: z.string().max(100).nullable(),
  frames: z.array(StackFrameSchema).max(50),
  normalizedTrace: z.string().max(10000),
  hints: z.array(z.string().max(500)).max(20),
  redactions: z.number().int().nonnegative(),
  limitations: z.string().max(1000),
});

export type BasicAnalysis = z.infer<typeof BasicAnalysisSchema>;

// SuggestedFix schema with executed literal false
export const SuggestedFixSchema = z.object({
  explanation: z.string().max(2000),
  codeExample: z
    .object({
      language: z.string().max(50),
      code: z.string().max(5000),
    })
    .optional(),
  whyItHelps: z.string().max(2000),
  executed: z.literal(false),
});

export const LocationSchema = z
  .object({
    file: z.string().max(300),
    line: z.number().int().nonnegative(),
    basis: z.string().max(500),
  })
  .nullable();

export const RootCauseSchema = z.object({
  confirmed: z.array(z.string().max(1000)).max(10),
  hypotheses: z.array(z.string().max(1000)).max(10),
});

export const ReceiptSchema = z.object({
  mode: z.enum(['mock', 'live']),
  network: z.string().max(100),
  payer: z.string().max(100).optional(),
  transaction: z.string().max(200).nullable(),
});

export type Receipt = z.infer<typeof ReceiptSchema>;

// Full structured AI Debugging Report Schema
export const ReportSchema = z.object({
  summary: z.string().min(1).max(2000),
  rootCause: RootCauseSchema,
  location: LocationSchema,
  debuggingSteps: z.array(z.string().max(1000)).min(1).max(20),
  suggestedFix: SuggestedFixSchema,
  verification: z.array(z.string().max(1000)).min(1).max(20),
  alternativeCauses: z.array(z.string().max(1000)).max(10),
  limitations: z.string().max(2000),
  source: z.enum(['ai', 'mock-template']),
  model: z.string().max(100).nullable(),
  generatedAt: z.string().datetime(),
  receipt: ReceiptSchema,
});

export type Report = z.infer<typeof ReportSchema>;

// Catalog Item Schema
export const CatalogItemSchema = z.object({
  path: z.string(),
  method: z.string(),
  isPaid: z.boolean(),
  price: z.string().nullable(),
  asset: z.string().nullable(),
  network: z.string().nullable(),
  description: z.string(),
});

export type CatalogItem = z.infer<typeof CatalogItemSchema>;

// x402 Protocol Header Payloads
export const PaymentRequirementsV2Schema = z.object({
  scheme: z.string().default('exact'),
  network: z.string(),
  maxAmountRequired: z.string(),
  resource: z.string(),
  description: z.string(),
  mimeType: z.string().default('application/json'),
  payTo: z.string(),
  maxTimeoutSeconds: z.number().int().positive().default(60),
  asset: z.string(),
  extra: z.record(z.unknown()).optional(),
});

export type PaymentRequirementsV2 = z.infer<typeof PaymentRequirementsV2Schema>;

export const PaymentRequiredHeaderSchema = z.object({
  x402Version: z.literal(2),
  error: z.string().optional(),
  accepts: z.array(PaymentRequirementsV2Schema).min(1),
});

export type PaymentRequiredHeader = z.infer<typeof PaymentRequiredHeaderSchema>;

export const PaymentSignatureHeaderSchema = z.object({
  x402Version: z.literal(2),
  scheme: z.string(),
  network: z.string(),
  payload: z.record(z.unknown()),
});

export type PaymentSignatureHeader = z.infer<typeof PaymentSignatureHeaderSchema>;

export const PaymentResponseHeaderSchema = z.object({
  success: z.boolean(),
  transaction: z.string().nullable().optional(),
  network: z.string(),
  payer: z.string().optional(),
  errorReason: z.string().optional(),
  errorMessage: z.string().optional(),
});

export type PaymentResponseHeader = z.infer<typeof PaymentResponseHeaderSchema>;
