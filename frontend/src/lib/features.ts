import type { CurrentUser, FeatureKey } from "@/types/auth";

import { MODULE_FEATURE_ALIASES } from "@/config/moduleCodes";

export const hasFeature = (user: CurrentUser | null, feature?: FeatureKey) => {
  if (!feature) return true;
  return Boolean(user?.features?.includes(feature));
};

export const isModuleEnabled = (user: CurrentUser | null, moduleCode?: FeatureKey) => {
  if (!moduleCode) return true;
  const aliases = MODULE_FEATURE_ALIASES[moduleCode] ?? [moduleCode];
  return aliases.some((feature) => hasFeature(user, feature));
};

export const areModulesEnabled = (user: CurrentUser | null, moduleCodes?: FeatureKey[]) =>
  !moduleCodes || moduleCodes.length === 0 || moduleCodes.every((moduleCode) => isModuleEnabled(user, moduleCode));
