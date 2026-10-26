import {
  BasicAnalysis,
  CatalogResponse,
  HealthResponse,
  InspectorState,
  PaymentRequiredResponse,
  Report,
} from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export async function fetchHealth(): Promise<{ data?: HealthResponse; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
    const data = await res.json();
    return { data };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function fetchCatalog(): Promise<{ data?: CatalogResponse; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/catalog`);
    if (!res.ok) throw new Error(`Failed to fetch catalog: ${res.statusText}`);
    const data = await res.json();
    return { data };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function runBasicAnalysis(
  input: { language: string; errorText: string; code?: string; context?: string },
  onInspect?: (state: InspectorState) => void
): Promise<{ data?: BasicAnalysis; error?: string }> {
  const url = `${API_BASE}/api/debug/basic`;
  const reqHeaders = { 'Content-Type': 'application/json' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify(input),
    });

    const resHeaders: Record<string, string> = {};
    res.headers.forEach((val, key) => {
      resHeaders[key] = val;
    });

    const body = await res.json();

    if (onInspect) {
      onInspect({
        method: 'POST',
        url: '/api/debug/basic',
        status: res.status,
        statusText: res.statusText,
        requestHeaders: reqHeaders,
        responseHeaders: resHeaders,
        requestBody: input,
        responseBody: body,
        timestamp: new Date().toLocaleTimeString(),
      });
    }

    if (!res.ok) {
      return { error: body.error || `Error ${res.status}: ${res.statusText}` };
    }

    return { data: body as BasicAnalysis };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function requestPaidReport(
  input: { language: string; errorText: string; code?: string; context?: string },
  paymentSignature?: string,
  onInspect?: (state: InspectorState) => void
): Promise<{
  report?: Report;
  paymentRequired?: PaymentRequiredResponse;
  error?: string;
  statusCode: number;
}> {
  const url = `${API_BASE}/api/debug/report`;
  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (paymentSignature) {
    reqHeaders['PAYMENT-SIGNATURE'] = paymentSignature;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify(input),
    });

    const resHeaders: Record<string, string> = {};
    res.headers.forEach((val, key) => {
      resHeaders[key] = val;
    });

    const body = await res.json();

    if (onInspect) {
      onInspect({
        method: 'POST',
        url: '/api/debug/report',
        status: res.status,
        statusText: res.statusText,
        requestHeaders: reqHeaders,
        responseHeaders: resHeaders,
        requestBody: input,
        responseBody: body,
        timestamp: new Date().toLocaleTimeString(),
      });
    }

    if (res.status === 402) {
      return {
        paymentRequired: body as PaymentRequiredResponse,
        statusCode: 402,
      };
    }

    if (res.status === 200) {
      return {
        report: body as Report,
        statusCode: 200,
      };
    }

    return {
      error: body.error || `HTTP ${res.status}: ${res.statusText}`,
      statusCode: res.status,
    };
  } catch (err) {
    return {
      error: (err as Error).message,
      statusCode: 0,
    };
  }
}
