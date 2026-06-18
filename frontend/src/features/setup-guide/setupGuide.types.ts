export type SetupActivityStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "skipped"
  | "disabled_by_choice"
  | "blocked_by_dependency"
  | "needs_attention"
  | "needs_setup_after_enable"
  | "review_recommended";

export interface SetupGuideActivity {
  activity_key: string;
  module_key: string | null;
  activity_label: string;
  activity_status: SetupActivityStatus;
  activity_required: boolean;
  is_counted_required: boolean;
  activity_completed_at: string | null;
  activity_completed_by: string | null;
  activity_skipped_at: string | null;
  activity_skip_reason: string | null;
  target_route: string;
  target_page_title: string;
  target_highlight_key: string;
  guide_title: string;
  guide_description: string;
  recommended_choice: string;
  completion_condition: string;
  completion_source: string | null;
}

export interface SetupGuideProgress {
  setup_wizard_completed: boolean;
  setup_wizard_completed_at: string | null;
  setup_wizard_completed_by: string | null;
  setup_wizard_skipped_at: string | null;
  setup_wizard_last_step: string | null;
  setup_wizard_progress_percent: number;
  setup_wizard_required_steps_count: number;
  setup_wizard_completed_steps_count: number;
  remaining_required_steps_count: number;
  disabled_modules_by_choice_count: number;
  needs_setup_after_enable_count: number;
  review_recommended_count: number;
}

export interface SetupGuideOverview {
  progress: SetupGuideProgress;
  activities: SetupGuideActivity[];
}
