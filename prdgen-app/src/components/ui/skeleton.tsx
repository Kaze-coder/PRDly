export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-ink/8 ${className}`} aria-hidden="true" />
  );
}
