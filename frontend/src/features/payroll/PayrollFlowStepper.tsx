import { CheckCircle2, Circle, LockKeyhole } from "lucide-react";

import { cn } from "@/lib/utils";

const steps = ["Draft", "Review", "Approved", "Locked"];

export const PayrollFlowStepper = ({ status }: { status?: string }) => {
  const normalized = status === "locked" || status === "paid" ? 3 : status === "approved" ? 2 : status === "reviewed" ? 1 : 0;
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap gap-3">
        {steps.map((step, index) => {
          const complete = index <= normalized;
          const Icon = step === "Locked" ? LockKeyhole : complete ? CheckCircle2 : Circle;
          return (
            <div key={step} className={cn("flex items-center gap-2 rounded-full border px-3 py-1 text-sm", complete ? "border-primary/30 bg-primary/5 text-primary" : "text-muted-foreground")}>
              <Icon className="h-4 w-4" />
              {step}
            </div>
          );
        })}
      </div>
    </div>
  );
};
