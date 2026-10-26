import { BasicAnalysis, DebugInput, StackFrame } from './schemas.js';
import { sanitizeInput } from './sanitizer.js';

// Static knowledge table for language-specific error patterns and deterministic hints
const KNOWLEDGE_TABLE: Record<
  string,
  { pattern: RegExp; errorType: string; hints: string[] }[]
> = {
  javascript: [
    {
      pattern: /TypeError: Cannot read propert(?:y|ies) of (?:undefined|null)/i,
      errorType: 'TypeError: Nullish Property Access',
      hints: [
        'Use optional chaining (?.) before accessing nested properties (e.g., user?.profile?.name).',
        'Verify that the parent object is populated asynchronously before rendering or accessing.',
        'Provide default fallback values using nullish coalescing (??) or default parameters.',
      ],
    },
    {
      pattern: /ReferenceError: (\w+) is not defined/i,
      errorType: 'ReferenceError: Undefined Identifier',
      hints: [
        'Ensure the identifier is declared in scope with const, let, or var before access.',
        'Check for typos in variable, function, or module names.',
        'Verify correct module imports and bundler path aliases.',
      ],
    },
    {
      pattern: /UnhandledPromiseRejection/i,
      errorType: 'Async: Unhandled Promise Rejection',
      hints: [
        'Add a .catch() handler to promise chains or wrap await calls in a try-catch block.',
        'Ensure all rejected promises terminate with an error log or recovery step.',
      ],
    },
  ],
  typescript: [
    {
      pattern: /Property '(\w+)' does not exist on type/i,
      errorType: 'TypeScript: Type Mismatch',
      hints: [
        'Inspect interface/type definitions to ensure the property is declared.',
        'Use type narrowing or type guards (typeof, in, or custom isX guard) before accessing optional keys.',
        'Check whether the object needs an index signature or union extension.',
      ],
    },
    {
      pattern: /Type '(.+)' is not assignable to type '(.+)'/i,
      errorType: 'TypeScript: Assignment Incompatibility',
      hints: [
        'Verify that incoming payload shape matches expected parameter or interface types.',
        'Perform explicit runtime transformation or parsing (e.g., with Zod) when consuming external data.',
      ],
    },
  ],
  python: [
    {
      pattern: /AttributeError: '(\w+)' object has no attribute '(\w+)'/i,
      errorType: 'AttributeError: Missing Attribute',
      hints: [
        'Check if the object is None before calling methods or accessing attributes.',
        'Verify if a function return value was None due to an early return.',
        'Use getattr(obj, "attr", default) if the attribute is dynamic.',
      ],
    },
    {
      pattern: /KeyError: (.+)/i,
      errorType: 'KeyError: Dictionary Key Not Found',
      hints: [
        'Use dict.get(key, default) instead of bracket indexing dict[key].',
        'Check key presence using `if key in dict:` before access.',
      ],
    },
    {
      pattern: /IndexError: list index out of range/i,
      errorType: 'IndexError: Out of Bounds Access',
      hints: [
        'Check len(list) before indexing.',
        'Ensure loops iterate directly over items rather than unverified range(len).',
      ],
    },
  ],
  rust: [
    {
      pattern: /cannot borrow `(\w+)` as mutable/i,
      errorType: 'Rust: Borrow Checker Violation',
      hints: [
        'Rust prevents multiple mutable references simultaneously. Check scope of existing borrows.',
        'Consider splitting data structures, cloning where cheap, or using interior mutability (RefCell/Mutex).',
      ],
    },
    {
      pattern: /value borrowed here after move/i,
      errorType: 'Rust: Use After Move',
      hints: [
        'The value was moved into another function or scope. Derive Clone or pass references (&T) instead of ownership.',
      ],
    },
  ],
  java: [
    {
      pattern: /NullPointerException/i,
      errorType: 'NullPointerException',
      hints: [
        'Check for null references before invoking methods.',
        'Use java.util.Optional<T> or Objects.requireNonNull() for early assertions.',
      ],
    },
    {
      pattern: /ArrayIndexOutOfBoundsException/i,
      errorType: 'ArrayIndexOutOfBoundsException',
      hints: [
        'Verify array bounds before accessing index. Note that arrays are 0-indexed.',
      ],
    },
  ],
  go: [
    {
      pattern: /panic: runtime error: invalid memory address or nil pointer dereference/i,
      errorType: 'Go: Nil Pointer Dereference',
      hints: [
        'Check if pointer or interface is nil before dereferencing: `if ptr == nil { return err }`.',
        'Ensure constructors and factory functions initialize nested struct pointers.',
      ],
    },
  ],
};

