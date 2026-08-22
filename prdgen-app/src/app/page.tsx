'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/new');
  }, [router]);

  // Screen polos, tanpa chrome publik sama sekali — langsung pindah ke /new.
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-border-paper border-t-primary" />
        <p className="font-mono text-xs text-ink-faint">Membuka form…</p>
      </div>
    </div>
  );
}
