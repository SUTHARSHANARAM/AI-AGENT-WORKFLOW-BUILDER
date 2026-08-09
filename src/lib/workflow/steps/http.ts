import { WorkflowStep, StepExecutionResult } from '../types';

/**
 * Replaces handlebar placeholders in templates with context values.
 */
function interpolateString(template: string, context: Record<string, any>): string {
  if (!template) return '';
  return template.replace(/\{\{\s*([\w\.]+)\s*\}\}/g, (_, path) => {
    const keys = path.split('.');
    let val: any = context;
    for (const key of keys) {
      if (val && typeof val === 'object' && key in val) {
        val = val[key];
      } else {
        return `{{${path}}}`;
      }
    }
    return typeof val === 'object' ? JSON.stringify(val) : String(val);
  });
}

/**
 * Executes an HTTP Request step with automatic retry.
 */
export async function executeHttpStep(
  step: WorkflowStep,
  input: Record<string, any>
): Promise<StepExecutionResult> {
  const config = step.config || {};
  const method = config.method || 'GET';
  const rawUrl = config.url || '';
  const headersConfig = config.headers || {};
  const rawBody = config.body;

  if (!rawUrl) {
    return {
      status: 'failed',
      output: {},
      error: 'HTTP Step configuration error: Missing URL.',
    };
  }

  const url = interpolateString(rawUrl, { input, ...input });

  // Prepare headers
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(headersConfig)) {
    headers[key] = interpolateString(String(value), { input, ...input });
  }

  if (!headers['Content-Type'] && ['POST', 'PUT', 'PATCH'].includes(method)) {
    headers['Content-Type'] = 'application/json';
  }

  // Prepare body
  let body: string | undefined = undefined;
  if (['POST', 'PUT', 'PATCH'].includes(method) && rawBody !== undefined) {
    if (typeof rawBody === 'string') {
      body = interpolateString(rawBody, { input, ...input });
    } else {
      body = JSON.stringify(rawBody);
    }
  }

  const maxAttempts = 2;
  let lastError = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      let responseData: any;

      if (contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      if (!response.ok) {
        throw new Error(`HTTP Request returned status ${response.status} ${response.statusText}`);
      }

      return {
        status: 'completed',
        output: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          data: responseData,
        },
      };
    } catch (err: any) {
      lastError = err.message || String(err);
      console.warn(`[HTTP Step] Attempt ${attempt}/${maxAttempts} failed:`, lastError);
      if (attempt < maxAttempts) {
        await new Promise((res) => setTimeout(res, 1000));
      }
    }
  }

  return {
    status: 'failed',
    output: { url, method },
    error: `HTTP Step failed after ${maxAttempts} attempts: ${lastError}`,
  };
}
