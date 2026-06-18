import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toastError, toastSuccess } from "@/components/feedback/toast-helpers";
import { useToast } from "@/components/feedback/useToast";

import { setupGuideApi } from "./setupGuide.api";

export const setupGuideKeys = {
  status: ["setup-guide", "status"] as const,
  activities: ["setup-guide", "activities"] as const,
};

export const useSetupGuideStatus = (enabled = true) =>
  useQuery({
    queryKey: setupGuideKeys.status,
    queryFn: setupGuideApi.status,
    enabled,
    retry: 1,
  });

export const useSetupGuide = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({
    queryKey: setupGuideKeys.activities,
    queryFn: setupGuideApi.activities,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: setupGuideKeys.activities }),
      queryClient.invalidateQueries({ queryKey: setupGuideKeys.status }),
    ]);
  };

  const complete = useMutation({
    mutationFn: ({ activityKey, reason }: { activityKey: string; reason?: string }) =>
      setupGuideApi.complete(activityKey, reason),
    onSuccess: async () => {
      toastSuccess(toast, "Setup step marked complete.");
      await refresh();
    },
    onError: (error) => toastError(toast, error, "Setup step could not be completed."),
  });

  const skip = useMutation({
    mutationFn: ({ activityKey, reason }: { activityKey: string; reason: string }) =>
      setupGuideApi.skip(activityKey, reason),
    onSuccess: async () => {
      toastSuccess(toast, "Setup step skipped for now.");
      await refresh();
    },
    onError: (error) => toastError(toast, error, "Setup step could not be skipped."),
  });

  const start = useMutation({
    mutationFn: setupGuideApi.start,
    onSuccess: refresh,
  });

  const finish = useMutation({
    mutationFn: setupGuideApi.finish,
    onSuccess: async () => {
      toastSuccess(toast, "Setup wizard completed.");
      await refresh();
    },
    onError: (error) => toastError(toast, error, "Setup wizard could not be finished."),
  });

  const skipForNow = useMutation({
    mutationFn: setupGuideApi.skipForNow,
    onSuccess: async () => {
      toastSuccess(toast, "Setup progress saved. We will keep showing reminders until setup is complete.");
      await refresh();
    },
    onError: (error) => toastError(toast, error, "Setup progress could not be saved for later."),
  });

  const recalculate = useMutation({
    mutationFn: setupGuideApi.recalculate,
    onSuccess: refresh,
    onError: (error) => toastError(toast, error, "Setup progress could not be recalculated."),
  });

  return {
    query,
    overview: query.data?.data,
    isLoading: query.isLoading,
    isError: query.isError,
    complete,
    skip,
    start,
    finish,
    skipForNow,
    recalculate,
  };
};
