import { MODULE_LIFECYCLE_METADATA } from "../settings/settings.constants";
import * as settingsService from "../settings/settings.service";
import { createAuditLog } from "../../services/audit.service";
import { hasAnyPermission } from "../../services/permission.service";
import type { AuthActor } from "../../types/api.types";
import { NotFoundError, PermissionError, ValidationError } from "../../utils/errors";

import {
  SETUP_GUIDE_ACTIVITIES,
  SETUP_GUIDE_MODULE_KEYS,
} from "./setup-guide.registry";
import * as repository from "./setup-guide.repository";
import type {
  SetupActivityDefinition,
  SetupActivityStatus,
  SetupGuideActivity,
  SetupGuideActivityRecord,
  SetupGuideOverview,
  SetupGuideStatus,
} from "./setup-guide.types";

const MANAGEMENT_PERMISSIONS = ["setup_guide.manage", "settings.manage", "feature_settings.manage"];
const VIEW_PERMISSIONS = ["setup_guide.view", "settings.view", ...MANAGEMENT_PERMISSIONS];

const nowIso = () => new Date().toISOString();

const assertCanView = (actor: AuthActor) => {
  if (!hasAnyPermission(actor, VIEW_PERMISSIONS)) {
    throw new PermissionError("You do not have permission to view setup progress.");
  }
};

const assertCanManage = (actor: AuthActor) => {
  if (!hasAnyPermission(actor, MANAGEMENT_PERMISSIONS)) {
    throw new PermissionError("You do not have permission to manage setup progress.");
  }
};

const auditSetup = async (
  env: Env,
  actor: AuthActor,
  input: { action: string; entityId?: string; reason?: string },
) => {
  await createAuditLog(env, {
    companyId: actor.companyId,
    action: input.action,
    module: "setup_guide",
    entityType: "setup_activity",
    entityId: input.entityId,
    actorId: actor.actorUserId,
    reason: input.reason,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    requestId: actor.requestId,
  }).catch(() => undefined);
};

const isEnabled = (enabledFeatures: Set<string>, moduleKey: string | null) => {
  if (!moduleKey) return true;
  if (moduleKey === "employee_management") return enabledFeatures.has("employee_management");
  if (moduleKey === "notifications") return enabledFeatures.has("notifications");
  if (moduleKey === "approvals") return enabledFeatures.has("approvals");
  if (moduleKey === "import_export") return enabledFeatures.has("import_export");
  return enabledFeatures.has(moduleKey);
};

const moduleKnown = (moduleKey: string | null) =>
  Boolean(moduleKey && SETUP_GUIDE_MODULE_KEYS.has(moduleKey));

const definitionByKey = new Map(SETUP_GUIDE_ACTIVITIES.map((activity) => [activity.activity_key, activity]));

