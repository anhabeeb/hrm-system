import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api-client";

import type { DashboardLayout, DashboardPreference, DashboardType } from "./dashboardPreferences.types";

const preferencePath = (dashboardType: DashboardType) => `/dashboard/preferences/${dashboardType}`;

export const dashboardPreferencesApi = {
  get: (dashboardType: DashboardType) => api.get<DashboardPreference>(preferencePath(dashboardType), { background: true }),
  save: (dashboardType: DashboardType, layout: DashboardLayout) =>
    api.put<DashboardPreference>(preferencePath(dashboardType), { layout }),
  reset: (dashboardType: DashboardType) => api.post<DashboardPreference>(`${preferencePath(dashboardType)}/reset`),
};

export const dashboardPreferenceQueryKey = (dashboardType: DashboardType) => ["dashboard-preferences", dashboardType] as const;

export const useDashboardPreferences = (dashboardType: DashboardType, enabled = true) =>
  useQuery({
    queryKey: dashboardPreferenceQueryKey(dashboardType),
    queryFn: () => dashboardPreferencesApi.get(dashboardType),
    enabled,
    staleTime: 60_000,
    retry: 1,
  });

export const useSaveDashboardPreferences = (dashboardType: DashboardType) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (layout: DashboardLayout) => dashboardPreferencesApi.save(dashboardType, layout),
    onSuccess: (response) => queryClient.setQueryData(dashboardPreferenceQueryKey(dashboardType), response),
  });
};

export const useResetDashboardPreferences = (dashboardType: DashboardType) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dashboardPreferencesApi.reset(dashboardType),
    onSuccess: (response) => queryClient.setQueryData(dashboardPreferenceQueryKey(dashboardType), response),
  });
};
