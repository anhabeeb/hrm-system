import { readFileSync } from "node:fs";

const read = (file) => readFileSync(file, "utf8");
const failures = [];

const mustInclude = (label, file, phrase) => {
  const text = read(file);
  if (!text.includes(phrase)) failures.push(`${label} missing ${phrase}`);
};

mustInclude("structured security settings", "frontend/src/features/settings/structured-settings.ts", "remember_me_allowed");
mustInclude("structured security settings", "frontend/src/features/settings/structured-settings.ts", "remember_me_session_days");
mustInclude("session settings service", "src/services/settings.service.ts", "remember_me_allowed");
mustInclude("session settings service", "src/services/settings.service.ts", "remember_me_session_days");
mustInclude("session token service", "src/services/session.service.ts", "options: { rememberMe?: boolean }");
mustInclude("remembered session migration", "migrations/0059_remembered_sessions.sql", "remember_me INTEGER NOT NULL DEFAULT 0");
mustInclude("session token service", "src/services/session.service.ts", "settings.remember_me_allowed === true && options.rememberMe === true");
mustInclude("session token service", "src/services/session.service.ts", "rememberMe,");
mustInclude("session repository", "src/modules/auth/auth.repository.ts", "remember_me");
mustInclude("session repository", "src/modules/auth/auth.repository.ts", "session.rememberMe ? 1 : 0");
mustInclude("auth middleware", "src/middleware/auth.middleware.ts", "session.remember_me !== 1");
mustInclude("auth middleware", "src/middleware/auth.middleware.ts", "Remembered sessions use their backend-issued expires_at as the absolute cap.");
mustInclude("auth validator", "src/modules/auth/auth.validators.ts", "remember_me");
mustInclude("auth service", "src/modules/auth/auth.service.ts", "rememberMe: input.remember_me === true");
mustInclude("auth service", "src/modules/auth/auth.service.ts", "remember_me: rememberMe");
mustInclude("bootstrap status", "src/modules/bootstrap/bootstrap.service.ts", "remember_me_allowed");
mustInclude("login page", "frontend/src/features/auth/LoginPage.tsx", "Remember me");
mustInclude("login page", "frontend/src/features/auth/LoginPage.tsx", "rememberMeAllowed && values.remember_me === true");
mustInclude("frontend auth store", "frontend/src/features/auth/auth.store.tsx", "remember_me: input.remember_me");
mustInclude("auth tests", "tests/auth.test.ts", "remember_me=true creates a longer backend-controlled session when enabled");
mustInclude("auth tests", "tests/auth.test.ts", "creates a remembered session after a valid 2FA challenge");
mustInclude("session timeout tests", "tests/session-timeouts.test.ts", "remember_me extends cookie expiry only when company settings allow it");
mustInclude("session timeout tests", "tests/session-timeouts.test.ts", "remember_me=true with enabled setting does not expire at the normal absolute timeout");
mustInclude("session timeout tests", "tests/session-timeouts.test.ts", "remember_me=true with enabled setting still expires when expires_at is reached");
mustInclude("module aliases", "frontend/src/lib/features.ts", "MODULE_FEATURE_ALIASES");
mustInclude("module access helper", "frontend/src/lib/features.ts", "isModuleEnabled");
mustInclude("frontend route guard", "frontend/src/features/auth/route-guards.tsx", "isRouteFeatureAllowed(user, { moduleCode, requiredFeature, moduleCodesAll, requiredFeaturesAll })");
mustInclude("frontend navigation", "frontend/src/lib/navigation.ts", "canShowModuleItem");
mustInclude("frontend module access", "frontend/src/lib/moduleAccess.ts", "isModuleEnabled(user, moduleCode)");
mustInclude("frontend module access", "frontend/src/lib/moduleAccess.ts", "canAccessSelfService(user)");
mustInclude("backend feature middleware", "src/middleware/feature.middleware.ts", "resolveModuleFeatureAliases");
mustInclude("backend feature middleware", "src/middleware/feature.middleware.ts", "This module is currently disabled.");
mustInclude("module visibility migration", "migrations/0077_module_visibility_feature_settings.sql", "disciplinary_actions");
mustInclude("module visibility tests", "tests/module-enabled-visibility.test.ts", "requiresLinkedEmployee");

if (failures.length > 0) {
  console.error("Settings verification failed.");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Settings verification passed.");
