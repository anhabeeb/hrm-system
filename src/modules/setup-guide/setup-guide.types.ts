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

export interface SetupActivityDefinition {
  activity_key: string;
  module_key: string | null;
  activity_label: string;
  activity_required: boolean;
  target_route: string;
  target_page_title: string;
  target_highlight_key: string;
  guide_title: string;
  guide_description: string;
  recommended_choice: string;
  completion_condition: string;
}

export interface SetupGuideProgressRecord {
  id: string;
  company_id: string;
  setup_wizard_completed: number;
  setup_wizard_completed_at: string | null;
  setup_wizard_completed_by: string | null;
  setup_wizard_skipped_at: string | null;
  setup_wizard_last_step: string | null;
  setup_wizard_progress_percent: number;
  setup_wizard_required_steps_count: number;
  setup_wizard_completed_steps_count: number;
  created_at: string;
  updated_at: string;
}

export interface SetupGuideActivityRecord {
  id: string;
  company_id: string;
  activity_key: string;
  module_key: string | null;
  activity_label: string;
  activity_status: SetupActivityStatus;
  activity_required: number;
  activity_completed_at: string | null;
  activity_completed_by: string | null;
  activity_skipped_at: string | null;
  activity_skip_reason: string | null;
  target_route: string | null;
  target_highlight_key: string | null;
  completion_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface SetupGuideActivity extends SetupActivityDefinition {
  activity_status: SetupActivityStatus;
  activity_required: boolean;
  activity_completed_at: string | null;
  activity_completed_by: string | null;
  activity_skipped_at: string | null;
  activity_skip_reason: string | null;
  completion_source: string | null;
  is_counted_required: boolean;
}

export interface SetupGuideStatus {
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
  progress: SetupGuideStatus;
  activities: SetupGuideActivity[];
}
