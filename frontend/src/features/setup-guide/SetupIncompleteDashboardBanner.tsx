import { useNavigate } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { SetupGuideProgress } from "./setupGuide.types";

export const SetupIncompleteDashboardBanner = ({ progress }: { progress: SetupGuideProgress }) => {
  const navigate = useNavigate();
  if (progress.setup_wizard_completed) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Setup incomplete: {progress.setup_wizard_completed_steps_count} of {progress.setup_wizard_required_steps_count} required steps completed.</p>
            <p className="mt-1 text-sm opacity-90">
              {progress.disabled_modules_by_choice_count} modules disabled by choice.
              {progress.needs_setup_after_enable_count ? ` ${progress.needs_setup_after_enable_count} enabled module steps need setup.` : ""}
              {progress.review_recommended_count ? ` ${progress.review_recommended_count} steps are recommended for review.` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => navigate("/setup-wizard")}>Continue Setup</Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/setup-wizard")}>View Checklist</Button>
        </div>
      </div>
    </div>
  );
};
