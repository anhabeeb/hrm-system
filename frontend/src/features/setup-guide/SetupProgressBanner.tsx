import type { SetupGuideProgress } from "./setupGuide.types";

export const SetupProgressBanner = ({ progress }: { progress: SetupGuideProgress }) => (
  <div className="mt-4 grid gap-3 md:grid-cols-4">
    <div className="rounded-md border bg-slate-50 p-3">
      <p className="text-xs text-muted-foreground">Required progress</p>
      <p className="text-lg font-semibold">{progress.setup_wizard_completed_steps_count}/{progress.setup_wizard_required_steps_count}</p>
    </div>
    <div className="rounded-md border bg-slate-50 p-3">
      <p className="text-xs text-muted-foreground">Remaining</p>
      <p className="text-lg font-semibold">{progress.remaining_required_steps_count}</p>
    </div>
    <div className="rounded-md border bg-slate-50 p-3">
      <p className="text-xs text-muted-foreground">Disabled by choice</p>
      <p className="text-lg font-semibold">{progress.disabled_modules_by_choice_count}</p>
    </div>
    <div className="rounded-md border bg-slate-50 p-3">
      <p className="text-xs text-muted-foreground">Needs setup after enable</p>
      <p className="text-lg font-semibold">{progress.needs_setup_after_enable_count}</p>
    </div>
  </div>
);
