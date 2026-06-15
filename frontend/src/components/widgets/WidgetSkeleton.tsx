import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const WidgetSkeleton = ({ className, rows = 3 }: { className?: string; rows?: number }) => (
  <div className={cn("space-y-2", className)}>
    <Skeleton className="h-5 w-1/2" />
    {Array.from({ length: rows }).map((_, index) => (
      <Skeleton key={index} className="h-8 w-full" />
    ))}
  </div>
);
