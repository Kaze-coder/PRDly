import type { StreamEvent } from '@/types';

/**
 * Parse a Server-Sent Events stream from a fetch Response into StreamEvent objects.
 */
export async function* parseSSEStream(
  response: Response
): AsyncGenerator<StreamEvent> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last (possibly incomplete) line in buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data === '[DONE]') return;

          try {
            yield JSON.parse(data) as StreamEvent;
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
