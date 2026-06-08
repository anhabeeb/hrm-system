import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const migration = readFileSync(resolve(root, "migrations/0033_roster_scheduling_hardening.sql"), "utf8").toLowerCase();
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const app = readFileSync(resolve(root, "src/app.ts"), "utf8");
const settingsValidators = readFileSync(resolve(root, "src/modules/settings/settings.validators.ts"), "utf8");
const frontendRouter = readFileSync(resolve(root, "frontend/src/app/router.tsx"), "utf8");

const requiredTokens = [
  "alter table shift_templates add column outlet_id",
  "alter table shift_templates add column department_id",
  "alter table shift_templates add column code",
  "alter table shift_templates add column crosses_midnight",
  "alter table roster_shifts add column department_id",
  "alter table roster_shifts add column position_id",
  "alter table roster_shifts add column roster_date",
  "alter table roster_shifts add column break_minutes",
  "alter table roster_conflicts add column detected_at",
  "idx_shift_templates_company_code",
  "idx_roster_shifts_company_outlet_date",
  "idx_roster_shifts_company_employee_date",
  "idx_roster_conflicts_shift_status",
  "attendance.roster_rules",
];

for (const token of requiredTokens) {
  if (!migration.includes(token)) {
    throw new Error(`Roster schema verification failed: missing ${token}`);
  }
}

if (!settingsValidators.includes('"attendance.roster_rules"')) {
  throw new Error("Roster schema verification failed: attendance.roster_rules is not allowed by settings validation.");
}

if (!app.includes('apiV1.route("/shift-templates", shiftTemplatesRoutes)') || !app.includes('apiV1.route("/rosters", rostersRoutes)')) {
  throw new Error("Roster schema verification failed: roster routes are not registered.");
}

if (!frontendRouter.includes('path="/rosters"')) {
  throw new Error("Roster schema verification failed: frontend /rosters route is not registered.");
}

if (!packageJson.scripts?.["verify:roster-schema"]) {
  throw new Error("Roster schema verification failed: missing verify:roster-schema package script.");
}

console.log("Roster schema verification passed.");
