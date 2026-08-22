import { Skeleton } from '@/components/ui/skeleton';

/** Skeleton for the workspace while the streaming chunk is loading. */
export default function WorkspaceLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-border-paper bg-paper px-4 py-2.5">
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="h-5 w-48" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="flex-1 bg-paper-raised p-8">
        <Skeleton className="h-full w-full rounded-md" />
      </div>
    </div>
  );
}
