import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { DashboardType, PersonalizedDashboardWidget } from "./dashboardPreferences.types";
import { toDashboardLayout } from "./dashboardPreferences.utils";
import { DashboardCustomizeDialog } from "./DashboardCustomizeDialog";

interface DashboardCustomizeButtonProps {
  dashboardType: DashboardType;
  widgets: PersonalizedDashboardWidget[];
  isSaving?: boolean;
  isResetting?: boolean;
  onSaveLayout: (layout: ReturnType<typeof toDashboardLayout>) => Promise<unknown>;
  onResetLayout: () => Promise<unknown>;
}

export const DashboardCustomizeButton = ({
  dashboardType,
  widgets,
  isSaving,
  isResetting,
  onSaveLayout,
  onResetLayout,
}: DashboardCustomizeButtonProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="h-4 w-4" />
        Customize
      </Button>
      <DashboardCustomizeDialog
        dashboardType={dashboardType}
        open={open}
        widgets={widgets}
        isSaving={isSaving}
        isResetting={isResetting}
        onOpenChange={setOpen}
        onSave={(nextWidgets) => onSaveLayout(toDashboardLayout(nextWidgets))}
        onReset={onResetLayout}
      />
    </>
  );
};
