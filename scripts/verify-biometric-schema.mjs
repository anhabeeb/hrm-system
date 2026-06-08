import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const baseMigration = readFileSync(resolve(root, "migrations/0005_attendance_biometric.sql"), "utf8").toLowerCase();
const hardeningMigration = readFileSync(resolve(root, "migrations/0035_biometric_device_hardening.sql"), "utf8").toLowerCase();
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const biometricService = readFileSync(resolve(root, "src/modules/biometric/biometric.service.ts"), "utf8");
const biometricRoutes = readFileSync(resolve(root, "src/routes/biometric.routes.ts"), "utf8");
const validators = readFileSync(resolve(root, "src/modules/biometric/biometric.validators.ts"), "utf8");
const attendanceRepository = readFileSync(resolve(root, "src/modules/attendance/attendance.repository.ts"), "utf8");
const permissionsSeed = readFileSync(resolve(root, "seeds/permissions.seed.sql"), "utf8");

const requiredBaseTokens = [
  "create table if not exists biometric_devices",
  "api_token_hash",
  "create table if not exists employee_biometric_links",
  "create table if not exists biometric_attendance_logs",
  "unique(company_id, dedupe_key)",
];

const requiredHardeningTokens = [
  "alter table biometric_devices add column device_code",
  "alter table biometric_devices add column external_device_id",
  "alter table biometric_devices add column vendor",
  "alter table biometric_devices add column model",
  "alter table biometric_devices add column revoked_by",
  "alter table biometric_attendance_logs add column source_event_id",
  "alter table biometric_attendance_logs add column attendance_event_id",
  "alter table attendance_events add column source_device_id",
  "idx_biometric_devices_company_external_device_id",
  "idx_biometric_logs_company_status",
];

for (const token of requiredBaseTokens) {
  if (!baseMigration.includes(token)) {
    throw new Error(`Biometric schema verification failed: missing base token ${token}`);
  }
}

for (const token of requiredHardeningTokens) {
  if (!hardeningMigration.includes(token)) {
    throw new Error(`Biometric schema verification failed: missing hardening token ${token}`);
  }
}

const requiredServiceTokens = [
  "DEVICE_NOT_REGISTERED",
  "DEVICE_INACTIVE",
  "DEVICE_OUTLET_SCOPE_DENIED",
  "DEVICE_NOT_ALLOWED",
  "unmatched_employee",
  "ambiguous_employee",
  "invalid_timestamp",
  "isPushBiometricDevice",
  "isBridgeDevice",
  "biometric_device_token_rotated",
  "attendance_event_created_from_device_punch",
  "rejectBiometricLog",
];

for (const token of requiredServiceTokens) {
  if (!biometricService.includes(token)) {
    throw new Error(`Biometric schema verification failed: service missing ${token}`);
  }
}

for (const token of ["/punch", "/punches", "/batch", "/bridge/batch", "/logs", "/unmatched", "/logs/:id/reject", "/devices/:id/revoke", "/devices/:id/rotate-token"]) {
  if (!biometricRoutes.includes(token)) {
    throw new Error(`Biometric schema verification failed: routes missing ${token}`);
  }
}

for (const token of ["external_employee_identifier", "external_event_id", "raw_punch_code"]) {
  if (!validators.includes(token)) {
    throw new Error(`Biometric schema verification failed: validators missing ${token}`);
  }
}

for (const token of ["source_device_id", "source_event_id", "metadata_json"]) {
  if (!attendanceRepository.includes(token)) {
    throw new Error(`Biometric schema verification failed: attendance events do not insert ${token}`);
  }
}

for (const token of ["biometric.resolve_punches", "devices.revoke"]) {
  if (!permissionsSeed.includes(token)) {
    throw new Error(`Biometric schema verification failed: missing seeded permission ${token}`);
  }
}

if (!packageJson.scripts?.["verify:biometric-schema"]) {
  throw new Error("Biometric schema verification failed: missing verify:biometric-schema package script.");
}

console.log("Biometric schema verification passed.");
