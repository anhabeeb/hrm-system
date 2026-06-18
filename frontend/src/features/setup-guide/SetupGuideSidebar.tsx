import type { SetupGuideActivity, SetupGuideProgress } from "./setupGuide.types";
import { SetupActivityList } from "./SetupActivityList";

export const SetupGuideSidebar = ({
  progress,
  activities,
  selectedKey,
  onSelect,
}: {
  progress: SetupGuideProgress;
  activities: SetupGuideActivity[];
  selectedKey: string;
  onSelect: (activityKey: string) => void;
}) => (
  <aside className="min-w-0 rounded-lg border bg-card p-4 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Setup checklist</p>
      <h2 className="text-lg font-semibold">{progress.setup_wizard_progress_percent}% complete</h2>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(Math.max(progress.setup_wizard_progress_percent, 0), 100)}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {progress.setup_wizard_completed_steps_count} of {progress.setup_wizard_required_steps_count} required steps completed.
      </p>
    </div>
    <div className="mt-4">
      <SetupActivityList activities={activities} selectedKey={selectedKey} onSelect={onSelect} />
    </div>
  </aside>
);
