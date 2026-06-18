CREATE TABLE IF NOT EXISTS setup_guide_progress (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  setup_wizard_completed INTEGER NOT NULL DEFAULT 0,
  setup_wizard_completed_at TEXT,
  setup_wizard_completed_by TEXT,
  setup_wizard_skipped_at TEXT,
  setup_wizard_last_step TEXT,
  setup_wizard_progress_percent INTEGER NOT NULL DEFAULT 0,
  setup_wizard_required_steps_count INTEGER NOT NULL DEFAULT 0,
  setup_wizard_completed_steps_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id)
);

CREATE INDEX IF NOT EXISTS idx_setup_guide_progress_company
  ON setup_guide_progress(company_id);

CREATE TABLE IF NOT EXISTS setup_guide_activities (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  activity_key TEXT NOT NULL,
  module_key TEXT,
  activity_label TEXT NOT NULL,
  activity_status TEXT NOT NULL DEFAULT 'not_started',
  activity_required INTEGER NOT NULL DEFAULT 1,
  activity_completed_at TEXT,
  activity_completed_by TEXT,
  activity_skipped_at TEXT,
  activity_skip_reason TEXT,
  target_route TEXT,
  target_highlight_key TEXT,
  completion_source TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, activity_key)
);

CREATE INDEX IF NOT EXISTS idx_setup_guide_activities_company_status
  ON setup_guide_activities(company_id, activity_status);

CREATE INDEX IF NOT EXISTS idx_setup_guide_activities_company_module
  ON setup_guide_activities(company_id, module_key);
