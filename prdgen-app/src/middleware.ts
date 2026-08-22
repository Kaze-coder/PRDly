import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Auth gate:
 *   - no session → /login  (public routes still allowed)
 *   - session    → allowed (login page bounces to /dashboard)
 *
 * Always returns the response from updateSession so refreshed Supabase auth
 * cookies are never dropped.
 */
export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname === '/' ||
    pathname.startsWith('/blog') ||
    pathname.startsWith('/share/') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/api/auth/');

  const isAuthPage = pathname === '/login';

  if (!user) {
    if (isPublic || isAuthPage) return response;
    return redirectTo('/login', request, response);
  }

  // Signed in — keep them out of the login page.
  if (isAuthPage) return redirectTo('/dashboard', request, response);
  return response;
}

/** Redirect while preserving refreshed auth cookies from updateSession. */
function redirectTo(path: string, request: NextRequest, base: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = '';
  const redirect = NextResponse.redirect(url);
  base.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)',
  ],
};
