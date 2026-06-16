import type { DashboardWidgetDefinition } from "@/config/dashboardWidgets";
import { useAuth } from "@/features/auth/auth.store";
import { canShowModuleItem } from "@/lib/moduleAccess";
import type { CurrentUser } from "@/types/auth";

import { useDashboardPreferences, useResetDashboardPreferences, useSaveDashboardPreferences } from "./dashboardPreferences.api";
import type {
  DashboardLayout,
  DashboardType,
  DashboardWidgetPreference,
  PersonalizedDashboardWidget,
} from "./dashboardPreferences.types";

export const getAllowedDashboardWidgets = (
  user: CurrentUser | null,
  dashboardType: DashboardType,
  definitions: DashboardWidgetDefinition[],
) =>
  definitions.filter((widget) =>
    widget.dashboardType === dashboardType &&
    canShowModuleItem(user, widget.moduleCode, widget.requiredPermission, {
      requiredPermissionsAny: widget.requiredPermissionsAny,
      requiredFeaturesAll: widget.requiredFeaturesAll,
      requiresLinkedEmployee: widget.requiresLinkedEmployee,
    }),
  );

const normalizeOrder = (widgets: PersonalizedDashboardWidget[]) =>
  widgets
    .map((widget, index) => ({ ...widget, order: index * 10 + 10 }))
    .sort((a, b) => a.order - b.order || a.defaultOrder - b.defaultOrder);

export const mergeDashboardPreferences = (
  definitions: DashboardWidgetDefinition[],
  layout?: DashboardLayout | null,
): PersonalizedDashboardWidget[] => {
  const savedById = new Map<string, DashboardWidgetPreference>(
    layout?.widgets?.map((widget) => [widget.id, widget]) ?? [],
  );

  const merged = definitions.map((definition) => {
    const saved = savedById.get(definition.id);
    return {
      ...definition,
      visible: saved?.visible ?? definition.defaultVisible,
      order: saved?.order ?? definition.defaultOrder,
      size: saved?.size ?? definition.defaultSize,
    };
  });

  return normalizeOrder(merged);
};

export const visibleDashboardWidgets = (widgets: PersonalizedDashboardWidget[]) =>
  widgets.filter((widget) => widget.visible);

export const toDashboardLayout = (widgets: PersonalizedDashboardWidget[]): DashboardLayout => ({
  version: 1,
  widgets: normalizeOrder(widgets).map((widget) => ({
    id: widget.id,
    visible: widget.visible,
    order: widget.order,
    ...(widget.size ? { size: widget.size } : {}),
  })),
  density: "comfortable",
});

export const movePersonalizedWidget = (
  widgets: PersonalizedDashboardWidget[],
  widgetId: string,
  direction: "up" | "down",
) => {
  const next = [...widgets].sort((a, b) => a.order - b.order);
  const index = next.findIndex((widget) => widget.id === widgetId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= next.length) return next;
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return normalizeOrder(next);
};

export const togglePersonalizedWidget = (
  widgets: PersonalizedDashboardWidget[],
  widgetId: string,
  visible: boolean,
) => widgets.map((widget) => (widget.id === widgetId ? { ...widget, visible } : widget));

export const usePersonalizedWidgets = (
  dashboardType: DashboardType,
  definitions: DashboardWidgetDefinition[],
  options: { enabled?: boolean } = {},
) => {
  const { user } = useAuth();
  const allowedDefinitions = getAllowedDashboardWidgets(user, dashboardType, definitions);
  const preferences = useDashboardPreferences(dashboardType, options.enabled ?? true);
  const save = useSaveDashboardPreferences(dashboardType);
  const reset = useResetDashboardPreferences(dashboardType);
  const merged = mergeDashboardPreferences(allowedDefinitions, preferences.data?.data.layout ?? null);

  return {
    allWidgets: merged,
    visibleWidgets: visibleDashboardWidgets(merged),
    preferences,
    saveLayout: save.mutateAsync,
    resetLayout: reset.mutateAsync,
    isSaving: save.isPending,
    isResetting: reset.isPending,
    isPreferencesLoading: preferences.isLoading,
    isUsingDefaultLayout: !preferences.data?.data.layout,
  };
};
