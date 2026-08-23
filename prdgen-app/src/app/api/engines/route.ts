import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { encryptSecret, decryptSecret } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

/**
 * Per-user custom AI engines. API keys are encrypted at rest (AES-256-GCM);
 * decrypted only when returned to their owner for use in generation calls.
 */

// GET /api/engines → the user's engines (with decrypted apiKey).
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await prisma.customEngine.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
  });

  const data = rows.map((e) => {
    let apiKey: string | undefined;
    if (e.apiKeyEnc) {
      try {
        apiKey = decryptSecret(e.apiKeyEnc);
      } catch {
        apiKey = undefined; // secret rotated / corrupt — treat as missing
      }
    }
    return {
      id: e.id,
      name: e.name,
      model: e.model,
      baseUrl: e.baseUrl ?? undefined,
      apiKey,
      compat: (e.compat === 'anthropic' ? 'anthropic' : 'openai') as 'openai' | 'anthropic',
    };
  });

  return NextResponse.json({ data });
}

// POST /api/engines → create an engine (encrypts apiKey). Body: {name, model, baseUrl?, apiKey?, compat}
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    compat?: string;
  };
  const name = body.name?.trim();
  const model = body.model?.trim();
  if (!name || !model) {
    return NextResponse.json({ error: 'Nama dan Model ID wajib diisi.' }, { status: 400 });
  }

  const created = await prisma.customEngine.create({
    data: {
      userId: user.id,
      name,
      model,
      baseUrl: body.baseUrl?.trim() || null,
      apiKeyEnc: body.apiKey?.trim() ? encryptSecret(body.apiKey.trim()) : null,
      compat: body.compat === 'anthropic' ? 'anthropic' : 'openai',
    },
  });

  return NextResponse.json({
    data: {
      id: created.id,
      name: created.name,
      model: created.model,
      baseUrl: created.baseUrl ?? undefined,
      apiKey: body.apiKey?.trim() || undefined,
      compat: (created.compat === 'anthropic' ? 'anthropic' : 'openai') as 'openai' | 'anthropic',
    },
  });
}

// DELETE /api/engines?id=<uuid> → remove one owned engine.
export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id wajib' }, { status: 400 });

  const result = await prisma.customEngine.deleteMany({ where: { id, userId: user.id } });
  if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
