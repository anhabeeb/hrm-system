import { ArrowRight, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import type { SetupGuideActivity } from "./setupGuide.types";

export const SetupStepPanel = ({
  activity,
  onStart,
  onComplete,
  onSkip,
  onRecalculate,
  loading,
}: {
  activity: SetupGuideActivity;
  onStart: (activityKey: string) => void;
  onComplete: (activityKey: string, reason?: string) => void;
  onSkip: (activityKey: string, reason: string) => void;
  onRecalculate: () => void;
  loading: boolean;
}) => {
  const navigate = useNavigate();
  const [skipReason, setSkipReason] = useState("");
  const disabled = activity.activity_status === "disabled_by_choice";
  const completed = activity.activity_status === "completed";

  return (
    <section className="min-w-0 rounded-lg border bg-card p-5 shadow-sm" data-setup-target={activity.target_highlight_key}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {activity.module_key ? `Module: ${activity.module_key.replace(/_/g, " ")}` : "Core setup"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{activity.guide_title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{activity.guide_description}</p>
        </div>
        {completed ? (
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Complete
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <InlineAlert title="Recommended choice">{activity.recommended_choice}</InlineAlert>
        <InlineAlert title="Completion condition">{activity.completion_condition}</InlineAlert>
      </div>

      {activity.activity_key === "feature_modules" ? (
        <div className="mt-4">
          <InlineAlert title="Feature module choices">
            Enabled modules add setup tasks to this checklist. Disabled modules are saved as disabled by choice and do not count as incomplete. If a Super Admin enables a never-configured module later, only that module's setup tasks reopen.
          </InlineAlert>
        </div>
      ) : null}

      {disabled ? (
        <div className="mt-4">
          <InlineAlert title="Module disabled by choice">
            This module is not counted as incomplete. If you enable it later, setup will reopen only the relevant module steps.
          </InlineAlert>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" onClick={() => { onStart(activity.activity_key); navigate(activity.target_route); }} disabled={loading || disabled}>
          <ExternalLink className="h-4 w-4" />
          Open real app page
        </Button>
        <Button type="button" variant="outline" onClick={() => onComplete(activity.activity_key)} disabled={loading || disabled || completed}>
          <CheckCircle2 className="h-4 w-4" />
          Mark complete
        </Button>
        <Button type="button" variant="outline" onClick={onRecalculate} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
          Recalculate
        </Button>
      </div>

      {!completed && !disabled ? (
        <div className="mt-5 rounded-lg border bg-slate-50/70 p-4">
          <label htmlFor={`${activity.activity_key}-skip`} className="text-sm font-medium">
            Skip reason
          </label>
          <Textarea
            id={`${activity.activity_key}-skip`}
            className="mt-2"
            value={skipReason}
            onChange={(event) => setSkipReason(event.target.value)}
            placeholder="Example: Save for later; this step remains incomplete until configured."
          />
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            disabled={loading || skipReason.trim().length < 3}
            onClick={() => onSkip(activity.activity_key, skipReason.trim())}
          >
            Skip for now
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </section>
  );
};
