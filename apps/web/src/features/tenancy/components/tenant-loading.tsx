import { Skeleton } from "@/components/ui/skeleton";

export function TenantLoading() {
  return (
    <div
      aria-busy="true"
      className="mx-auto my-12 max-w-md space-y-5 rounded-xl border bg-card p-6"
    >
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
