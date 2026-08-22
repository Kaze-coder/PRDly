/**
 * OpenRouter integration — single API key routes to all AI models.
 * https://openrouter.ai/docs
 */

// Maps our internal model IDs to OpenRouter model slugs.
export const OPENROUTER_MODEL_MAP: Record<string, string> = {
  'gemini-flash': 'google/gemini-2.0-flash-001',
  'gemini-2.5-pro': 'google/gemini-2.5-pro',
  'gpt-4o': 'openai/gpt-4o',
  'gpt-5': 'openai/gpt-5',
  'claude-sonnet': 'anthropic/claude-3.7-sonnet',
  'claude-opus': 'anthropic/claude-opus-4',
  'kimi-k3': 'moonshotai/kimi-k2',
  'deepseek-r2': 'deepseek/deepseek-r1',
  'qwen-3': 'qwen/qwen-2.5-72b-instruct',
};

export function resolveOpenRouterModel(internalId: string): string {
  return OPENROUTER_MODEL_MAP[internalId] ?? OPENROUTER_MODEL_MAP['gemini-flash'];
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Call OpenRouter chat completions with streaming.
 * Returns the raw Response whose body is an SSE stream of OpenAI-compatible chunks.
 */
export async function streamChatCompletion(params: {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}): Promise<Response> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      'X-Title': 'PRDly',
    },
    body: JSON.stringify({
      model: resolveOpenRouterModel(params.model),
      messages: params.messages,
      stream: true,
    }),
    signal: params.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenRouter error ${res.status}: ${text}`);
  }

  return res;
}

/**
 * Parse OpenRouter's OpenAI-compatible SSE stream, yielding content-delta strings.
 */
export async function* parseOpenRouterTokens(
  response: Response,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (!trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            yield delta;
          }
        } catch {
          // skip malformed
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
