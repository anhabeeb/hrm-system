import { Skeleton } from "@/components/ui/skeleton";

export const LoadingState = ({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-2 p-4">
    {Array.from({ length: rows }).map((_, index) => (
      <Skeleton key={index} className="h-9 w-full" />
    ))}
  </div>
);
