import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="stagger-reveal stagger-1 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Skeleton className="h-24 rounded-md" />
        <Skeleton className="h-24 rounded-md" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-full max-w-xs" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-md" />
        ))}
      </div>
    </div>
  );
}
