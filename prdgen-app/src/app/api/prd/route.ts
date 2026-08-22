import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUser } from '@/lib/auth/get-auth-user';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const prds = await prisma.pRD.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        modelUsed: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    // Normalize to the client's PRD shape (snake_case keys).
    return NextResponse.json({
      data: prds.map((p: (typeof prds)[number]) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        status: p.status,
        model_used: p.modelUsed,
        created_at: p.createdAt.toISOString(),
        updated_at: p.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error('GET /api/prd failed:', err);
    return NextResponse.json({ error: 'Failed to load PRDs' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const { title, description, status, content, markdown_content, model_used, idea, structure } = body ?? {};

    const prd = await prisma.pRD.create({
      data: {
        userId: user.id,
        title: title ?? 'PRD Baru',
        description: description ?? null,
        status: status ?? 'completed',
        content: content ?? null,
        markdownContent: markdown_content ?? null,
        modelUsed: model_used ?? null,
        idea: idea ?? null,
        structure: structure ?? null,
      },
    });

    return NextResponse.json({ data: prd }, { status: 201 });
  } catch (err) {
    console.error('POST /api/prd failed:', err);
    return NextResponse.json({ error: 'Failed to save PRD' }, { status: 500 });
  }
}
