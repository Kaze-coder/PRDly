import { Skeleton } from '@/components/ui/skeleton';

/** Skeleton for the PRD editor — used while the streaming chunk is loading. */
export default function EditorLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top bar skeleton */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border-paper bg-paper px-4 py-2.5">
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="h-5 w-40" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-20" />
      </div>

      {/* Content + chat skeleton */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 space-y-6 bg-paper-raised p-4 sm:p-8">
          <div className="mx-auto max-w-3xl space-y-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-md border border-paper-raised/60 bg-paper-raised p-5 pl-7">
                <Skeleton className="h-6 w-44" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        </div>
        <div className="hidden w-80 shrink-0 flex-col border-l border-border-paper bg-paper lg:flex">
          <div className="flex items-center justify-between border-b border-border-paper px-4 py-2.5">
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex-1 space-y-3 p-3">
            <Skeleton className="h-16 rounded-lg" />
          </div>
          <div className="border-t border-border-paper p-3">
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-border-paper bg-muted px-4 py-2">
        <Skeleton className="h-3 w-56" />
      </div>
    </div>
  );
}
