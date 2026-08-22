import Link from 'next/link';
import { Logo } from '@/components/shared/Logo';

export function Footer() {
  return (
    <footer className="border-t border-border bg-paper-raised text-ink border-border-paper">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-8 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center">
          <Logo size={28} />
        </div>

        <nav className="flex gap-6 text-sm text-ink-dim">
          <Link href="/" className="transition-colors hover:text-ink">
            Buat PRD
          </Link>
          <Link href="/dashboard" className="transition-colors hover:text-ink">
            PRD Saya
          </Link>
          <Link href="/blog" className="transition-colors hover:text-ink">
            Blog
          </Link>
        </nav>

        <p className="text-xs text-ink-faint">
          &copy; {new Date().getFullYear()} PRDly. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
