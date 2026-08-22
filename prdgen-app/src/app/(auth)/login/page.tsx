'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MailCheck } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  // Cross-tab sync: when the magic link is verified in the new tab Gmail opens,
  // Supabase broadcasts the new session to other tabs on the same origin. This
  // tab (still showing "check email") picks it up and moves to the dashboard,
  // so no tab is left stranded.
  useEffect(() => {
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        window.location.href = '/dashboard';
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setError(error.message);
        return;
      }
      setSent(true);
    } catch {
      setError('Terjadi kesalahan jaringan.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <MailCheck className="size-6" />
        </div>
        <h1 className="text-xl font-bold text-ink">Cek emailmu</h1>
        <p className="mt-2 text-sm text-ink-dim">
          Kami mengirim tautan masuk ke <span className="font-medium text-ink">{email}</span>.
          Klik tautan itu untuk melanjutkan.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-6 text-sm font-medium text-primary hover:underline"
        >
          Pakai email lain
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-ink">Masuk ke PRDly</h1>
      <p className="mt-1 text-sm text-ink-dim">
        Masukkan email — kami kirim tautan masuk ke inbox-mu.
      </p>

      <form onSubmit={handleMagicLink} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-sm text-ink">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="kamu@email.com"
            className="border-border-paper bg-paper-raised focus-visible:ring-primary"
          />
        </div>

        {error && <p className="text-xs text-stamp">{error}</p>}

        <Button type="submit" disabled={loading || !email} className="btn-goo h-11 w-full">
          {loading ? 'Mengirim tautan…' : 'Kirim tautan masuk'}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-border-paper" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">atau</span>
        <span className="h-px flex-1 bg-border-paper" />
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={handleGoogle}
        className="h-11 w-full gap-2 border-border-paper"
      >
        <GoogleIcon />
        Lanjut dengan Google
      </Button>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}
