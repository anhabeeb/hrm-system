import { useQuery } from "@tanstack/react-query";

import { navigationApi } from "@/features/navigation/navigation.api";
import { useAuth } from "@/features/auth/auth.store";
import type { NavigationBadges } from "@/types/navigation";

export const useNavigationBadges = (): NavigationBadges => {
  const { isAuthenticated } = useAuth();
  const query = useQuery({
    queryKey: ["navigation", "badges"],
    queryFn: navigationApi.badges,
    enabled: isAuthenticated,
    retry: false,
    staleTime: 60_000,
  });

  return query.data?.data?.badges ?? {};
};
