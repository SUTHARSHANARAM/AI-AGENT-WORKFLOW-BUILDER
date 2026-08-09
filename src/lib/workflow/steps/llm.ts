import { WorkflowStep, StepExecutionResult } from '../types';

/**
 * Replaces handlebars-style placeholders {{path.key}} with values from context data.
 */
function interpolatePrompt(prompt: string, context: Record<string, any>): string {
  if (!prompt) return '';
  return prompt.replace(/\{\{\s*([\w\.]+)\s*\}\}/g, (_, path) => {
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
 * Executes an LLM Call step using the Groq API (or returns a fallback response).
 */
export async function executeLlmStep(
  step: WorkflowStep,
  input: Record<string, any>
): Promise<StepExecutionResult> {
  const config = step.config || {};
  const model = config.model || 'llama-3.3-70b-versatile';
  const rawPrompt = config.prompt || 'Synthesize the following input data: {{input}}';
  const temperature = config.temperature ?? 0.7;
  const maxTokens = config.max_tokens ?? 1024;

  const interpolatedPrompt = interpolatePrompt(rawPrompt, { input, ...input });
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    console.warn('[LLM Step] GROQ_API_KEY not found. Using fallback execution response.');
    return {
      status: 'completed',
      output: {
        model,
        prompt: interpolatedPrompt,
        text: `[Fallback Response] GROQ_API_KEY is not set. Simulated completion for step "${step.name}". Prompt processed: "${interpolatedPrompt.slice(0, 100)}..."`,
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        is_fallback: true,
      },
    };
  }

  const maxAttempts = 2;
  let lastError = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: interpolatedPrompt }],
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API returned HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const completionText = data?.choices?.[0]?.message?.content || '';

      return {
        status: 'completed',
        output: {
          model,
          prompt: interpolatedPrompt,
          text: completionText,
          usage: data?.usage || {},
          raw_response: data,
        },
      };
    } catch (err: any) {
      lastError = err.message || String(err);
      console.warn(`[LLM Step] Attempt ${attempt}/${maxAttempts} failed:`, lastError);
      if (attempt < maxAttempts) {
        await new Promise((res) => setTimeout(res, 1000));
      }
    }
  }

  return {
    status: 'failed',
    output: { prompt: interpolatedPrompt },
    error: `LLM Step failed after ${maxAttempts} attempts: ${lastError}`,
  };
}
