import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes the Supabase session on every request and exposes the current
 * user + session_id. Edge-safe: no Prisma, no Node-only APIs.
 *
 * Returns the mutable response (carrying refreshed auth cookies) which the
 * root middleware MUST return (possibly after copying redirect headers).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() validates the token with the Supabase auth server (not just
  // decoding the cookie), so it's safe to gate on.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
