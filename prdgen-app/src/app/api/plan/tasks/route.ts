import {
  buildTaskSystemPrompt,
  buildTaskUserPrompt,
  extractJson,
} from '@/lib/ai/plan-prompts';
import { planCandidates, runPlanStream, sse, type PlanRequestBody } from '@/lib/ai/plan-stream';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import type { PlanStructure, PlanTask } from '@/types';

export const dynamic = 'force-dynamic';

interface TaskRequest extends PlanRequestBody {
  structure?: PlanStructure;
}

interface TaskResult {
  features: { id: string; tasks: PlanTask[] }[];
}

const THINKING_THROTTLE_MS = 1500;

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const encoder = new TextEncoder();
  const body = (await req.json().catch(() => ({}))) as TaskRequest;
  const structure = body.structure;

  const candidates = planCandidates(body);
  const canRun = Boolean(candidates.length > 0 && structure && Array.isArray(structure.features));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (!canRun) {
          controller.enqueue(
            encoder.encode(sse({ type: 'error', message: 'Struktur kosong atau provider AI tidak tersedia.' }))
          );
          return;
        }

        let lastThinking = 0;
        const accText = await runPlanStream({
          candidates,
          system: buildTaskSystemPrompt(),
          user: buildTaskUserPrompt(structure!),
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

        const parsed = extractJson<TaskResult>(accText);
        if (!parsed || !Array.isArray(parsed.features)) {
          controller.enqueue(
            encoder.encode(sse({ type: 'error', message: 'Model tidak mengembalikan task JSON yang valid.' }))
          );
          return;
        }

        const features = parsed.features.map((f) => ({
          id: f.id,
          tasks: Array.isArray(f.tasks)
            ? f.tasks.map((t, j) => ({
                id: t.id || `${f.id}-task-${j + 1}`,
                title: t.title ?? `Task ${j + 1}`,
                description: t.description ?? '',
                done: false,
              }))
            : [],
        }));

        controller.enqueue(encoder.encode(sse({ type: 'tasks', features })));
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
