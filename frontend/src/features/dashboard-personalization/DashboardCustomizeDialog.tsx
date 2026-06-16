import { useEffect, useState } from "react";

import { useToast } from "@/components/feedback/useToast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { DashboardType, PersonalizedDashboardWidget } from "./dashboardPreferences.types";
import { toDashboardLayout } from "./dashboardPreferences.utils";
import { DashboardResetLayoutButton } from "./DashboardResetLayoutButton";
import { DashboardWidgetListEditor } from "./DashboardWidgetListEditor";

interface DashboardCustomizeDialogProps {
  dashboardType: DashboardType;
  open: boolean;
  widgets: PersonalizedDashboardWidget[];
  isSaving?: boolean;
  isResetting?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (widgets: PersonalizedDashboardWidget[]) => Promise<unknown>;
  onReset: () => Promise<unknown>;
}

const dashboardTitle = (dashboardType: DashboardType) =>
  dashboardType === "ADMIN_COMMAND_CENTER" ? "Admin Command Center" : "Self-Service Dashboard";

export const DashboardCustomizeDialog = ({
  dashboardType,
  open,
  widgets,
  isSaving,
  isResetting,
  onOpenChange,
  onSave,
  onReset,
}: DashboardCustomizeDialogProps) => {
  const toast = useToast();
  const [draftWidgets, setDraftWidgets] = useState(widgets);

  useEffect(() => {
    if (open) setDraftWidgets(widgets);
  }, [open, widgets]);

  const saving = Boolean(isSaving || isResetting);

  const save = async () => {
    try {
      await onSave(draftWidgets);
      toast.success("Dashboard layout saved.");
      onOpenChange(false);
    } catch {
      toast.error("Dashboard preferences could not be saved.");
    }
  };

  const reset = async () => {
    try {
      await onReset();
      toast.success("Dashboard layout reset.");
      onOpenChange(false);
    } catch {
      toast.error("Dashboard layout could not be reset.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Customize {dashboardTitle(dashboardType)}</DialogTitle>
          <DialogDescription>
            Choose which allowed widgets appear on this dashboard and adjust their order. Disabled modules and unauthorized widgets stay hidden.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto pr-1">
          {draftWidgets.length > 0 ? (
            <DashboardWidgetListEditor widgets={draftWidgets} onChange={setDraftWidgets} />
          ) : (
            <div className="rounded-lg border bg-slate-50 px-4 py-8 text-center text-sm text-muted-foreground">
              No dashboard widgets are available for your current permissions.
            </div>
          )}
        </div>

        <DialogFooter className="items-center justify-between gap-2 sm:justify-between">
          <DashboardResetLayoutButton disabled={saving} onReset={reset} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={save}>
              Save changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const saveDashboardWidgetLayout = toDashboardLayout;
