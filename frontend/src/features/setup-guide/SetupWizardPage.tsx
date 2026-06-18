import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { RefreshCw, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/data/EmptyState";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth.store";

import { SetupGuideSidebar } from "./SetupGuideSidebar";
import { SetupProgressBanner } from "./SetupProgressBanner";
import { SetupStepPanel } from "./SetupStepPanel";
import { useSetupGuide } from "./useSetupGuide";

export const SetupWizardPage = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const setup = useSetupGuide();
  const activities = setup.overview?.activities ?? [];
  const progress = setup.overview?.progress;
  const [selectedKey, setSelectedKey] = useState<string>("");
  const canManage = auth.isSuperAdmin || auth.hasAnyPermission(["setup_guide.manage", "settings.manage"]);

  useEffect(() => {
    if (!selectedKey && activities.length) {
      const next = activities.find((activity) => activity.is_counted_required && activity.activity_status !== "completed") ?? activities[0];
      setSelectedKey(next.activity_key);
    }
  }, [activities, selectedKey]);

  const selectedActivity = useMemo(
    () => activities.find((activity) => activity.activity_key === selectedKey) ?? activities[0],
    [activities, selectedKey],
  );

  if (!canManage) {
    return (
      <div className="p-4 md:p-6">
        <div className="rounded-lg border bg-card">
          <EmptyState
            title="Setup guide is restricted."
            description="Only Super Admins or authorized settings users can manage the post-bootstrap setup guide."
            icon={<ShieldAlert className="h-8 w-8" />}
          />
        </div>
      </div>
    );
  }

  if (setup.isLoading || !progress || !selectedActivity) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <div className="rounded-lg border bg-card p-5">
          <p className="text-sm text-muted-foreground">Loading setup guide...</p>
        </div>
      </div>
    );
  }

  if (progress.setup_wizard_completed) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-full bg-slate-50/60">
      <div className="space-y-4 p-4 md:p-6">
        <div className="rounded-lg border bg-card p-5 shadow-sm" data-setup-target="final-review">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Interactive post-bootstrap setup</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Setup Guide</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Configure the core HRM foundation first, then complete only the modules that are enabled for Café Asiana.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setup.recalculate.mutate()} disabled={setup.recalculate.isPending}>
                <RefreshCw className="h-4 w-4" />
                Recalculate
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setup.skipForNow.mutate("Saved and exited during setup", { onSuccess: () => navigate("/dashboard") })}
                disabled={setup.skipForNow.isPending}
              >
                Save & Exit
              </Button>
              <Button type="button" onClick={() => setup.finish.mutate()} disabled={setup.finish.isPending || progress.remaining_required_steps_count > 0}>
                Finish setup
              </Button>
            </div>
          </div>
          <SetupProgressBanner progress={progress} />
          {progress.remaining_required_steps_count > 0 ? (
            <div className="mt-4">
              <InlineAlert title="Setup is still incomplete">
                Disabled modules are excluded from required progress. Enabled modules and core company setup remain required.
              </InlineAlert>
            </div>
          ) : null}
        </div>

        <div className="grid min-w-0 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <SetupGuideSidebar
            progress={progress}
            activities={activities}
            selectedKey={selectedActivity.activity_key}
            onSelect={setSelectedKey}
          />
          <SetupStepPanel
            activity={selectedActivity}
            loading={setup.complete.isPending || setup.skip.isPending || setup.start.isPending || setup.recalculate.isPending}
            onStart={(activityKey) => setup.start.mutate(activityKey)}
            onComplete={(activityKey, reason) => setup.complete.mutate({ activityKey, reason })}
            onSkip={(activityKey, reason) => setup.skip.mutate({ activityKey, reason })}
            onRecalculate={() => setup.recalculate.mutate()}
          />
        </div>
      </div>
    </div>
  );
};
