import { SkeletonTable } from "@/components/ui/SkeletonCard";

export default function CustomersLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded bg-warm-cream-200" />
      <SkeletonTable rows={8} cols={5} />
    </div>
  );
}
