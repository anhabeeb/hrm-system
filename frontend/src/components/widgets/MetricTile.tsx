import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type MetricStatus = "neutral" | "success" | "warning" | "danger" | "info";

const statusClasses: Record<MetricStatus, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  success: "border-green-200 bg-green-50 text-green-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-red-200 bg-red-50 text-red-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
};

export interface MetricTileProps {
  label: ReactNode;
  value: ReactNode;
  helperText?: ReactNode;
  icon?: ReactNode;
  trend?: ReactNode;
  status?: MetricStatus;
  onClick?: () => void;
  className?: string;
}

export const MetricTile = ({ label, value, helperText, icon, trend, status = "neutral", onClick, className }: MetricTileProps) => {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "w-full rounded-md border p-3 text-left transition-colors",
        statusClasses[status],
        onClick && "hover:border-slate-300 hover:bg-white",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {icon ? <span className="text-current/80">{icon}</span> : null}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="text-xl font-semibold leading-none text-foreground">{value}</span>
        {trend ? <span className="text-xs font-medium">{trend}</span> : null}
      </div>
      {helperText ? <p className="mt-1 text-xs text-muted-foreground">{helperText}</p> : null}
    </Component>
  );
};
