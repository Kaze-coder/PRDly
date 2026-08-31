import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { isUuid } from '@/lib/is-uuid';

/**
 * Chat Refine history for a PRD. Scoped to the owner — a user can only read or
 * append messages to their own PRD's chat.
 */

async function assertOwner(prdId: string, userId: string): Promise<boolean> {
  if (!isUuid(prdId)) return false;
  const prd = await prisma.pRD.findFirst({ where: { id: prdId, userId }, select: { id: true } });
  return Boolean(prd);
}

// GET /api/prd/[id]/chat → all messages for both modes, oldest first.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!(await assertOwner(id, user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rows = await prisma.chatMessage.findMany({
    where: { prdId: id },
    orderBy: { createdAt: 'asc' },
    select: { mode: true, role: true, content: true },
  });

  return NextResponse.json({
    data: {
      ask: rows.filter((r) => r.mode === 'ask').map(({ role, content }) => ({ role, content })),
      edit: rows.filter((r) => r.mode === 'edit').map(({ role, content }) => ({ role, content })),
    },
  });
}

// POST /api/prd/[id]/chat → append one message. Body: { mode, role, content }.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!(await assertOwner(id, user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    mode?: string;
    role?: string;
    content?: string;
  };
  const mode = body.mode === 'edit' ? 'edit' : 'ask';
  const role = body.role === 'assistant' ? 'assistant' : 'user';
  const content = (body.content ?? '').trim();
  if (!content) return NextResponse.json({ error: 'Empty content' }, { status: 400 });

  await prisma.chatMessage.create({
    data: { prdId: id, mode, role, content },
  });

  return NextResponse.json({ ok: true });
}
