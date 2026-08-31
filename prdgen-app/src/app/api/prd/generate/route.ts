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

      try {
        if (useRealAI) {
          await streamRealAI(controller, encoder, candidates, { input, structure, idea }, prdId, sections, previous, req.signal);
        } else {
          await streamMock(controller, encoder, prdId);
        }
      } catch (err) {
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

  for (const cand of candidates) {
    // Abort controller per attempt: kill the provider request if the client
    // disconnects or this attempt fails, so the model stops consuming tokens.
    const attempt = new AbortController();
    const onClientAbort = () => attempt.abort();
    clientSignal?.addEventListener('abort', onClientAbort, { once: true });

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
      const tokenStream: AsyncGenerator<StreamChunk> =
        cand.provider.format === 'anthropic'
          ? parseAnthropicStream(res, attempt.signal)
          : parseTokenStream(res, attempt.signal);

      await streamTokens(controller, encoder, tokenStream, prdId);
      return;
    } catch (err) {
      lastError = err;
      // Abort this attempt (stops the model on the provider side), then try the next provider.
      attempt.abort();
    } finally {
      clientSignal?.removeEventListener('abort', onClientAbort);
      attempt.abort();
    }
  }

  throw lastError ?? new Error('No AI provider available');
}

// Stream tokens and detect section boundaries by watching for ## headings.
// Thinking chunks (reasoning models) become a throttled "thinking" event so the
// client can show a live indicator instead of looking frozen.
async function streamTokens(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  tokenStream: AsyncGenerator<StreamChunk>,
  prdId: string
) {
  let currentSection: string | null = null;
  let lineBuffer = '';
  let lastThinkingEmit = 0;
  // Guards a one-time <think> tag strip at the very start of the content.
  let sawContent = false;
  const THINKING_THROTTLE_MS = 2000;

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

  for await (const chunk of tokenStream) {
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
      if (!raw.startsWith('#')) {
        controller.enqueue(encoder.encode(sse({ type: 'token', content: line + '\n' })));
        continue;
      }
      const heading = raw.replace(/^#+\s*/, '').trim();
      const matchedKey = titleToKey.get(normalizeHeading(heading));

      if (matchedKey) {
        // Section boundary — emit section events, skip emitting the heading as content.
        if (currentSection) {
          controller.enqueue(encoder.encode(sse({ type: 'section_end', section: currentSection })));
        }
        currentSection = matchedKey;
        controller.enqueue(encoder.encode(sse({ type: 'section_start', section: matchedKey })));
      } else {
        // Regular content line — emit with the newline.
        controller.enqueue(encoder.encode(sse({ type: 'token', content: line + '\n' })));
      }
    }
  }

    if (lineBuffer) {
      controller.enqueue(encoder.encode(sse({ type: 'token', content: lineBuffer })));
    }
  if (currentSection) {
    controller.enqueue(encoder.encode(sse({ type: 'section_end', section: currentSection })));
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