const GENERIC_HINTS = [
  'Inspect the earliest stack frame from your own application code rather than third-party library internals.',
  'Log or debug variables right before the offending line to verify assumptions about inputs.',
  'Check recent commits or environment variable changes that coincided with this error.',
];

/**
 * Extracts stack frames (file, line, column) across common error stack formats.
 */
export function extractStackFrames(text: string): StackFrame[] {
  const frames: StackFrame[] = [];

  // 1. JavaScript/V8 style: "at functionName (filename:12:34)" or "at filename:12:34"
  const v8Regex = /at (?:[^\s(]+ \()?(?:file:\/\/\/)?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+):(\d+):?(\d+)?\)?/g;
  let match: RegExpExecArray | null;

  while ((match = v8Regex.exec(text)) !== null) {
    frames.push({
      file: match[1],
      line: parseInt(match[2], 10),
      column: match[3] ? parseInt(match[3], 10) : undefined,
    });
  }

  // 2. Python style: 'File "filename.py", line 42, in func'
  const pyRegex = /File "([^"]+)", line (\d+)/g;
  while ((match = pyRegex.exec(text)) !== null) {
    frames.push({
      file: match[1],
      line: parseInt(match[2], 10),
    });
  }

  // 3. Go style: "main.go:25 +0x3f" or "\t/path/to/file.go:123"
  const goRegex = /([a-zA-Z0-9_\-./\\]+\.go):(\d+)/g;
  while ((match = goRegex.exec(text)) !== null) {
    frames.push({
      file: match[1],
      line: parseInt(match[2], 10),
    });
  }

  // 4. Rust/Cargo style: "--> src/main.rs:14:5"
  const rustRegex = /-->\s*([a-zA-Z0-9_\-./\\]+\.rs):(\d+):?(\d+)?/g;
  while ((match = rustRegex.exec(text)) !== null) {
    frames.push({
      file: match[1],
      line: parseInt(match[2], 10),
      column: match[3] ? parseInt(match[3], 10) : undefined,
    });
  }

  // Deduplicate and cap to 50 frames
  const seen = new Set<string>();
  const uniqueFrames: StackFrame[] = [];
  for (const frame of frames) {
    const key = `${frame.file}:${frame.line}:${frame.column ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueFrames.push(frame);
    }
  }

  return uniqueFrames.slice(0, 50);
}

/**
 * Normalizes trace text: removes carriage returns, cleans excessive blank lines,
 * and formats indentation consistently.
 */
export function normalizeTrace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Performs deterministic basic analysis without making any AI calls or charging payment.
 */
export function performBasicAnalysis(input: DebugInput): BasicAnalysis {
  const { sanitizedInput, totalRedactions } = sanitizeInput(input);
  const normalized = normalizeTrace(sanitizedInput.errorText);
  const frames = extractStackFrames(normalized);

  let detectedErrorType: string | null = null;
  const matchedHints: string[] = [];

  const langKey = sanitizedInput.language.toLowerCase();
  const langRules = KNOWLEDGE_TABLE[langKey] || [];

  for (const rule of langRules) {
    if (rule.pattern.test(normalized)) {
      if (!detectedErrorType) {
        detectedErrorType = rule.errorType;
      }
      matchedHints.push(...rule.hints);
    }
  }

  // If no language-specific match, check general error patterns across all languages
  if (!detectedErrorType) {
    for (const rules of Object.values(KNOWLEDGE_TABLE)) {
      for (const rule of rules) {
        if (rule.pattern.test(normalized)) {
          detectedErrorType = rule.errorType;
          matchedHints.push(...rule.hints);
          break;
        }
      }
      if (detectedErrorType) break;
    }
  }

  const combinedHints = Array.from(new Set([...matchedHints, ...GENERIC_HINTS])).slice(0, 10);

  return {
    detectedLanguage: sanitizedInput.language,
    errorType: detectedErrorType,
    frames,
    normalizedTrace: normalized,
    hints: combinedHints,
    redactions: totalRedactions,
    limitations:
      'Basic analysis is a free deterministic parser. It scans for static regex patterns and extracts stack frames without AI context. For root cause diagnosis, verified fixes, and step-by-step guidance, use the x402-paid debugging report.',
  };
}
