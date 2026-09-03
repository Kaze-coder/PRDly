import { MOCK_PRD_CONTENT } from '@/lib/mock-data';
import { PRD_SECTIONS } from '@/types';
import { buildSystemPrompt, buildUserPrompt, buildUserPromptFromStructure, getFewShotExamples } from '@/lib/ai/prompts';
import {
  buildCustomCandidate,
  buildProviderCandidates,
  openProviderStream,
  parseTokenStream,
  parseAnthropicStream,
} from '@/lib/ai/providers';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import type { StreamChunk } from '@/lib/ai/providers';
import type { PRDFormInput, PlanStructure, PRDSectionKey } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function sse(data: object) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const encoder = new TextEncoder();
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const modelId = (body?.model_id as string) ?? 'gemini-flash';
  const input = body?.input as PRDFormInput | undefined;
  // Struktur → PRD flow: PRD grounded in a reviewed feature structure.
  const structure = body?.structure as PlanStructure | undefined;
  const idea = (body?.idea as string | undefined) ?? '';

  // Batched generation: client requests a subset of sections per invocation,
  // passing previously-generated sections as consistency context.
  const validKeys = new Set<PRDSectionKey>(PRD_SECTIONS.map((s) => s.key));
  const rawSections = Array.isArray(body?.sections) ? (body.sections as unknown[]) : [];
  const requestedSet = new Set(
    rawSections.filter((s): s is PRDSectionKey => typeof s === 'string' && validKeys.has(s as PRDSectionKey))
  );
  // Keep PRD_SECTIONS order; empty/none → all 17.
  const sections: PRDSectionKey[] = requestedSet.size > 0
    ? PRD_SECTIONS.filter((s) => requestedSet.has(s.key)).map((s) => s.key)
    : PRD_SECTIONS.map((s) => s.key);

  const PREVIOUS_CAP = 1500;
  const rawPrevious = (body?.previous ?? {}) as Record<string, unknown>;
  const previous: Partial<Record<PRDSectionKey, string>> = {};
  for (const [key, val] of Object.entries(rawPrevious)) {
    if (validKeys.has(key as PRDSectionKey) && typeof val === 'string') {
      previous[key as PRDSectionKey] = val.slice(0, PREVIOUS_CAP);
    }
  }

  const candidates = buildProviderCandidates(modelId);
  // User-configured custom engine wins — built-ins stay as failover.
  const custom = buildCustomCandidate({
    modelId,
    baseUrl: body?.base_url as string | undefined,
    apiKey: body?.api_key as string | undefined,
    compat: body?.compat as string | undefined,
  });
  if (custom) candidates.unshift(custom);
  const useRealAI = Boolean(candidates.length > 0 && (input || structure));

  const stream = new ReadableStream({
    async start(controller) {
      const prdId = `prd-${Date.now()}`;
      const startedAt = Date.now();

      try {
        if (useRealAI) {
          await streamRealAI(controller, encoder, candidates, { input, structure, idea }, prdId, sections, previous, req.signal);
        } else {
          await streamMock(controller, encoder, prdId);
        }
      } catch (err) {
        // Log server-side: Vercel function logs were empty because nothing was
        // ever written, making silent-stream failures impossible to diagnose.
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        console.error(`[prd/generate] failed after ${elapsed}s (sections: ${sections.join(',')}):`, err);
        controller.enqueue(
          encoder.encode(
            sse({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
          )
        );
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// ── Real AI streaming ──
type ProviderCandidate = ReturnType<typeof buildProviderCandidates>[number];

async function streamRealAI(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  candidates: ProviderCandidate[],
  source: { input?: PRDFormInput; structure?: PlanStructure; idea?: string },
  prdId: string,
  sections: PRDSectionKey[],
  previous: Partial<Record<PRDSectionKey, string>>,
  clientSignal?: AbortSignal,
) {
  // Self-improvement: inject excerpts from top completed PRDs as few-shot examples.
  const fewShotExamples = await getFewShotExamples(2);
  const systemPrompt = buildSystemPrompt(fewShotExamples, sections, previous);
  const userPrompt = source.structure
    ? buildUserPromptFromStructure(source.idea ?? '', source.structure)
    : buildUserPrompt(source.input!);

  let lastError: unknown = null;

  // Section enforcement: the model must emit ONLY the requested sections.
  // Spilling into other sections corrupts parallel per-section requests.
  const allowedKeys = new Set<PRDSectionKey>(sections);

  // Request-wide deadline: abort a hung/slow provider before Vercel's 300s
  // hard kill so the outer catch can emit a clean SSE error.
  const deadline = Date.now() + 250_000;
  // No-activity timeout: some proxies accept a streaming request then never
  // send a chunk. Abort fast instead of burning the whole deadline in silence.
  const INACTIVITY_MS = 90_000;
  let stalled = false;

  for (const cand of candidates) {
    // Out of time — don't start another candidate.
    if (Date.now() >= deadline) break;

    // Abort controller per attempt: kill the provider request if the client
    // disconnects or this attempt fails, so the model stops consuming tokens.
    const attempt = new AbortController();
    const onClientAbort = () => attempt.abort();
    clientSignal?.addEventListener('abort', onClientAbort, { once: true });
    const timer = setTimeout(() => attempt.abort('timeout'), Math.max(0, deadline - Date.now()));
    let inactivity: ReturnType<typeof setTimeout> | undefined;
    const touch = () => {
      clearTimeout(inactivity);
      inactivity = setTimeout(() => {
        stalled = true;
        attempt.abort('timeout');
      }, INACTIVITY_MS);
    };

    try {
      const res = await openProviderStream({
        provider: cand.provider,
        apiKey: cand.apiKey,
        modelString: cand.modelString,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        signal: attempt.signal,
      });
      touch();
      const tokenStream: AsyncGenerator<StreamChunk> =
        cand.provider.format === 'anthropic'
          ? parseAnthropicStream(res, attempt.signal)
          : parseTokenStream(res, attempt.signal);

      await streamTokens(controller, encoder, tokenStream, prdId, touch, allowedKeys, () => attempt.abort());
      return;
    } catch (err) {
      lastError = err;
      // Abort this attempt (stops the model on the provider side), then try the next provider.
      attempt.abort();
    } finally {
      clearTimeout(timer);
      clearTimeout(inactivity);
      clientSignal?.removeEventListener('abort', onClientAbort);
      attempt.abort();
    }
  }

  if (stalled) {
    throw new Error(
      `Model tidak merespons — tidak ada token selama ${INACTIVITY_MS / 1000} detik. Coba lagi atau ganti model.`
    );
  }
  // Map opaque abort errors to a user-readable timeout message.
  if (lastError instanceof Error && /abort/i.test(lastError.message)) {
    throw new Error('Model terlalu lambat — coba lagi atau pakai model lebih cepat.');
  }
  throw lastError ?? new Error('No AI provider available');
}

// Stream tokens and detect section boundaries by watching for ## headings.
// Thinking chunks (reasoning models) become a throttled "thinking" event so the
// client can show a live indicator instead of looking frozen.
// `touch` resets the caller's no-activity timer on every chunk.
//
// Section enforcement (`allowedKeys` + `onStop`):
// - Anything before the first ALLOWED heading is buffered and discarded — models
//   often open with deliberation/meta-commentary. If no allowed heading ever
//   arrives the buffer is flushed instead, so headingless output isn't lost.
// - A heading for a known-but-NOT-requested section ends the current section and
//   stops the stream: the model has spilled into another request's territory,
//   and keeping those tokens would corrupt parallel per-section requests.
async function streamTokens(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  tokenStream: AsyncGenerator<StreamChunk>,
  prdId: string,
  touch: () => void = () => {},
  allowedKeys?: Set<PRDSectionKey>,
  onStop: () => void = () => {}
) {
  let currentSection: string | null = null;
  let lineBuffer = '';
  let lastThinkingEmit = 0;
  // Guards a one-time <think> tag strip at the very start of the content.
  let sawContent = false;
  const THINKING_THROTTLE_MS = 2000;
  // Lines seen before the first allowed heading — discarded once one arrives,
  // flushed as content if the stream ends without any.
  let preambleBuffer = '';
  const PREAMBLE_CAP = 8000;
  // Set when a non-requested section heading forces an early stop.
  let stopped = false;

  const isAllowed = (key: PRDSectionKey) => !allowedKeys || allowedKeys.has(key);

  // Flexible heading matcher: normalize "Goals & Success Metrics" ≈ "goals and success metrics",
  // "Data Model/Schema" ≈ "data model" — handles the AI writing slightly different heading text.
  function normalizeHeading(h: string): string {
    return h
      .replace(/\band\b|&/g, ' and ')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  const titleToKey = new Map(
    PRD_SECTIONS.map((s) => [normalizeHeading(s.title), s.key])
  );
  // Also accept the exact key name as a heading fallback (e.g. 'executive_summary').
  for (const s of PRD_SECTIONS) {
    titleToKey.set(s.key.replace(/_/g, ' ').toLowerCase(), s.key);
  }

  outer: for await (const chunk of tokenStream) {
    touch();
    if (chunk.kind === 'thinking') {
      const now = Date.now();
      if (now - lastThinkingEmit >= THINKING_THROTTLE_MS) {
        lastThinkingEmit = now;
        controller.enqueue(encoder.encode(sse({ type: 'thinking' })));
      }
      continue;
    }

    // Some models leak reasoning as literal <think>…</think> tags in the
    // content stream. Strip them before section parsing so they never reach
    // the document. `sawContent` gates the cheap open-tag scan to the start.
    let text = chunk.text;
    if (!sawContent) {
      text = text.replace(/<\/?think>/gi, '');
      if (text.trim().length > 0) sawContent = true;
    }
    if (!text) continue;

    // Buffer tokens and only emit complete lines.
    // This prevents double-emission: a token would otherwise be sent immediately
    // AND again as part of a flushed line when the next '\n' arrives.
    lineBuffer += text;

    while (lineBuffer.includes('\n')) {
      const nlIdx = lineBuffer.indexOf('\n');
      const line = lineBuffer.slice(0, nlIdx);
      lineBuffer = lineBuffer.slice(nlIdx + 1);

      const raw = line.trim();
      const heading = raw.startsWith('#') ? raw.replace(/^#+\s*/, '').trim() : null;
      const matchedKey = heading ? titleToKey.get(normalizeHeading(heading)) : undefined;

      // ── Preamble mode: nothing emitted until the first ALLOWED heading. ──
      if (currentSection === null) {
        if (matchedKey && isAllowed(matchedKey)) {
          // First real section — drop everything buffered before it.
          preambleBuffer = '';
          currentSection = matchedKey;
          controller.enqueue(encoder.encode(sse({ type: 'section_start', section: matchedKey })));
          continue;
        }
        // Buffer everything else (including non-requested headings).
        preambleBuffer += line + '\n';
        if (preambleBuffer.length > PREAMBLE_CAP) {
          // Non-compliant model rambling without ever starting a requested
          // section — stop rather than burn the whole deadline.
          preambleBuffer = '';
          stopped = true;
          onStop();
          break outer;
        }
        continue;
      }

      if (matchedKey) {
        if (!isAllowed(matchedKey)) {
          // Spilled into another request's section — close ours and stop.
          controller.enqueue(encoder.encode(sse({ type: 'section_end', section: currentSection })));
          currentSection = null;
          lineBuffer = '';
          stopped = true;
          onStop();
          break outer;
        }
        // Section boundary — emit section events, skip emitting the heading as content.
        controller.enqueue(encoder.encode(sse({ type: 'section_end', section: currentSection })));
        currentSection = matchedKey;
        controller.enqueue(encoder.encode(sse({ type: 'section_start', section: matchedKey })));
        continue;
      }

      // Regular content line — emit with the newline.
      controller.enqueue(encoder.encode(sse({ type: 'token', content: line + '\n' })));
    }
  }

  if (!stopped) {
    // No allowed heading ever matched: the model wrote content without usable
    // headings. Flush the buffer so the work isn't lost (the client attributes
    // it to the requested section).
    if (currentSection === null && preambleBuffer) {
      controller.enqueue(encoder.encode(sse({ type: 'token', content: preambleBuffer })));
    }
    if (lineBuffer) {
      controller.enqueue(encoder.encode(sse({ type: 'token', content: lineBuffer })));
    }
    if (currentSection) {
      controller.enqueue(encoder.encode(sse({ type: 'section_end', section: currentSection })));
    }
  }
  controller.enqueue(encoder.encode(sse({ type: 'done', prd_id: prdId })));
}

// ── Mock streaming (no API key configured) ──
async function streamMock(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  prdId: string
) {
  for (const section of PRD_SECTIONS) {
    controller.enqueue(encoder.encode(sse({ type: 'section_start', section: section.key })));

    const content = MOCK_PRD_CONTENT[section.key];
    const words = content.split(' ');

    for (let i = 0; i < words.length; i++) {
      const token = (i === 0 ? '' : ' ') + words[i];
      controller.enqueue(encoder.encode(sse({ type: 'token', content: token })));
      await new Promise((r) => setTimeout(r, 10 + Math.random() * 20));
    }

    controller.enqueue(encoder.encode(sse({ type: 'section_end', section: section.key })));
    await new Promise((r) => setTimeout(r, 100));
  }

  controller.enqueue(encoder.encode(sse({ type: 'done', prd_id: prdId })));
}
