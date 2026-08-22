import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Brand mark — PRDly icon (500×500 PNG from /public) + "PRDly" wordmark.
 * `size` controls the icon; the wordmark scales with it.
 */
export function Logo({
  className,
  size = 28,
  showWordmark = true,
}: {
  className?: string;
  size?: number;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Image
        src="/PRDly-Logo.png"
        alt="PRDly"
        width={size}
        height={size}
        priority
        className="shrink-0 select-none"
        style={{ width: size, height: size }}
      />
      {showWordmark && (
        <span
          className="font-heading font-bold tracking-tight text-ink"
          style={{ fontSize: Math.max(size * 0.62, 15) }}
        >
          PRDly
        </span>
      )}
    </span>
  );
}
