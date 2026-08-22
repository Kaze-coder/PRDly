'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/shared/ThemeProvider';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const isDark = resolved === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
      onClick={toggle}
      className={cn(
        'group relative inline-flex size-9 items-center justify-center rounded-md border border-border-paper bg-paper-raised text-ink-dim transition-colors hover:border-ink-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-paper',
        className
      )}
    >
      <Sun
        className={cn(
          'absolute size-4 transition-all duration-300',
          isDark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'
        )}
      />
      <Moon
        className={cn(
          'absolute size-4 transition-all duration-300',
          isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0'
        )}
      />
    </button>
  );
}
