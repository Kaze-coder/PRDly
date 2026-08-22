import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

/**
 * Auth callback for BOTH flows:
 *   - Magic-link email login (?token_hash=&type=)
 *   - Google OAuth (?code=)
 * Establishes the Supabase session, upserts the Prisma user, then → /dashboard.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = searchParams.get('next') || '/dashboard';

  const supabase = await createClient();

  let ok = false;
  if (code) {
    // OAuth (Google) — exchange the auth code for a session.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type) {
    // Magic link — verify the token hash from the email.
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'email' | 'magiclink',
      token_hash: tokenHash,
    });
    ok = !error;
  }

  if (!ok) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  // Sync the Prisma user row (Supabase UID = User.id).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const meta = user.user_metadata ?? {};
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        email: user.email ?? '',
        name: meta.full_name ?? meta.name ?? null,
        avatarUrl: meta.avatar_url ?? meta.picture ?? null,
        emailVerified: true,
      },
      create: {
        id: user.id,
        email: user.email ?? '',
        name: meta.full_name ?? meta.name ?? null,
        avatarUrl: meta.avatar_url ?? meta.picture ?? null,
        emailVerified: true,
      },
    });
  }

  return NextResponse.redirect(`${origin}${next}`);
}
