import { TriangleAlert } from "lucide-react";

import type { SetupWarning } from "./operation-ownership.types";

export const SetupWarningsPanel = ({ warnings }: { warnings: SetupWarning[] }) => (
  <div className="table-surface divide-y">
    {warnings.map((warning) => (
      <div key={`${warning.code}-${warning.operation_code ?? warning.business_function_code ?? warning.message}`} className="flex items-start gap-3 p-3 text-sm">
        <TriangleAlert className={warning.severity === "critical" ? "mt-0.5 h-4 w-4 text-destructive" : "mt-0.5 h-4 w-4 text-amber-600"} />
        <div>
          <div className="font-medium">{warning.code}</div>
          <div className="text-muted-foreground">{warning.message}</div>
        </div>
      </div>
    ))}
  </div>
);
