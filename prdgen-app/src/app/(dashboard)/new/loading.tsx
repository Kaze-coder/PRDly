import { Skeleton } from '@/components/ui/skeleton';

export default function NewPageLoading() {
  return (
    <div className="min-h-screen bg-paper">
      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-12 flex items-center gap-4">
          <Skeleton className="size-9 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-72" />
          </div>
        </div>
        <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
          <div className="space-y-10">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-md border border-paper-raised/60 bg-paper-raised p-7 pl-9 space-y-5">
                <div className="flex items-baseline gap-3">
                  <Skeleton className="h-6 w-8 font-mono font-light" />
                  <div className="space-y-1 pt-0.5">
                    <Skeleton className="h-6 w-44" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
                <div className="space-y-4 pt-2">
                  <Skeleton className="h-11 w-full" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-11 w-full" />
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-6">
            <Skeleton className="h-80 w-full rounded-md" />
            <Skeleton className="h-12 w-full rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
