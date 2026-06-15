import { cn } from "@/lib/utils";

import { WidgetCard, type WidgetCardProps } from "./WidgetCard";

export interface MiniCalendarDay {
  date: string;
  label: string;
  status?: "neutral" | "success" | "warning" | "danger" | "info";
}

const statusClasses = {
  neutral: "border-slate-200 bg-white",
  success: "border-green-200 bg-green-50",
  warning: "border-amber-200 bg-amber-50",
  danger: "border-red-200 bg-red-50",
  info: "border-sky-200 bg-sky-50",
};

export const MiniCalendarWidget = ({ days, ...props }: Omit<WidgetCardProps, "children"> & { days: MiniCalendarDay[] }) => (
  <WidgetCard {...props}>
    <div className="grid grid-cols-7 gap-1">
      {days.map((day) => (
        <div key={day.date} className={cn("min-h-14 rounded-md border p-1.5 text-xs", statusClasses[day.status ?? "neutral"])}>
          <div className="font-semibold text-foreground">{day.label}</div>
          <div className="mt-1 truncate text-[11px] text-muted-foreground">{day.date}</div>
        </div>
      ))}
    </div>
  </WidgetCard>
);
