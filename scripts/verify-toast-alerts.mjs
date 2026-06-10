import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const read = (path) => readFileSync(path, "utf8");
const frontendSrc = "frontend/src";

const listSourceFiles = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });

const failures = [];
const requireContains = (label, file, phrases) => {
  const text = read(file);
  for (const phrase of phrases) {
    if (!text.includes(phrase)) failures.push(`${label} missing ${phrase}`);
  }
};

requireContains("ToastProvider", "frontend/src/components/feedback/ToastProvider.tsx", [
  "ToastContext.Provider",
  "hrm:session-expired",
  "durationMs",
  "setTimeout",
  "useLocation",
  "location.pathname",
  "toast.persistent && toast.type !== \"loading\"",
]);
requireContains("ToastViewport", "frontend/src/components/feedback/ToastViewport.tsx", [
  "aria-live",
  "Dismiss notification",
  "role={toast.type === \"error\" || toast.type === \"warning\" ? \"alert\" : \"status\"}",
]);
requireContains("AppProviders", "frontend/src/app/providers.tsx", [
  "ToastProvider",
  "<ToastProvider>{children}</ToastProvider>",
]);
requireContains("InlineAlert compatibility", "frontend/src/components/feedback/InlineAlert.tsx", [
  "variant === \"success\"",
  "variant === \"error\"",
  "toast.success",
  "toast.error",
  "persistent",
  "return null",
]);
requireContains("Persistent AppErrorAlert", "frontend/src/components/feedback/AppErrorAlert.tsx", [
  "persistent",
  "ErrorDetailsAccordion",
  "CopyDiagnosticsButton",
]);
requireContains("Login toast feedback", "frontend/src/features/auth/LoginPage.tsx", [
  "useToast",
  "toastError",
  "Session expired",
  "Unable to sign in. Please try again.",
]);
requireContains("API client background guard", "frontend/src/lib/api-client.ts", [
  "X-HRM-Background-Request",
  "X-HRM-User-Activity",
]);

for (const file of listSourceFiles(frontendSrc)) {
  const text = read(file);
  if (/window\.alert\s*\(/.test(text) || /\balert\s*\(/.test(text)) {
    failures.push(`Browser alert usage found in ${relative(process.cwd(), file).replace(/\\/g, "/")}`);
  }
  if (/window\.confirm\s*\(/.test(text) || /\bconfirm\s*\(/.test(text)) {
    failures.push(`Browser confirm usage found in ${relative(process.cwd(), file).replace(/\\/g, "/")}`);
  }
}

const inlineAlert = read("frontend/src/components/feedback/InlineAlert.tsx");
if (!/if \(!persistent && \(variant === "success" \|\| variant === "error"\)\) return null;/.test(inlineAlert)) {
  failures.push("InlineAlert must render normal success/error feedback as toast-only.");
}

const loginPage = read("frontend/src/features/auth/LoginPage.tsx");
if (/FormError|InlineAlert|AppErrorAlert/.test(loginPage)) {
  failures.push("LoginPage must not render inline/page alerts for normal auth feedback.");
}

const tests = read("tests/frontend-ui-hardening.test.ts");
for (const phrase of [
  "ToastProvider",
  "ToastViewport",
  "toastDurations",
  "hrm:session-expired",
  "window.alert",
  "window.confirm",
  "location.pathname",
  "variant === \"success\"",
  "variant === \"error\"",
  "persistent",
  "LoginPage",
  "toastError",
]) {
  if (!tests.includes(phrase)) failures.push(`Toast test coverage missing ${phrase}`);
}

if (!read("frontend/src/components/feedback/AppErrorAlert.tsx").includes("AppErrorAlert")) {
  failures.push("Persistent AppErrorAlert was removed.");
}
if (!read("frontend/src/components/feedback/InlineAlert.tsx").includes("InlineAlert")) {
  failures.push("Persistent InlineAlert was removed.");
}

if (failures.length > 0) {
  console.error("Toast alert verification failed.");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Toast alert verification passed.");