const safeAutoComplete = async (
  env: Env,
  companyId: string,
  definition: SetupActivityDefinition,
): Promise<boolean> => {
  switch (definition.activity_key) {
    case "company_profile":
      return (await repository.countRows(
        env,
        "SELECT COUNT(*) AS count FROM companies WHERE id = ? AND deleted_at IS NULL AND company_name IS NOT NULL AND timezone IS NOT NULL AND currency IS NOT NULL",
        [companyId],
      )) > 0;
    case "outlets":
      return (await repository.countRows(
        env,
        "SELECT COUNT(*) AS count FROM outlets WHERE company_id = ? AND deleted_at IS NULL",
        [companyId],
      )) > 0;
    case "hr_department":
      return (await repository.countRows(
        env,
        "SELECT COUNT(*) AS count FROM departments WHERE company_id = ? AND deleted_at IS NULL AND (LOWER(department_name) LIKE '%hr%' OR LOWER(department_code) LIKE '%hr%')",
        [companyId],
      )) > 0;
    case "core_departments":
      return (await repository.countRows(
        env,
        "SELECT COUNT(*) AS count FROM departments WHERE company_id = ? AND deleted_at IS NULL",
        [companyId],
      )) > 0;
    case "positions":
      return (await repository.countRows(
        env,
        "SELECT COUNT(*) AS count FROM positions WHERE company_id = ? AND deleted_at IS NULL",
        [companyId],
      )) > 0;
    case "job_levels":
      return (await repository.countRows(
        env,
        "SELECT COUNT(*) AS count FROM level_role_templates WHERE company_id = ? AND deleted_at IS NULL",
        [companyId],
      )) > 0;
    case "shift_templates":
      return (await repository.countRows(
        env,
        "SELECT COUNT(*) AS count FROM shift_templates WHERE company_id = ? AND deleted_at IS NULL",
        [companyId],
      )) > 0;
    case "employee_numbering":
      return (await repository.countRows(
        env,
        "SELECT COUNT(*) AS count FROM company_settings WHERE company_id = ? AND setting_key LIKE '%employee%number%'",
        [companyId],
      )) > 0;
    default:
      if (definition.target_route.includes("/settings")) {
        const moduleKey = definition.module_key;
        const groupHint =
          moduleKey === "payroll" ? "payroll" :
          moduleKey === "attendance" || moduleKey === "roster" ? "attendance" :
          moduleKey === "leave_management" || moduleKey === "long_leave_management" ? "leave" :
          moduleKey === "documents" || moduleKey === "contract_tracking" ? "documents" :
          definition.activity_key.includes("backup") ? "backup_recovery" :
          definition.activity_key.includes("notification") ? "notifications" :
          definition.activity_key.includes("import") ? "import_export" :
          null;
        if (!groupHint) return false;
        return (await repository.countRows(
          env,
          "SELECT COUNT(*) AS count FROM company_settings WHERE company_id = ? AND setting_group = ?",
          [companyId, groupHint],
        )) > 0;
      }
      return false;
  }
};

const mergeActivity = async (
  env: Env,
  companyId: string,
  definition: SetupActivityDefinition,
  record: SetupGuideActivityRecord | undefined,
  enabledFeatures: Set<string>,
): Promise<SetupGuideActivity> => {
  const storedStatus = record?.activity_status ?? "not_started";
  const moduleEnabled = isEnabled(enabledFeatures, definition.module_key);
  const isModuleActivity = moduleKnown(definition.module_key);
  const wasCompleted = Boolean(record?.activity_completed_at || storedStatus === "completed");
  const autoCompleted = moduleEnabled && await safeAutoComplete(env, companyId, definition);
  let activityStatus: SetupActivityStatus = storedStatus;
  let countedRequired = definition.activity_required;

  if (autoCompleted && storedStatus !== "completed") {
    activityStatus = "completed";
  }

  if (isModuleActivity && !moduleEnabled) {
    activityStatus = "disabled_by_choice";
    countedRequired = false;
  } else if (isModuleActivity && moduleEnabled && storedStatus === "disabled_by_choice") {
    activityStatus = wasCompleted ? "review_recommended" : "needs_setup_after_enable";
    countedRequired = !wasCompleted;
  } else if (activityStatus === "review_recommended") {
    countedRequired = false;
  }

  return {
    ...definition,
    activity_status: activityStatus,
    activity_required: definition.activity_required,
    activity_completed_at: record?.activity_completed_at ?? (autoCompleted ? nowIso() : null),
    activity_completed_by: record?.activity_completed_by ?? null,
    activity_skipped_at: record?.activity_skipped_at ?? null,
    activity_skip_reason: record?.activity_skip_reason ?? null,
    completion_source: autoCompleted ? "auto_detected" : record?.completion_source ?? null,
    is_counted_required: countedRequired,
  };
};

