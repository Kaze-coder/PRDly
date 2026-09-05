/**
 * AI Provider Registry — all three providers are OpenAI-compatible.
 *
 * 9router:     Free-form model IDs (e.g. "cc/claude-opus-4-7"). Base URL from env.
 * agentrouter: Fixed model claude-opus-4-8. Base URL https://agentrouter.org/v1.
 * openrouter:  Maps internal IDs to OpenRouter slugs. Base URL https://openrouter.ai/api/v1.
 */

export interface AIProvider {
  id: string;
  name: string;
  baseUrl: string;
  envKey: string;           // env var name for the API key
  /** Wire format: 'openai' (chat/completions) or 'anthropic' (messages API) */
  format: 'openai' | 'anthropic';
  /** Extra headers to send on every request */
  extraHeaders?: Record<string, string>;
  /**
   * Resolve internal model ID to the provider's model string.
   * If undefined, the model ID is passed through as-is.
   */
  resolveModel?: (modelId: string) => string;
}

// ── Provider definitions ──

export const PROVIDERS: Record<string, AIProvider> = {
  '9router': {
    id: '9router',
    name: '9Router',
    baseUrl: process.env.NINE_ROUTER_BASE_URL || 'https://api.9router.com/v1',
    envKey: 'NINE_ROUTER_API_KEY',
    format: 'openai',
    // 9router: model IDs are free-form, passed through directly.
    // User picks whatever model 9router supports (e.g. "cc/claude-opus-4-7").
  },
  agentrouter: {
    id: 'agentrouter',
    name: 'AgentRouter',
    baseUrl: 'https://agentrouter.org',
    envKey: 'AGENTROUTER_API_KEY',
    format: 'anthropic',
    resolveModel: () => 'claude-opus-4-8', // fixed model
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
    format: 'openai',
    extraHeaders: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      'X-Title': 'PRDly',
    },
    resolveModel: (id) => OPENROUTER_MODEL_MAP[id] ?? id,
  },
};

