import {
  buildStructureSystemPrompt,
  buildStructureUserPrompt,
  extractJson,
} from '@/lib/ai/plan-prompts';
import { planCandidates, runPlanStream, sse, type PlanRequestBody } from '@/lib/ai/plan-stream';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import type { PlanStructure } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface StructureRequest extends PlanRequestBody {
  idea?: string;
}

const THINKING_THROTTLE_MS = 1500;

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const encoder = new TextEncoder();
  const body = (await req.json().catch(() => ({}))) as StructureRequest;
  const idea = (body.idea ?? '').trim();

  const candidates = planCandidates(body);
  const canRun = Boolean(candidates.length > 0 && idea);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (!canRun) {
          controller.enqueue(
            encoder.encode(sse({ type: 'error', message: 'Ide kosong atau provider AI tidak tersedia.' }))
          );
          return;
        }

        let lastThinking = 0;
        const accText = await runPlanStream({
          candidates,
          system: buildStructureSystemPrompt(),
          user: buildStructureUserPrompt(idea),
          clientSignal: req.signal,
          onToken: (text) => controller.enqueue(encoder.encode(sse({ type: 'token', content: text }))),
          onThinking: () => {
            const now = Date.now();
            if (now - lastThinking >= THINKING_THROTTLE_MS) {
              lastThinking = now;
              controller.enqueue(encoder.encode(sse({ type: 'thinking' })));
            }
          },
        });

        const structure = extractJson<PlanStructure>(accText);
        if (!structure || !Array.isArray(structure.features)) {
          controller.enqueue(
            encoder.encode(sse({ type: 'error', message: 'Model tidak mengembalikan struktur JSON yang valid.' }))
          );
          return;
        }

        // Normalize: ensure ids, empty task arrays, numeric phases. The structure
        // phase now emits names only, so overview/architecture/description
        // default to '' (older saved structures may still carry real values).
        structure.root = {
          title: structure.root?.title || 'Perencanaan',
          overview: structure.root?.overview ?? '',
          architecture: structure.root?.architecture ?? '',
        };
        structure.features = structure.features.map((f, i) => ({
          id: f.id || `feature-${i + 1}`,
          name: f.name ?? `Fitur ${i + 1}`,
          description: f.description ?? '',
          phase: Number(f.phase) || 1,
          subFeatures: Array.isArray(f.subFeatures)
            ? f.subFeatures.map((s, j) => ({
                id: s.id || `${f.id || `feature-${i + 1}`}-sub-${j + 1}`,
                name: s.name ?? '',
                description: s.description ?? '',
              }))
            : [],
          tasks: [],
        }));

        controller.enqueue(encoder.encode(sse({ type: 'structure', structure })));
        controller.enqueue(encoder.encode(sse({ type: 'done' })));
      } catch (err) {
        controller.enqueue(
          encoder.encode(sse({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' }))
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
