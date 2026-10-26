import crypto from 'crypto';

interface SanitizeResult {
  sanitized: string;
  redactionCount: number;
}

// Regex patterns for secret detection
const SECRET_PATTERNS: { name: string; regex: RegExp; replacement: string }[] = [
  // Private Key Blocks
  {
    name: 'PrivateKeyBlock',
    regex: /-----BEGIN(?:[A-Z0-9 ]+)?PRIVATE KEY-----[\s\S]*?-----END(?:[A-Z0-9 ]+)?PRIVATE KEY-----/gi,
    replacement: '[REDACTED_PRIVATE_KEY_BLOCK]',
  },
  // Hex Private Keys (64 hex characters preceded by 0x or key indicators)
  {
    name: 'HexPrivateKey',
    regex: /(?:private[_\s-]?key|secret|seed|pkey)[\s:=]+(["']?)0x[a-fA-F0-9]{64}\1/gi,
    replacement: 'private_key: [REDACTED_HEX_PRIVATE_KEY]',
  },
  // Standalone 64-char hex strings if clearly look like secret keys
  {
    name: 'RawHexKey',
    regex: /\b0x[a-fA-F0-9]{64}\b/g,
    replacement: '[REDACTED_HEX_KEY]',
  },
  // Database Connection Strings
  {
    name: 'ConnectionString',
    regex: /(?:postgres|postgresql|mongodb|mongodb\+srv|mysql|redis|rediss):\/\/[^\s"'`]+/gi,
    replacement: '[REDACTED_DATABASE_CONNECTION_STRING]',
  },
  // Bearer and Basic Authorization Tokens
  {
    name: 'AuthHeader',
    regex: /(?:Bearer|Basic)\s+[A-Za-z0-9_\-\.+=/]{20,}/gi,
    replacement: '[REDACTED_AUTH_TOKEN]',
  },
  // Provider-Specific API Keys
  {
    name: 'OpenAIKey',
    regex: /\bsk-[A-Za-z0-9]{20,T3BlbkFJ[A-Za-z0-9]{20,}\b|\bsk-proj-[A-Za-z0-9_-]{40,}\b/g,
    replacement: '[REDACTED_OPENAI_API_KEY]',
  },
  {
    name: 'AnthropicKey',
    regex: /\bsk-ant-[A-Za-z0-9_\-]{30,}\b/g,
    replacement: '[REDACTED_ANTHROPIC_API_KEY]',
  },
  {
    name: 'AWSKey',
    regex: /\b(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/g,
    replacement: '[REDACTED_AWS_ACCESS_KEY]',
  },
  {
    name: 'GitHubToken',
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g,
    replacement: '[REDACTED_GITHUB_TOKEN]',
  },
  // Generic Env Secret Assignment
  {
    name: 'EnvSecretAssignment',
    regex: /(?:API_KEY|SECRET|PASSWORD|PASSWD|AUTH_TOKEN|PRIVATE_KEY)[\s:=]+(["']?)[A-Za-z0-9_\-\.+=/]{8,}\1/gi,
    replacement: 'SECRET=[REDACTED_CREDENTIAL]',
  },
];

/**
 * Redacts secret-looking strings from text.
 * Returns sanitized string and total count of redactions.
 */
export function sanitizeSecrets(text: string): SanitizeResult {
  if (!text) {
    return { sanitized: '', redactionCount: 0 };
  }

  let sanitized = text;
  let totalRedactions = 0;

  for (const pattern of SECRET_PATTERNS) {
    const matches = sanitized.match(pattern.regex);
    if (matches) {
      totalRedactions += matches.length;
      sanitized = sanitized.replace(pattern.regex, pattern.replacement);
    }
  }

  return {
    sanitized,
    redactionCount: totalRedactions,
  };
}

/**
 * Sanitizes all string fields in a DebugInput payload.
 */
export function sanitizeInput(input: {
  language: string;
  errorText: string;
  code?: string;
  context?: string;
}) {
  const errorSanitized = sanitizeSecrets(input.errorText);
  const codeSanitized = sanitizeSecrets(input.code || '');
  const contextSanitized = sanitizeSecrets(input.context || '');

  const totalRedactions =
    errorSanitized.redactionCount +
    codeSanitized.redactionCount +
    contextSanitized.redactionCount;

  const sanitizedInput = {
    language: input.language,
    errorText: errorSanitized.sanitized,
    code: codeSanitized.sanitized,
    context: contextSanitized.sanitized,
  };

  return {
    sanitizedInput,
    totalRedactions,
  };
}

/**
 * Computes canonical SHA-256 hash of the sanitized request payload.
 * Used for idempotency binding between authorization and request body.
 */
export function computeBodyHash(sanitizedInput: {
  language: string;
  errorText: string;
  code?: string;
  context?: string;
}): string {
  const canonical = JSON.stringify({
    language: sanitizedInput.language,
    errorText: sanitizedInput.errorText.trim(),
    code: (sanitizedInput.code || '').trim(),
    context: (sanitizedInput.context || '').trim(),
  });

  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}
