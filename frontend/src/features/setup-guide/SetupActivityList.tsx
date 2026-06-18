import { CheckCircle2, Circle, PauseCircle, RotateCcw, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { SetupGuideActivity } from "./setupGuide.types";

const statusLabel: Record<SetupGuideActivity["activity_status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Complete",
  skipped: "Skipped",
  disabled_by_choice: "Disabled by choice",
  blocked_by_dependency: "Blocked",
  needs_attention: "Needs attention",
  needs_setup_after_enable: "Needs setup",
  review_recommended: "Review recommended",
};

const statusIcon = (activity: SetupGuideActivity) => {
  if (activity.activity_status === "completed") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (activity.activity_status === "disabled_by_choice") return <PauseCircle className="h-4 w-4 text-slate-500" />;
  if (activity.activity_status === "needs_setup_after_enable" || activity.activity_status === "needs_attention") return <XCircle className="h-4 w-4 text-amber-600" />;
  if (activity.activity_status === "review_recommended") return <RotateCcw className="h-4 w-4 text-blue-600" />;
  return <Circle className="h-4 w-4 text-muted-foreground" />;
};

export const SetupActivityList = ({
  activities,
  selectedKey,
  onSelect,
}: {
  activities: SetupGuideActivity[];
  selectedKey: string;
  onSelect: (activityKey: string) => void;
}) => (
  <div className="space-y-2">
    {activities.map((activity) => (
      <Button
        key={activity.activity_key}
        type="button"
        variant={activity.activity_key === selectedKey ? "secondary" : "ghost"}
        className="h-auto w-full justify-start px-3 py-2 text-left"
        onClick={() => onSelect(activity.activity_key)}
      >
        <span className="mr-2 mt-0.5 shrink-0">{statusIcon(activity)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{activity.activity_label}</span>
          <span className="mt-1 flex flex-wrap gap-1">
            <Badge variant={activity.is_counted_required ? "default" : "secondary"}>{activity.is_counted_required ? "Required" : "Optional"}</Badge>
            <Badge variant="outline">{statusLabel[activity.activity_status]}</Badge>
          </span>
        </span>
      </Button>
    ))}
  </div>
);