// OpenRouter needs explicit model slug mapping.
const OPENROUTER_MODEL_MAP: Record<string, string> = {
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

// ── Provider candidate selection ──

/**
 * Build ordered provider candidates: the resolved provider for `modelId` first,
 * then every configured provider in priority order (9router > agentrouter > openrouter).
 * Used by both the generate route and the refine route for failover.
 */
export function buildProviderCandidates(modelId: string): {
  provider: AIProvider;
  apiKey: string;
  modelString: string;
}[] {
  const candidates: { provider: AIProvider; apiKey: string; modelString: string }[] = [];
  const resolved = resolveProvider(modelId);
  if (resolved) {
    candidates.push({ provider: resolved.provider, apiKey: resolved.apiKey, modelString: resolved.modelString });
  }
  // Priority: 9router > agentrouter > openrouter (9router is the user's primary proxy).
  for (const id of ['9router', 'agentrouter', 'openrouter']) {
    const provider = PROVIDERS[id];
    const apiKey = process.env[provider.envKey];
    if (!apiKey) continue;
    if (candidates.some((c) => c.provider.id === id)) continue;
    const modelString = provider.resolveModel ? provider.resolveModel(modelId) : modelId;
    candidates.push({ provider, apiKey, modelString });
  }
  return candidates;
}

/**
 * Build a candidate for a user-supplied OpenAI/Anthropic-compatible endpoint.
 * Returns null unless both baseUrl and apiKey are non-empty.
 */
export function buildCustomCandidate(params: {
  modelId: string;
  baseUrl?: string;
  apiKey?: string;
  compat?: string;
}): { provider: AIProvider; apiKey: string; modelString: string } | null {
  const baseUrl = params.baseUrl?.trim();
  const apiKey = params.apiKey?.trim();
  if (!baseUrl || !apiKey) return null;
  const format = params.compat === 'anthropic' ? 'anthropic' as const : 'openai' as const;
  return {
    provider: {
      id: 'custom',
      name: 'Custom Engine',
      // streamFromAnthropic appends /v1/messages — strip trailing /v1 so it doesn't double
      baseUrl: format === 'anthropic' ? baseUrl.replace(/\/v1\/?$/, '') : baseUrl.replace(/\/$/, ''),
      envKey: '',
      format,
    },
    apiKey,
    modelString: params.modelId,
  };
}

/**
 * Open a streaming chat session with a provider (plain messages format).
 * Returns the raw Response ready for parseTokenStream / parseAnthropicStream.
 */
export async function openProviderStream(params: {
  provider: AIProvider;
  apiKey: string;
  modelString: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  maxTokens?: number;
}): Promise<Response> {
  const { provider, apiKey, modelString, messages, signal, maxTokens } = params;
  const systemMsg = messages.find((m) => m.role === 'system')?.content ?? '';
  const nonSystem = messages.filter((m) => m.role !== 'system');

  if (provider.format === 'anthropic') {
    return streamFromAnthropic({
      apiKey,
      baseUrl: provider.baseUrl,
      model: modelString,
      system: systemMsg,
      userMessage: nonSystem.map((m) => `${m.role === 'user' ? '' : ''}${m.content}`).join('\n\n'),
      signal,
      maxTokens,
      providerName: provider.name,
    });
  }
  return streamFromProvider({ provider, apiKey, model: modelString, messages, signal, maxTokens });
}
// Each model ID maps to which provider handles it.
const MODEL_PROVIDER_MAP: Record<string, string> = {
  // 9router models (free-form — these are suggestions, user can type any)
  '9router-auto': '9router',
  // agentrouter model (fixed)
  'agentrouter-opus': 'agentrouter',
  // openrouter models (existing)
  'gemini-flash': 'openrouter',
  'gpt-4o': 'openrouter',
  'claude-sonnet': 'openrouter',
  'gemini-2.5-pro': 'openrouter',
  'kimi-k3': 'openrouter',
  'deepseek-r2': 'openrouter',
  'qwen-3': 'openrouter',
  'gpt-5': 'openrouter',
  'claude-opus': 'openrouter',
};

/**
 * Resolve which provider + model string to use for a given internal model ID.
 * Returns null if the provider's API key is not configured.
 */
export function resolveProvider(modelId: string): {
  provider: AIProvider;
  modelString: string;
  apiKey: string;
} | null {
  const providerId = MODEL_PROVIDER_MAP[modelId];
  if (!providerId) return null;

  const provider = PROVIDERS[providerId];
  if (!provider) return null;

  const apiKey = process.env[provider.envKey];
  if (!apiKey) return null;

  const modelString = provider.resolveModel
    ? provider.resolveModel(modelId)
    : modelId;

  return { provider, modelString, apiKey };
}

/**
 * Get the first available provider (for fallback logic).
 * Priority: 9router > agentrouter > openrouter
 */
export function getFirstAvailableProvider(): {
  provider: AIProvider;
  apiKey: string;
} | null {
  for (const id of ['9router', 'agentrouter', 'openrouter']) {
    const p = PROVIDERS[id];
    const key = process.env[p.envKey];
    if (key) return { provider: p, apiKey: key };
  }
  return null;
}

// ── Generic OpenAI-compatible streaming ──

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type { ChatMessage };

/**
 * Turn a non-200 provider response into a short, user-readable error.
 * Free-tier proxies often return an opaque HTML error page (Cloudflare 5xx);
 * we never surface that raw HTML — just a mapped reason. A short, non-HTML
 * body is appended for context.
 */
function describeHttpError(providerName: string, status: number, body: string): string {
  const trimmed = body.trim();
  const isHtml = trimmed.startsWith('<')
    || /<!DOCTYPE/i.test(trimmed)
    || /<html/i.test(trimmed);

  let reason: string;
  if (status === 429) reason = 'rate limit — terlalu banyak request, coba lagi sebentar';
  else if ([530, 520, 521, 522, 523, 524].includes(status)) reason = 'server provider tidak tersedia (Cloudflare 5xx)';
  else if ([502, 503, 504].includes(status)) reason = 'server provider sibuk/gateway error';
  else if (status === 500) reason = 'server provider error';
  else if (status === 401 || status === 403) reason = 'API key ditolak';
  else if (status === 404) reason = 'model atau endpoint tidak ditemukan';
  else reason = `HTTP ${status}`;

  let msg = `${providerName}: ${reason}`;
  if (!isHtml && trimmed && trimmed.length <= 200) {
    msg += ` — ${trimmed.slice(0, 200)}`;
  }
  return msg;
}

/**
 * Stream chat completion from any OpenAI-compatible provider.
 *
 * Sends `reasoning_effort: 'low'`: free-tier reasoning models (GLM-5.3, etc.)
 * default to max-effort thinking — measured 200-215s of pure reasoning before
 * the first content token, which blows the server deadline. 'low' cuts that to
 * ~120s so a section finishes in ~160s. Endpoints that don't support the param
 * are retried once WITHOUT it (fail-open), so non-supporting providers keep
 * working.
 *
 * max_tokens must stay HIGH: on reasoning models the thinking tokens count
 * against the same max_tokens budget — a low cap truncates the section
 * mid-content (finish_reason "length").
 */
export async function streamFromProvider(params: {
  provider: AIProvider;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  /** Upper bound on completion tokens. Defaults high so long PRDs don't truncate. */
  maxTokens?: number;
}): Promise<Response> {
  const { provider, apiKey, model, messages, signal, maxTokens = 16000 } = params;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...(provider.extraHeaders ?? {}),
  };

  const url = `${provider.baseUrl}/chat/completions`;
  const baseBody = { model, messages, stream: true, max_tokens: maxTokens };

  let res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...baseBody, reasoning_effort: 'low' }),
    signal,
  });

  let errText = '';
  if (!res.ok) {
    errText = await res.text().catch(() => '');
    // Fail-open: a 400 rejecting reasoning_effort (or an equivalent unknown-param
    // error) is retried once with the base body so non-supporting endpoints work.
    if (
      res.status === 400 &&
      /reasoning_effort|unsupported parameter|unknown parameter|unexpected field|extra inputs|not permitted/i.test(errText)
    ) {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(baseBody),
        signal,
      });
      errText = res.ok ? '' : await res.text().catch(() => '');
    }
    if (!res.ok) throw new Error(describeHttpError(provider.name, res.status, errText));
  }

  return res;
}

