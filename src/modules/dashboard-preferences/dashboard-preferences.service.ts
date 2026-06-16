import type { AuthActor } from "../../types/api.types";
import { PermissionError, ValidationError } from "../../utils/errors";
import * as repository from "./dashboard-preferences.repository";
import {
  DASHBOARD_TYPES,
  type DashboardLayout,
  type DashboardPreferenceResponse,
  type DashboardType,
  type DashboardWidgetPreference,
} from "./dashboard-preferences.types";

const MAX_LAYOUT_JSON_BYTES = 12_000;
const MAX_WIDGETS = 80;
const WIDGET_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,80}$/i;
const SENSITIVE_KEYS = [
  "password",
  "password_hash",
  "token",
  "session",
  "secret",
  "api_key",
  "file_key",
  "document_key",
  "payroll_data",
  "disciplinary_notes",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseDashboardType = (dashboardType: string): DashboardType => {
  if ((DASHBOARD_TYPES as readonly string[]).includes(dashboardType)) {
    return dashboardType as DashboardType;
  }
  throw new ValidationError("Invalid dashboard type.", { dashboard_type: "Invalid dashboard type." });
};

const containsSensitiveKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsSensitiveKey);
  if (!isRecord(value)) return false;

  return Object.entries(value).some(([key, child]) => {
    const normalized = key.toLowerCase();
    return SENSITIVE_KEYS.some((sensitive) => normalized.includes(sensitive)) || containsSensitiveKey(child);
  });
};

const normalizeWidget = (widget: unknown, index: number): DashboardWidgetPreference => {
  if (!isRecord(widget)) {
    throw new ValidationError("Dashboard layout has invalid widgets.", { [`widgets.${index}`]: "Widget must be an object." });
  }

  const id = String(widget.id ?? "").trim();
  const visible = widget.visible;
  const order = Number(widget.order);
  const size = widget.size === undefined || widget.size === null ? undefined : String(widget.size);

  if (!WIDGET_ID_PATTERN.test(id)) {
    throw new ValidationError("Dashboard layout has an invalid widget id.", { [`widgets.${index}.id`]: "Invalid widget id." });
  }
  if (typeof visible !== "boolean") {
    throw new ValidationError("Dashboard layout has invalid visibility values.", { [`widgets.${index}.visible`]: "Visible must be true or false." });
  }
  if (!Number.isInteger(order) || order < 0 || order > 10_000) {
    throw new ValidationError("Dashboard layout has invalid widget ordering.", { [`widgets.${index}.order`]: "Order must be between 0 and 10000." });
  }
  if (size && !["small", "medium", "wide"].includes(size)) {
    throw new ValidationError("Dashboard layout has an invalid widget size.", { [`widgets.${index}.size`]: "Invalid widget size." });
  }

  return {
    id,
    visible,
    order,
    ...(size ? { size: size as DashboardWidgetPreference["size"] } : {}),
  };
};

const sanitizeLayout = (input: unknown): DashboardLayout => {
  if (!isRecord(input)) {
    throw new ValidationError("Dashboard layout is invalid.", { layout: "Layout must be an object." });
  }
  if (containsSensitiveKey(input)) {
    throw new ValidationError("Dashboard preferences can only store layout settings.", {
      layout: "Remove sensitive data from the dashboard layout.",
    });
  }

  const widgets = Array.isArray(input.widgets) ? input.widgets : null;
  if (!widgets) {
    throw new ValidationError("Dashboard layout must include widgets.", { widgets: "Widgets must be an array." });
  }
  if (widgets.length > MAX_WIDGETS) {
    throw new ValidationError("Dashboard layout has too many widgets.", { widgets: "Too many widgets." });
  }

  const density = input.density === undefined || input.density === null ? undefined : String(input.density);
  if (density && !["compact", "comfortable"].includes(density)) {
    throw new ValidationError("Dashboard density is invalid.", { density: "Invalid density." });
  }

  const layout: DashboardLayout = {
    version: 1,
    widgets: widgets.map(normalizeWidget),
    ...(density ? { density: density as DashboardLayout["density"] } : {}),
  };
  const serialized = JSON.stringify(layout);
  if (serialized.length > MAX_LAYOUT_JSON_BYTES) {
    throw new ValidationError("Dashboard layout is too large.", { layout: "Layout is too large." });
  }

  return layout;
};

const parseStoredLayout = (layoutJson: string): DashboardLayout | null => {
  try {
    return sanitizeLayout(JSON.parse(layoutJson));
  } catch {
    return null;
  }
};

const requireSelfServiceEmployee = async (env: Env, actor: AuthActor, dashboardType: DashboardType) => {
  if (dashboardType !== "SELF_SERVICE_DASHBOARD") return;
  const employee = await repository.findLinkedEmployeeId(env, actor.companyId, actor.actorUserId);
  if (!employee) {
    throw new PermissionError(
      "Self-service is only available for accounts linked to an employee profile.",
      "SELF_SERVICE_LINKED_EMPLOYEE_REQUIRED",
    );
  }
};

const toResponse = (dashboardType: DashboardType, layout: DashboardLayout | null, updatedAt: string | null): DashboardPreferenceResponse => ({
  dashboard_type: dashboardType,
  layout,
  updated_at: updatedAt,
});

export const getPreference = async (
  env: Env,
  actor: AuthActor,
  dashboardTypeParam: string,
): Promise<DashboardPreferenceResponse> => {
  const dashboardType = parseDashboardType(dashboardTypeParam);
  await requireSelfServiceEmployee(env, actor, dashboardType);
  const record = await repository.findPreference(env, actor.companyId, actor.actorUserId, dashboardType);

  return toResponse(dashboardType, record ? parseStoredLayout(record.layout_json) : null, record?.updated_at ?? null);
};

export const savePreference = async (
  env: Env,
  actor: AuthActor,
  dashboardTypeParam: string,
  body: unknown,
): Promise<DashboardPreferenceResponse> => {
  const dashboardType = parseDashboardType(dashboardTypeParam);
  await requireSelfServiceEmployee(env, actor, dashboardType);
  const layoutInput = isRecord(body) && "layout" in body ? body.layout : body;
  const layout = sanitizeLayout(layoutInput);
  const layoutJson = JSON.stringify(layout);
  const record = await repository.upsertPreference(env, {
    id: crypto.randomUUID(),
    companyId: actor.companyId,
    userId: actor.actorUserId,
    dashboardType,
    layoutJson,
    version: layout.version,
    density: layout.density ?? null,
  });

  return toResponse(dashboardType, record ? parseStoredLayout(record.layout_json) : layout, record?.updated_at ?? new Date().toISOString());
};

export const resetPreference = async (
  env: Env,
  actor: AuthActor,
  dashboardTypeParam: string,
): Promise<DashboardPreferenceResponse> => {
  const dashboardType = parseDashboardType(dashboardTypeParam);
  await requireSelfServiceEmployee(env, actor, dashboardType);
  await repository.deletePreference(env, actor.companyId, actor.actorUserId, dashboardType);
  return toResponse(dashboardType, null, null);
};