const ensureSeeded = async (env: Env, companyId: string) => {
  await repository.ensureProgress(env, companyId);
  for (const definition of SETUP_GUIDE_ACTIVITIES) {
    await repository.ensureActivity(env, {
      companyId,
      activityKey: definition.activity_key,
      moduleKey: definition.module_key,
      label: definition.activity_label,
      required: definition.activity_required,
      targetRoute: definition.target_route,
      targetHighlightKey: definition.target_highlight_key,
    });
  }
};

const calculateProgress = (activities: SetupGuideActivity[]): SetupGuideStatus => {
  const requiredActivities = activities.filter((activity) => activity.is_counted_required);
  const completedRequired = requiredActivities.filter((activity) => activity.activity_status === "completed");
  const requiredCount = requiredActivities.length;
  const completedCount = completedRequired.length;

  return {
    setup_wizard_completed: requiredCount > 0 && completedCount >= requiredCount,
    setup_wizard_completed_at: null,
    setup_wizard_completed_by: null,
    setup_wizard_skipped_at: null,
    setup_wizard_last_step: null,
    setup_wizard_progress_percent: requiredCount === 0 ? 100 : Math.round((completedCount / requiredCount) * 100),
    setup_wizard_required_steps_count: requiredCount,
    setup_wizard_completed_steps_count: completedCount,
    remaining_required_steps_count: Math.max(requiredCount - completedCount, 0),
    disabled_modules_by_choice_count: new Set(activities.filter((activity) => activity.activity_status === "disabled_by_choice" && activity.module_key).map((activity) => activity.module_key)).size,
    needs_setup_after_enable_count: activities.filter((activity) => activity.activity_status === "needs_setup_after_enable").length,
    review_recommended_count: activities.filter((activity) => activity.activity_status === "review_recommended").length,
  };
};

const loadOverview = async (env: Env, actor: AuthActor): Promise<SetupGuideOverview> => {
  await ensureSeeded(env, actor.companyId);
  const [progressRecord, activityRecords, enabledFeatures] = await Promise.all([
    repository.getProgress(env, actor.companyId),
    repository.listActivities(env, actor.companyId),
    repository.listEnabledFeatureKeys(env, actor.companyId),
  ]);
  const recordsByKey = new Map(activityRecords.map((record) => [record.activity_key, record]));
  const activities = await Promise.all(
    SETUP_GUIDE_ACTIVITIES.map((definition) =>
      mergeActivity(env, actor.companyId, definition, recordsByKey.get(definition.activity_key), enabledFeatures),
    ),
  );
  const calculated = calculateProgress(activities);
  const progress = {
    ...calculated,
    setup_wizard_completed: Boolean(progressRecord?.setup_wizard_completed === 1 || calculated.setup_wizard_completed),
    setup_wizard_completed_at: progressRecord?.setup_wizard_completed_at ?? null,
    setup_wizard_completed_by: progressRecord?.setup_wizard_completed_by ?? null,
    setup_wizard_skipped_at: progressRecord?.setup_wizard_skipped_at ?? null,
    setup_wizard_last_step: progressRecord?.setup_wizard_last_step ?? null,
  };

  await repository.updateProgress(env, actor.companyId, {
    progressPercent: progress.setup_wizard_progress_percent,
    requiredCount: progress.setup_wizard_required_steps_count,
    completedCount: progress.setup_wizard_completed_steps_count,
    lastStep: progress.setup_wizard_last_step,
  }).catch(() => undefined);

  return { progress, activities };
};

export const getStatus = async (env: Env, actor: AuthActor) => {
  assertCanView(actor);
  return (await loadOverview(env, actor)).progress;
};

export const getActivities = async (env: Env, actor: AuthActor) => {
  assertCanView(actor);
  return loadOverview(env, actor);
};

