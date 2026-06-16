import { Link } from "react-router-dom";
import { CalendarDays, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SelfDashboard } from "../self-service.types";

export const SelfServiceCommandHeader = ({ dashboard }: { dashboard: SelfDashboard }) => {
  const employee = dashboard.employee ?? dashboard.profile.employee;
  const header = dashboard.header;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{header?.today ?? new Date().toISOString().slice(0, 10)}</p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">Good day, {header?.greeting_name ?? employee?.full_name ?? "Employee"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[employee?.department_name, employee?.position_title, employee?.level ? `Level ${employee.level}` : null].filter(Boolean).join(" · ") || "Employee self-service"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {header?.today_status ? <Badge variant="outline">Today: {header.today_status}</Badge> : null}
            {header?.current_shift ? <Badge variant="outline">Shift: {header.current_shift.start_time ?? "-"} - {header.current_shift.end_time ?? "-"}</Badge> : null}
            {header?.payroll_period ? <Badge variant="outline">Payroll: {header.payroll_period.start_date} - {header.payroll_period.end_date}</Badge> : null}
          </div>
        </div>
        {dashboard.quick_actions?.length ? (
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {dashboard.quick_actions.slice(0, 5).map((action) => (
              <Button key={action.key} asChild size="sm" variant={action.key === "attendance-calendar" ? "default" : "outline"}>
                <Link to={action.href}>
                  {action.key === "attendance-calendar" ? <CalendarDays className="h-4 w-4" /> : null}
                  {action.label}
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
};