/**
 * Parse OpenAI-compatible SSE stream, yielding content/thinking chunks.
 * Works for all three providers (9router, agentrouter, openrouter).
 * Reasoning models (e.g. DeepSeek-style) emit `reasoning_content` deltas
 * before any content — those are surfaced as `thinking` chunks so the UI
 * can show "model is thinking" instead of appearing frozen.
 */
export interface StreamChunk {
  kind: 'content' | 'thinking';
  text: string;
}

export async function* parseTokenStream(
  response: Response,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
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
          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;
          const content = delta.content;
          const reasoning = delta.reasoning_content ?? delta.reasoning;
          if (typeof content === 'string' && content.length > 0) {
            yield { kind: 'content', text: content };
          } else if (typeof reasoning === 'string' && reasoning.length > 0) {
            yield { kind: 'thinking', text: reasoning };
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

// ── Anthropic Messages API streaming (for agentrouter) ──

/**
 * Stream from AgentRouter using Anthropic SDK (Messages API).
 * AgentRouter's WAF requires Claude Code wire-image headers.
 *
 * Sends `reasoning_effort: 'low'`: free-tier reasoning models (GLM-5.3, etc.)
 * default to max-effort thinking — measured 200-215s of pure reasoning before
 * the first content token, which blows the server deadline. 'low' cuts that to
 * ~120s so a section finishes in ~160s. z.ai's Anthropic route honors it;
 * strict Anthropic proxies reject it and get the fail-open retry without it.
 *
 * max_tokens must stay HIGH: on reasoning models the thinking tokens count
 * against the same max_tokens budget — a low cap truncates the section
 * mid-content (finish_reason "length").
 */
export async function streamFromAnthropic(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  system: string;
  userMessage: string;
  signal?: AbortSignal;
  maxTokens?: number;
  /** Provider name for error messages (custom engines aren't always AgentRouter). */
  providerName?: string;
}): Promise<Response> {
  const { apiKey, baseUrl, model, system, userMessage, signal, maxTokens = 16000, providerName = 'Engine' } = params;

  // Claude Code wire-image headers to pass AgentRouter's WAF
  const headers: Record<string, string> = {
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'User-Agent': 'claude-cli/2.1.158 (external, sdk-cli)',
    'anthropic-beta': 'claude-code-20250219,interleaved-thinking-2025-05-14',
    'anthropic-dangerous-direct-browser-access': 'true',
    'x-app': 'cli',
  };

  const url = `${baseUrl}/v1/messages`;
  const baseBody = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userMessage }],
    stream: true,
  };

  let res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...baseBody, reasoning_effort: 'low' }),
    signal,
  });

  let errText = '';
  if (!res.ok) {
    errText = await res.text().catch(() => '');
    // Fail-open: a 400 rejecting reasoning_effort (or an equivalent unknown-param
    // error) is retried once with the base body so strict proxies keep working.
    if (
      res.status === 400 &&
      /reasoning_effort|unsupported parameter|unknown parameter|unexpected field|extra inputs|not permitted/i.test(errText)
    ) {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(baseBody),
        signal,
      });
      errText = res.ok ? '' : await res.text().catch(() => '');
    }
    if (!res.ok) throw new Error(describeHttpError(providerName, res.status, errText));
  }

  return res;
}

/**
 * Parse Anthropic SSE stream, yielding content/thinking chunks.
 */
export async function* parseAnthropicStream(
  response: Response,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
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

        if (trimmed.startsWith('event: ')) continue;
        if (!trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        try {
          const json = JSON.parse(data);
          if (json.type === 'content_block_delta' && json.delta) {
            if (json.delta.type === 'text_delta' && json.delta.text) {
              yield { kind: 'content', text: json.delta.text };
            }
            if (json.delta.type === 'thinking_delta' && json.delta.thinking) {
              yield { kind: 'thinking', text: json.delta.thinking };
            }
          }
          if (json.type === 'message_stop') return;
        } catch {
          // skip malformed
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
