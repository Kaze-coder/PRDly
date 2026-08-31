import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { isUuid } from '@/lib/is-uuid';

// POST /api/prd/[id]/share — generate a public share link for an owned PRD.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Ownership check — only the owner can share their PRD.
  const prd = await prisma.pRD.findFirst({ where: { id, userId: user.id } });
  if (!prd) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const token = `${randomBytes(16).toString('hex')}`;
    const link = await prisma.sharedLink.create({
      data: { prdId: id, token, isActive: true },
    });
    return NextResponse.json({
      id: link.id,
      prd_id: link.prdId,
      token: link.token,
      is_active: link.isActive,
      expires_at: link.expiresAt,
      url: `/share/${link.token}`,
    });
  } catch (err) {
    console.error('POST /api/prd/[id]/share failed:', err);
    return NextResponse.json({ error: 'Failed to create share link' }, { status: 500 });
  }
}
