/**
 * Client-side custom-engine resolver.
 *
 * Engine configs now live per-user in the DB (GET /api/engines), not in
 * localStorage. This helper fetches the caller's engines once per browser
 * session and maps a model id/name to the request-body shape the generation
 * API routes read (`base_url` / `api_key` / `compat`).
 *
 * Never throws: a null return means "no custom engine — let the server fall
 * back to its env-configured providers".
 */

export interface EngineBody {
  base_url: string;
  api_key: string;
  compat: string;
}

interface ApiEngine {
  id: string;
  name: string;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  compat?: string;
}

// Shared across all callers; a failed fetch resets this so a later call retries.
let enginesPromise: Promise<ApiEngine[]> | null = null;

function loadEngines(): Promise<ApiEngine[]> {
  if (!enginesPromise) {
    enginesPromise = fetch('/api/engines')
      .then(async (res) => {
        if (!res.ok) throw new Error(`engines fetch failed: ${res.status}`);
        const json = (await res.json()) as { data?: ApiEngine[] };
        return Array.isArray(json.data) ? json.data : [];
      })
      .catch((err) => {
        enginesPromise = null; // reset so the next call retries
        throw err;
      });
  }
  return enginesPromise;
}

export async function fetchEngineBody(
  modelId: string | null | undefined
): Promise<EngineBody | null> {
  if (!modelId) return null;
  try {
    const engines = await loadEngines();
    const match = engines.find(
      (e) => e.model === modelId || e.id === modelId || e.name === modelId
    );
    if (match?.baseUrl && match?.apiKey) {
      return { base_url: match.baseUrl, api_key: match.apiKey, compat: match.compat ?? 'openai' };
    }
  } catch {
    // swallow — null means "use server env providers"
  }
  return null;
}
