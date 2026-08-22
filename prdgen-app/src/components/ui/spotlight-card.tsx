'use client';

import { useRef, type PointerEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
}

/**
 * Wraps content in a card that tracks the pointer via `--mx`/`--my` CSS vars,
 * powering the `.card-spot` green radial spotlight + lift defined in globals.css.
 */
export function SpotlightCard({ children, className }: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  }

  return (
    <div ref={ref} onPointerMove={handlePointerMove} className={cn('card-spot', className)}>
      {children}
    </div>
  );
}
