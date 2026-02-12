import { Skeleton } from "@/components/ui/skeleton";

export default function ListingsLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Search Bar Skeleton */}
      <div className="flex items-center gap-3 mb-6">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-10" />
      </div>

      {/* Toolbar Skeleton */}
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-4 w-32" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-[200px]" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>

      {/* Grid Skeleton */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-[4/3] w-full rounded-xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
