import type { CurrentUser, FeatureKey } from "@/types/auth";

import { isSuperAdmin } from "./permissions";

export const hasFeature = (user: CurrentUser | null, feature?: FeatureKey) => {
  if (!feature) return true;
  if (isSuperAdmin(user)) return true;
  return Boolean(user?.features?.includes(feature));
};
