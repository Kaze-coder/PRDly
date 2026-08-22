import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db/prisma';

interface AuthedUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

/**
 * Server-side auth guard for RSC / route handlers.
 * Validates the Supabase session and lazily upserts the Prisma user row
 * (Supabase UID = User.id). Returns null when not signed in.
 */
export async function getAuthUser(): Promise<AuthedUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const meta = user.user_metadata ?? {};
  const name: string | null = meta.full_name ?? meta.name ?? null;
  const avatarUrl: string | null = meta.avatar_url ?? meta.picture ?? null;
  const email = user.email ?? '';

  const dbUser = await prisma.user.upsert({
    where: { id: user.id },
    update: { email, name, avatarUrl, emailVerified: true },
    create: { id: user.id, email, name, avatarUrl, emailVerified: true },
  });

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    avatarUrl: dbUser.avatarUrl,
  };
}

/** RSC variant: redirects to /login when not authenticated. */
export async function getAuthUserOrRedirect(): Promise<AuthedUser> {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  return user;
}