export const updateActivity = async (
  env: Env,
  actor: AuthActor,
  activityKey: string,
  action: "start" | "complete" | "skip" | "resume",
  input: { reason?: string } = {},
) => {
  assertCanManage(actor);
  const definition = definitionByKey.get(activityKey);
  if (!definition) {
    throw new NotFoundError("The requested setup activity could not be found.");
  }

  await ensureSeeded(env, actor.companyId);
  const now = nowIso();
  const status: SetupActivityStatus =
    action === "complete" ? "completed" :
    action === "skip" ? "skipped" :
    "in_progress";
  await repository.updateActivityStatus(env, actor.companyId, activityKey, {
    status,
    completedAt: status === "completed" ? now : null,
    completedBy: status === "completed" ? actor.actorUserId : null,
    skippedAt: status === "skipped" ? now : null,
    skipReason: status === "skipped" ? input.reason ?? "Skipped during setup" : null,
    completionSource: status === "completed" ? "manual" : null,
  });
  await repository.updateProgress(env, actor.companyId, {
    progressPercent: 0,
    requiredCount: 0,
    completedCount: 0,
    lastStep: activityKey,
  }).catch(() => undefined);
  await auditSetup(env, actor, {
    action: `setup_wizard_activity_${action}`,
    entityId: activityKey,
    reason: input.reason,
  });
  return loadOverview(env, actor);
};

export const recalculate = async (env: Env, actor: AuthActor) => {
  assertCanManage(actor);
  const overview = await loadOverview(env, actor);
  await auditSetup(env, actor, { action: "setup_wizard_recalculated" });
  return overview;
};

export const finish = async (env: Env, actor: AuthActor) => {
  assertCanManage(actor);
  const overview = await loadOverview(env, actor);
  if (overview.progress.remaining_required_steps_count > 0) {
    throw new ValidationError("Complete the remaining required setup steps before finishing setup. You can Save & Exit to continue later.");
  }
  const now = nowIso();
  await repository.updateProgress(env, actor.companyId, {
    completed: true,
    completedAt: now,
    completedBy: actor.actorUserId,
    progressPercent: 100,
    requiredCount: overview.progress.setup_wizard_required_steps_count,
    completedCount: overview.progress.setup_wizard_completed_steps_count,
    lastStep: "final_review",
  });
  await auditSetup(env, actor, { action: "setup_wizard_finished", entityId: "final_review" });
  return getStatus(env, actor);
};

export const skipForNow = async (
  env: Env,
  actor: AuthActor,
  input: { reason?: string } = {},
) => {
  assertCanManage(actor);
  const overview = await loadOverview(env, actor);
  await repository.updateProgress(env, actor.companyId, {
    skippedAt: nowIso(),
    progressPercent: overview.progress.setup_wizard_progress_percent,
    requiredCount: overview.progress.setup_wizard_required_steps_count,
    completedCount: overview.progress.setup_wizard_completed_steps_count,
    lastStep: overview.progress.setup_wizard_last_step,
  });
  await auditSetup(env, actor, {
    action: "setup_wizard_skipped_for_now",
    entityId: "setup_wizard",
    reason: input.reason,
  });
  return getStatus(env, actor);
};

export const moduleChoice = async (
  env: Env,
  actor: AuthActor,
  input: { module_key?: string; is_enabled?: boolean; reason?: string; effective_from?: string },
) => {
  assertCanManage(actor);
  const moduleKey = String(input.module_key ?? "");
  if (!MODULE_LIFECYCLE_METADATA[moduleKey]) {
    throw new ValidationError("Please choose a valid setup module.");
  }
  const enabled = input.is_enabled === true;
  await settingsService.updateFeature(env, actor, moduleKey, {
    is_enabled: enabled,
    status: enabled ? "active" : "disabled",
    reason: input.reason ?? (enabled ? "Enabled from setup guide module choice." : "Disabled by choice from setup guide."),
    effective_from: input.effective_from ?? nowIso().slice(0, 10),
  });
  await auditSetup(env, actor, {
    action: enabled ? "setup_wizard_module_enabled_later" : "setup_wizard_module_disabled_by_choice",
    entityId: moduleKey,
    reason: input.reason,
  });
  return recalculate(env, actor);
};
