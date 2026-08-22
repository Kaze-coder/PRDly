'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Logo } from '@/components/shared/Logo';

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-paper/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <Logo size={32} />
        </Link>

        {/* Nav links */}
        <nav className="hidden items-center gap-6 text-sm font-medium text-ink-dim md:flex">
          <Link href="/dashboard" className="transition-colors hover:text-ink">
            PRD Saya
          </Link>
          <Link href="/blog" className="transition-colors hover:text-ink">
            Blog
          </Link>
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/new">
            <Button>Buat PRD</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
