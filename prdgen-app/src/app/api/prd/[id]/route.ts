import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUser } from '@/lib/auth/get-auth-user';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    // Scope by userId so a foreign id returns 404 (no existence leak).
    const prd = await prisma.pRD.findFirst({ where: { id, userId: user.id } });
    if (!prd) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({
      data: {
        id: prd.id,
        user_id: prd.userId,
        title: prd.title,
        description: prd.description,
        status: prd.status,
        content: prd.content,
        markdown_content: prd.markdownContent,
        model_used: prd.modelUsed,
        idea: prd.idea,
        structure: prd.structure,
        created_at: prd.createdAt.toISOString(),
        updated_at: prd.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('GET /api/prd/[id] failed:', err);
    return NextResponse.json({ error: 'Failed to load PRD' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json();
    const { title, description, status, content, markdown_content, model_used, idea, structure } = body ?? {};
    // Guard by userId: updateMany returns count 0 for a foreign/missing id.
    const result = await prisma.pRD.updateMany({
      where: { id, userId: user.id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(markdown_content !== undefined ? { markdownContent: markdown_content } : {}),
        ...(model_used !== undefined ? { modelUsed: model_used } : {}),
        ...(idea !== undefined ? { idea } : {}),
        ...(structure !== undefined ? { structure } : {}),
      },
    });
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error('PUT /api/prd/[id] failed:', err);
    return NextResponse.json({ error: 'Failed to update PRD' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const result = await prisma.pRD.deleteMany({ where: { id, userId: user.id } });
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error('DELETE /api/prd/[id] failed:', err);
    return NextResponse.json({ error: 'Failed to delete PRD' }, { status: 500 });
  }
}
