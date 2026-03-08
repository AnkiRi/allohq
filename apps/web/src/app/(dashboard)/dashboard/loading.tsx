import { SkeletonCard } from "@/components/ui/SkeletonCard";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded bg-warm-cream-200" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SkeletonCard rows={2} />
        <SkeletonCard rows={2} />
        <SkeletonCard rows={2} />
        <SkeletonCard rows={2} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SkeletonCard rows={5} />
        <SkeletonCard rows={5} />
      </div>
    </div>
  );
}
