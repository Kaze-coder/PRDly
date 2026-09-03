import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { decryptSecret } from '@/lib/crypto';
import { buildCustomCandidate, buildProviderCandidates } from '@/lib/ai/providers';

export const dynamic = 'force-dynamic';

/**
 * Test Connection — pings an engine with a minimal non-streaming request to
 * verify the model is reachable/usable, and reports round-trip latency.
 *
 * Mirrors generation's candidate selection (buildCustomCandidate first, then
 * buildProviderCandidates[0]) so the test reflects what real calls would do.
 *
 * Completed tests always return HTTP 200 with { ok } so the client renders
 * uniformly; only auth/validation/lookup failures use non-200 status codes.
 */

const TIMEOUT_MS = 20_000;
const STREAM_TIMEOUT_MS = 15_000;

function classifyStatus(status: number): string {
  if (status === 401 || status === 403) return 'API Key salah/ditolak';
  if (status === 404) return 'Model atau endpoint tidak ditemukan';
  if (status === 429) return 'Rate limited';
  if (status >= 500) return 'Server provider error';
  return `status ${status}`;
}

/**
 * Second probe: the same tiny request WITH streaming enabled, measuring time to
 * the first SSE chunk. Some proxies answer a non-streaming ping in ~1s but never
 * emit a streaming chunk — that failure mode is invisible to the basic ping.
 * Returns null when no chunk arrives within STREAM_TIMEOUT_MS or on any error.
 */
async function probeStream(
  provider: { baseUrl: string; format: 'openai' | 'anthropic'; extraHeaders?: Record<string, string> },
  key: string,
  modelString: string
): Promise<number | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), STREAM_TIMEOUT_MS);
  const start = Date.now();
  try {
    const isAnthropic = provider.format === 'anthropic';
    const url = isAnthropic
      ? `${provider.baseUrl}/v1/messages`
      : `${provider.baseUrl}/chat/completions`;
    const headers: Record<string, string> = isAnthropic
      ? {
          'x-api-key': key,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'User-Agent': 'claude-cli/2.1.158 (external, sdk-cli)',
          'anthropic-beta': 'claude-code-20250219,interleaved-thinking-2025-05-14',
          'anthropic-dangerous-direct-browser-access': 'true',
          'x-app': 'cli',
        }
      : {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          ...(provider.extraHeaders ?? {}),
        };
    const payload = isAnthropic
      ? {
          model: modelString,
          max_tokens: 16,
          system: 'ping',
          messages: [{ role: 'user', content: 'ping' }],
          stream: true,
        }
      : {
          model: modelString,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 16,
          stream: true,
        };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return null; // stream ended without ever emitting a data line
        buffer += decoder.decode(value, { stream: true });
        // First real SSE payload line = the provider is actually streaming.
        if (/(^|\n)data:/.test(buffer)) return Date.now() - start;
      }
    } finally {
      reader.releaseLock();
      void ctrl.abort(); // stop the model as soon as we have our answer
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    compat?: string;
  };

  let model: string | undefined;
  let baseUrl: string | undefined;
  let apiKey: string | undefined;
  let compat: string | undefined;

  if (body.id) {
    // Mode 1: test a saved engine.
    const engine = await prisma.customEngine.findFirst({
      where: { id: body.id, userId: user.id },
    });
    if (!engine) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    model = engine.model;
    baseUrl = engine.baseUrl ?? undefined;
    compat = engine.compat;
    if (engine.apiKeyEnc) {
      try {
        apiKey = decryptSecret(engine.apiKeyEnc);
      } catch {
        apiKey = undefined; // secret rotated / corrupt — treat as missing
      }
    }
  } else {
    // Mode 2: test an unsaved config from the add-engine dialog.
    model = body.model?.trim();
    baseUrl = body.baseUrl?.trim() || undefined;
    apiKey = body.apiKey?.trim() || undefined;
    compat = body.compat;
    if (!model) {
      return NextResponse.json({ error: 'Model ID wajib diisi.' }, { status: 400 });
    }
  }

  if (!model) {
    return NextResponse.json({ error: 'Model ID wajib diisi.' }, { status: 400 });
  }

  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
    return NextResponse.json(
      { error: 'Base URL harus diawali http:// atau https://' },
      { status: 400 }
    );
  }

  // Choose the candidate the same way generation does.
  let candidate = buildCustomCandidate({ modelId: model, baseUrl, apiKey, compat });
  if (!candidate) {
    candidate = buildProviderCandidates(model)[0] ?? null;
  }
  if (!candidate) {
    return NextResponse.json({
      ok: false,
      streamOk: false,
      error:
        'Tidak ada provider aktif — set Base URL + API Key, atau konfigurasi provider bawaan di env.',
    });
  }

  const { provider, apiKey: key, modelString } = candidate;

  let res: Response;
  const start = Date.now();
  try {
    if (provider.format === 'anthropic') {
      const headers: Record<string, string> = {
        'x-api-key': key,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'User-Agent': 'claude-cli/2.1.158 (external, sdk-cli)',
        'anthropic-beta': 'claude-code-20250219,interleaved-thinking-2025-05-14',
        'anthropic-dangerous-direct-browser-access': 'true',
        'x-app': 'cli',
      };
      res = await fetch(`${provider.baseUrl}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelString,
          max_tokens: 16,
          system: 'ping',
          messages: [{ role: 'user', content: 'ping' }],
          stream: false,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } else {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(provider.extraHeaders ?? {}),
      };
      res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelString,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 16,
          stream: false,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    }
  } catch {
    return NextResponse.json({ ok: false, streamOk: false, error: 'Tidak bisa terhubung ke endpoint' });
  }
  const latencyMs = Date.now() - start;

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const detail = text.trim().slice(0, 200);
    // Well-known codes get a classified reason; otherwise surface the body snippet.
    const known = res.status === 401 || res.status === 403 || res.status === 404
      || res.status === 429 || res.status >= 500;
    const error = known ? classifyStatus(res.status) : (detail || `status ${res.status}`);
    return NextResponse.json({ ok: false, streamOk: false, error });
  }

  // res.ok — confirm the body is valid JSON (reachable + speaking the protocol).
  try {
    await res.json();
  } catch {
    return NextResponse.json({ ok: false, streamOk: false, error: 'Respons tidak valid dari endpoint' });
  }

  // Basic ping worked — now verify the endpoint actually STREAMS. Only reached
  // when the ping succeeded, so a broken endpoint isn't probed twice.
  const firstChunkMs = await probeStream(provider, key, modelString);

  return NextResponse.json({
    ok: true,
    latencyMs,
    via: provider.id,
    streamOk: firstChunkMs !== null,
    ...(firstChunkMs !== null ? { firstChunkMs } : {}),
  });
}
