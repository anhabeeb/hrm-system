import type { Context } from "hono";

import * as settingsService from "./settings.service";
import {
  validateApprovalSettingsInput,
  validateApprovalThresholdFilters,
  validateApprovalThresholdInput,
  validateBulkUpdateFeaturesInput,
  validateChangeLogFilters,
  validateFeatureKey,
  validateSettingsGroup,
  validateUpdateFeatureInput,
  validateUpdateSettingsGroupInput,
} from "./settings.validators";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { ok } from "../../utils/response";

const readJson = async (c: Context<AppContext>): Promise<unknown> =>
  c.req.json().catch(() => ({}));

const requiredParam = (c: Context<AppContext>, name: string): string => {
  const value = c.req.param(name);

  if (!value) {
    throw new ValidationError("Please choose a valid settings item.");
  }

  return value;
};

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");

  if (!authUser) {
    throw new AuthError("Please sign in to continue.");
  }

  return authUser;
};

export const getAllSettings = async (c: Context<AppContext>) =>
  ok(
    await settingsService.getAllSettings(c.env, actor(c)),
    "Settings loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const getSettingsGroup = async (c: Context<AppContext>) => {
  const group = validateSettingsGroup(requiredParam(c, "group"));
  const data = await settingsService.getSettingsGroup(c.env, actor(c), group);

  return ok(
    data,
    data.settings.length === 0
      ? "No settings found for this group yet."
      : "Settings loaded successfully.",
    { requestId: c.get("requestId") },
  );
};

export const updateSettingsGroup = async (c: Context<AppContext>) => {
  const group = validateSettingsGroup(requiredParam(c, "group"));
  const input = validateUpdateSettingsGroupInput(group, await readJson(c));

  return ok(
    await settingsService.updateSettingsGroup(c.env, actor(c), group, input),
    "Settings updated successfully.",
    { requestId: c.get("requestId") },
  );
};

export const getAliasedSettingsGroup =
  (group: string) => async (c: Context<AppContext>) => {
    const validatedGroup = validateSettingsGroup(group);
    const data = await settingsService.getSettingsGroup(c.env, actor(c), validatedGroup);

    return ok(
      data,
      data.settings.length === 0
        ? "No settings found for this group yet."
        : "Settings loaded successfully.",
      { requestId: c.get("requestId") },
    );
  };

export const updateAliasedSettingsGroup =
  (group: string) => async (c: Context<AppContext>) => {
    const validatedGroup = validateSettingsGroup(group);
    const input = validateUpdateSettingsGroupInput(validatedGroup, await readJson(c));

    return ok(
      await settingsService.updateSettingsGroup(c.env, actor(c), validatedGroup, input),
      "Settings updated successfully.",
      { requestId: c.get("requestId") },
    );
  };

export const listFeatures = async (c: Context<AppContext>) =>
  ok(await settingsService.listFeatures(c.env, actor(c)), "Features loaded successfully.", {
    requestId: c.get("requestId"),
  });

export const getFeature = async (c: Context<AppContext>) => {
  const featureKey = validateFeatureKey(requiredParam(c, "featureKey"));

  return ok(
    await settingsService.getFeature(c.env, actor(c), featureKey),
    "Feature loaded successfully.",
    { requestId: c.get("requestId") },
  );
};

export const updateFeature = async (c: Context<AppContext>) => {
  const featureKey = validateFeatureKey(requiredParam(c, "featureKey"));
  const input = validateUpdateFeatureInput(await readJson(c));

  return ok(
    await settingsService.updateFeature(c.env, actor(c), featureKey, input),
    "Feature updated successfully.",
    { requestId: c.get("requestId") },
  );
};

export const bulkUpdateFeatures = async (c: Context<AppContext>) => {
  const input = validateBulkUpdateFeaturesInput(await readJson(c));

  return ok(
    await settingsService.bulkUpdateFeatures(c.env, actor(c), input),
    "Features updated successfully.",
    { requestId: c.get("requestId") },
  );
};

export const getApprovalSettings = async (c: Context<AppContext>) =>
  ok(
    await settingsService.getApprovalSettings(c.env, actor(c)),
    "Approval settings loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const updateApprovalSettings = async (c: Context<AppContext>) => {
  const input = validateApprovalSettingsInput(await readJson(c));

  return ok(
    await settingsService.updateApprovalSettings(c.env, actor(c), input),
    input.approval_mode === "disabled" ||
      input.approval_workflows_enabled === false
      ? "Approval workflows are disabled. Authorized Admin/Super Admin users can act directly."
      : "Approval settings updated successfully.",
    { requestId: c.get("requestId") },
  );
};

export const listApprovalThresholds = async (c: Context<AppContext>) =>
  ok(
    await settingsService.listApprovalThresholds(
      c.env,
      actor(c),
      validateApprovalThresholdFilters({
        workflow_key: c.req.query("workflow_key"),
        threshold_type: c.req.query("threshold_type"),
        is_active: c.req.query("is_active"),
      }),
    ),
    "Approval thresholds loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const getApprovalThreshold = async (c: Context<AppContext>) =>
  ok(
    await settingsService.getApprovalThreshold(
      c.env,
      actor(c),
      requiredParam(c, "id"),
    ),
    "Approval threshold loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const updateApprovalThreshold = async (c: Context<AppContext>) => {
  const input = validateApprovalThresholdInput(await readJson(c));

  return ok(
    await settingsService.updateApprovalThreshold(
      c.env,
      actor(c),
      requiredParam(c, "id"),
      input,
    ),
    "Approval threshold updated successfully.",
    { requestId: c.get("requestId") },
  );
};

export const getSettingsChangeLog = async (c: Context<AppContext>) =>
  ok(
    await settingsService.getSettingsChangeLog(
      c.env,
      actor(c),
      validateChangeLogFilters({
        date_from: c.req.query("date_from"),
        date_to: c.req.query("date_to"),
        setting_group: c.req.query("setting_group"),
        setting_key: c.req.query("setting_key"),
        changed_by: c.req.query("changed_by"),
        effective_date: c.req.query("effective_date"),
      }),
    ),
    "Settings change log loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const resetDefaults = async (c: Context<AppContext>) => {
  const group = validateSettingsGroup(requiredParam(c, "group"));

  return ok(
    {
      reset: false,
      group,
    },
    "Default reset support will be added when production defaults are finalized.",
    { requestId: c.get("requestId") },
  );
};
