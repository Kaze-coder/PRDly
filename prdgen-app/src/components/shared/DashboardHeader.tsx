'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Plus, LogOut } from 'lucide-react';
import { MobileNav } from '@/components/shared/MobileNav';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Logo } from '@/components/shared/Logo';

export function DashboardHeader({ email, avatarUrl }: { email?: string; avatarUrl?: string | null }) {
  const initial = (email?.[0] ?? '?').toUpperCase();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border-paper bg-paper px-4 sm:px-6">
      {/* Mobile nav trigger */}
      <MobileNav />

      {/* Logo */}
      <Link href="/dashboard" className="flex items-center lg:hidden">
        <Logo size={32} />
      </Link>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        <ThemeToggle />
        <Link
          href="/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">Perencanaan Baru</span>
        </Link>

        {/* User + logout */}
        <div className="flex items-center gap-2 border-l border-border-paper pl-3">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={email ?? 'Avatar'}
              title={email}
              width={32}
              height={32}
              className="size-8 shrink-0 rounded-full object-cover"
              referrerPolicy="no-referrer"
              unoptimized
            />
          ) : (
            <span
              title={email}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-xs font-semibold text-accent"
            >
              {initial}
            </span>
          )}
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              title="Keluar"
              aria-label="Keluar"
              className="flex size-8 items-center justify-center rounded-md text-ink-dim transition-colors hover:bg-muted hover:text-ink"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
