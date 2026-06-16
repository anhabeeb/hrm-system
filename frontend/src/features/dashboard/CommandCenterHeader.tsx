import { Link } from "react-router-dom";
import { CalendarDays, ClipboardCheck, Users } from "lucide-react";

import { MetricTile, StatusStrip } from "@/components/widgets";
import { Button } from "@/components/ui/button";

import type { CommandCenterResponse } from "./commandCenter.types";

export const CommandCenterHeader = ({ header }: { header: CommandCenterResponse["header"] }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p className="text-sm text-muted-foreground">{header.today}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Welcome back, {header.greeting_name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {header.company_name ?? "HRM Command Center"}
          {header.outlet_name ? ` - ${header.outlet_name}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {header.quick_actions.slice(0, 6).map((action) => (
          <Button key={action.key} asChild size="sm" variant="outline">
            <Link to={action.href}>{action.label}</Link>
          </Button>
        ))}
      </div>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      <MetricTile label="Present Today" value={header.summary.present_today} icon={<Users className="h-4 w-4" />} status="success" />
      <MetricTile label="Absent Today" value={header.summary.absent_today} icon={<CalendarDays className="h-4 w-4" />} status={header.summary.absent_today > 0 ? "warning" : "neutral"} />
      <MetricTile label="Pending Approvals" value={header.summary.pending_approvals} icon={<ClipboardCheck className="h-4 w-4" />} status={header.summary.pending_approvals > 0 ? "info" : "neutral"} helperText={header.summary.payroll_status ? `Payroll: ${header.summary.payroll_status}` : "Payroll status unavailable"} />
    </div>
    <StatusStrip
      className="mt-3"
      compact
      items={[
        { label: "Present", value: header.summary.present_today, status: "success" },
        { label: "Absent", value: header.summary.absent_today, status: header.summary.absent_today > 0 ? "warning" : "neutral" },
        { label: "Approvals", value: header.summary.pending_approvals, status: header.summary.pending_approvals > 0 ? "info" : "neutral" },
        { label: "Payroll", value: header.summary.payroll_status ?? "N/A", status: header.summary.payroll_status === "Ready" ? "success" : "warning" },
      ]}
    />
  </section>
);
