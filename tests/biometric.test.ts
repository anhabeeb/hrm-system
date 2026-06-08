import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../src/services/audit.service", () => ({
  createAuditLog: vi.fn(async () => ({ created: true })),
}));

vi.mock("../src/services/realtime.service", () => ({
  broadcastEvent: vi.fn(async () => undefined),
}));

vi.mock("../src/modules/attendance/attendance-summary.service", () => ({
  rebuildDailySummary: vi.fn(async () => undefined),
}));

vi.mock("../src/modules/sync/sync-change.service", () => ({
  createSyncChange: vi.fn(async () => undefined),
}));

vi.mock("../src/modules/sync/sync.service", () => ({
  getMaxRecordsPerBatch: vi.fn(async () => 100),
}));

vi.mock("../src/modules/attendance/attendance.repository", () => ({
  findEventByLocalId: vi.fn(),
  createAttendanceEvent: vi.fn(async () => ({ success: true })),
  findEventById: vi.fn(),
  listEventsForDate: vi.fn(),
  findPayrollRunForMonth: vi.fn(),
  findDailySummary: vi.fn(),
  findEmployeeForAttendance: vi.fn(),
  createConflict: vi.fn(async () => ({ success: true })),
}));

vi.mock("../src/modules/devices/devices.repository", () => ({
  findDeviceByTokenHash: vi.fn(),
  touchDevice: vi.fn(async () => ({ success: true })),
  createDevice: vi.fn(async () => ({ success: true })),
  updateDevice: vi.fn(async () => ({ success: true })),
  updateDeviceStatus: vi.fn(async () => ({ success: true })),
  updateDeviceToken: vi.fn(async () => ({ success: true })),
  createDeviceSyncState: vi.fn(async () => ({ success: true })),
}));

vi.mock("../src/modules/biometric/biometric.repository", () => ({
  findDeviceById: vi.fn(),
  findDeviceBySerial: vi.fn(),
  findDeviceByIdentifier: vi.fn(),
  createDevice: vi.fn(async () => ({ success: true })),
  updateDevice: vi.fn(async () => ({ success: true })),
  updateDeviceStatus: vi.fn(async () => ({ success: true })),
  updateDeviceToken: vi.fn(async () => ({ success: true })),
  touchBiometricDevice: vi.fn(async () => ({ success: true })),
  listDevices: vi.fn(),
  countDevices: vi.fn(),
  findMapping: vi.fn(),
  findMappingsByBiometricUserId: vi.fn(),
  findMappingById: vi.fn(),
  createMapping: vi.fn(async () => ({ success: true })),
  updateMapping: vi.fn(async () => ({ success: true })),
  disableMapping: vi.fn(async () => ({ success: true })),
  listMappings: vi.fn(),
  countMappings: vi.fn(),
  findLogByDedupeKey: vi.fn(),
  findLogById: vi.fn(),
  createLog: vi.fn(async () => ({ success: true })),
  updateLogStatus: vi.fn(async () => ({ success: true })),
  updateLogAttendanceEvent: vi.fn(async () => ({ success: true })),
  resolveLog: vi.fn(async () => ({ success: true })),
  listLogs: vi.fn(),
  countLogs: vi.fn(),
}));

import * as attendanceRepository from "../src/modules/attendance/attendance.repository";
import { rebuildDailySummary } from "../src/modules/attendance/attendance-summary.service";
import * as biometricRepository from "../src/modules/biometric/biometric.repository";
import * as devicesRepository from "../src/modules/devices/devices.repository";
import { createSyncChange } from "../src/modules/sync/sync-change.service";
import { createAuditLog } from "../src/services/audit.service";
import { authenticateDevice } from "../src/services/device-auth.service";
import { createBiometricDedupeKey } from "../src/modules/biometric/biometric-dedupe.service";
import {
  getBiometricBatchMessage,
  getBiometricReprocessMessage,
} from "../src/modules/biometric/biometric.controller";
import {
  getOriginalDeviceEventId,
  mapUnmatchedLog,
  processBatch,
  processBiometricPunch,
  registerDevice,
  rejectBiometricLog,
  reprocessBiometricLog,
  sanitizeBiometricDeviceForResponse,
  rotateDeviceToken,
  setDeviceStatus,
} from "../src/modules/biometric/biometric.service";
import {
  validateBiometricBatchInput,
  validateBiometricDeviceUpdateInput,
  validateBiometricPunchInput,
  validateBiometricReasonInput,
} from "../src/modules/biometric/biometric.validators";
import { AppError, ValidationError } from "../src/utils/errors";
import { hashToken } from "../src/utils/crypto";
import type { AuthActor, DeviceAuthContext } from "../src/types/api.types";

const env = { DEVICE_TOKEN_SECRET: "test-device-secret" } as Env;

const actor: AuthActor = {
  companyId: "company_1",
  actorUserId: "user_admin",
  fullName: "Admin",
  email: "admin@example.test",
  roles: ["Admin"],
  roleKeys: ["admin"],
  permissions: [
    "biometric.manage_devices",
    "biometric.resolve_punches",
    "biometric.resolve_unmatched",
  ],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: true,
  ipAddress: null,
  userAgent: null,
};

const deviceContext = (overrides: Partial<DeviceAuthContext> = {}): DeviceAuthContext => ({
  requestId: "req_test",
  companyId: "company_1",
  deviceId: "bio_device_1",
  outletId: "outlet_1",
  deviceType: "biometric",
  ...overrides,
});

const biometricDevice = (overrides: Record<string, unknown> = {}) => ({
  id: "bio_device_1",
  company_id: "company_1",
  outlet_id: "outlet_1",
  device_name: "Front Door",
  device_serial: "SN123",
  device_type: "biometric",
  sync_mode: "push_api",
  status: "active",
  last_seen_at: null,
  last_sync_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const biometricMapping = (overrides: Record<string, unknown> = {}) => ({
  id: "bio_map_1",
  company_id: "company_1",
  device_id: "bio_device_1",
  biometric_user_id: "1023",
  employee_id: "emp_1",
  primary_outlet_id: "outlet_1",
  employment_status: "active",
  deleted_at: null,
  ...overrides,
});

const punch = (overrides: Record<string, unknown> = {}) => ({
  biometric_user_id: "1023",
  event_time: "2026-06-01T08:01:00.000Z",
  event_type: "clock_in" as const,
  verification_method: "fingerprint" as const,
  device_event_id: "txn_001",
  raw_punch_code: "0",
  ...overrides,
});

const resetBiometricMocks = () => {
  vi.mocked(biometricRepository.findDeviceById).mockResolvedValue(biometricDevice() as any);
  vi.mocked(biometricRepository.findDeviceByIdentifier).mockResolvedValue(null);
  vi.mocked(biometricRepository.findMappingsByBiometricUserId).mockResolvedValue([biometricMapping()] as any);
  vi.mocked(biometricRepository.findLogByDedupeKey).mockResolvedValue(null as any);
  vi.mocked(biometricRepository.findMapping).mockResolvedValue(biometricMapping() as any);
  vi.mocked(attendanceRepository.findPayrollRunForMonth).mockResolvedValue(null as any);
  vi.mocked(attendanceRepository.findDailySummary).mockResolvedValue(null as any);
  vi.mocked(attendanceRepository.findEventByLocalId).mockResolvedValue(null as any);
  vi.mocked(attendanceRepository.listEventsForDate).mockResolvedValue([]);
  vi.mocked(attendanceRepository.findEventById).mockImplementation(async (_env, _companyId, id) => ({
    id,
    company_id: "company_1",
    employee_id: "emp_1",
    outlet_id: "outlet_1",
    device_id: "bio_device_1",
    event_type: "clock_in",
    event_time: "2026-06-01T08:01:00.000Z",
    attendance_method: "biometric_device",
    source: "biometric_device",
    local_id: "txn_001",
    source_device_id: "bio_device_1",
    source_event_id: "txn_001",
    metadata_json: "{}",
    created_offline: 0,
    sync_status: "synced",
    approval_status: "approved",
    created_at: "2026-06-01T08:01:00.000Z",
    updated_at: "2026-06-01T08:01:00.000Z",
  }) as any);
  vi.mocked(attendanceRepository.findEmployeeForAttendance).mockResolvedValue({
    id: "emp_1",
    primary_outlet_id: "outlet_1",
    employment_status: "active",
    deleted_at: null,
  } as any);
};

beforeEach(() => {
  vi.clearAllMocks();
  resetBiometricMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("biometric validators", () => {
  it("accepts a valid biometric punch", () => {
    const input = validateBiometricPunchInput({
      biometric_user_id: "1023",
      event_time: "2026-06-01T08:01:00+05:00",
      event_type: "clock_in",
      verification_method: "fingerprint",
      device_event_id: "log_001",
    });

    expect(input.biometric_user_id).toBe("1023");
    expect(input.event_type).toBe("clock_in");
  });

  it("accepts Phase 8C device punch aliases", () => {
    const input = validateBiometricPunchInput({
      external_employee_identifier: "EMP-BIO-1023",
      event_time: "2026-06-01T08:01:00+05:00",
      event_type: "check_in",
      verification_method: "fingerprint",
      external_event_id: "txn_001",
      raw_punch_code: "0",
    });

    expect(input.biometric_user_id).toBe("EMP-BIO-1023");
    expect(input.device_event_id).toBe("txn_001");
    expect(input.event_type).toBe("check_in");
  });

  it("requires an employee device identifier for punch ingestion", () => {
    expect(() =>
      validateBiometricPunchInput({
        event_time: "2026-06-01T08:01:00+05:00",
        event_type: "check_in",
      }),
    ).toThrow("Employee device identifier is required.");
  });

  it("rejects biometric templates and images", () => {
    expect(() =>
      validateBiometricPunchInput({
        biometric_user_id: "1023",
        event_time: "2026-06-01T08:01:00+05:00",
        event_type: "clock_in",
        fingerprint_template: "template-data",
      }),
    ).toThrow(AppError);
  });

  it("enforces batch size", () => {
    expect(() =>
      validateBiometricBatchInput(
        {
          batch_id: "bio_batch_1",
          logs: [
            {
              biometric_user_id: "1023",
              event_time: "2026-06-01T08:01:00+05:00",
              event_type: "clock_in",
            },
            {
              biometric_user_id: "1024",
              event_time: "2026-06-01T08:02:00+05:00",
              event_type: "clock_in",
            },
          ],
        },
        1,
      ),
    ).toThrow(ValidationError);
  });

  it("uses device_event_id for stronger dedupe when available", () => {
    expect(
      createBiometricDedupeKey("company_1", "device_1", {
        biometric_user_id: "1023",
        event_time: "2026-06-01T08:01:00+05:00",
        event_type: "clock_in",
        device_event_id: "log_001",
      }),
    ).toBe("company_1:device_1:event:log_001");
  });

  it("uses deterministic fallback dedupe without external event ID", () => {
    expect(
      createBiometricDedupeKey("company_1", "device_1", {
        biometric_user_id: "1023",
        event_time: "2026-06-01T08:01:00+05:00",
        event_type: "clock_in",
      }),
    ).toBe("company_1:device_1:1023:2026-06-01T08:01:00+05:00:clock_in");
  });

  it("rejects status changes through biometric device PATCH", () => {
    expect(() =>
      validateBiometricDeviceUpdateInput({
        status: "disabled",
      }),
    ).toThrow("Device status changes must be made through the enable or disable action.");
  });

  it("rejects token hash changes through biometric device PATCH", () => {
    expect(() =>
      validateBiometricDeviceUpdateInput({
        api_token_hash: "hash",
      }),
    ).toThrow("Device token changes must be made through the rotate token action.");
  });

  it("requires reason for sensitive biometric actions", () => {
    expect(() => validateBiometricReasonInput({})).toThrow(
      "A reason is required for this action.",
    );
  });

  it("sanitizes biometric device responses without token hashes", () => {
    const safe = sanitizeBiometricDeviceForResponse({
      id: "bio_device_1",
      outlet_id: "outlet_1",
      device_name: "Front Door",
      device_serial: "SN123",
      device_type: "fingerprint",
      sync_mode: "push_api",
      api_token_hash: "secret_hash",
      device_token_hash: "shared_hash",
      status: "active",
      last_seen_at: null,
      last_sync_at: null,
    });

    expect(safe).not.toHaveProperty("api_token_hash");
    expect(safe).not.toHaveProperty("device_token_hash");
  });

  it("sanitizes hardened biometric device metadata without token hashes", () => {
    const safe = sanitizeBiometricDeviceForResponse({
      id: "bio_device_1",
      outlet_id: "outlet_1",
      device_name: "Front Door",
      device_serial: "SN123",
      device_code: "BIO-FRONT",
      external_device_id: "zk-01",
      device_type: "biometric",
      vendor: "ZKTeco",
      model: "K40",
      sync_mode: "push_api",
      api_token_hash: "secret_hash",
      device_token_hash: "shared_hash",
      status: "active",
      last_seen_at: new Date().toISOString(),
      last_sync_at: null,
    });

    expect(safe).toMatchObject({
      device_code: "BIO-FRONT",
      external_device_id: "zk-01",
      vendor: "ZKTeco",
      model: "K40",
    });
    expect(JSON.stringify(safe)).not.toContain("secret_hash");
  });

  it("uses rejected batch message first", () => {
    expect(getBiometricBatchMessage({ rejected: [{}], conflicts: [], unmatched: [] })).toBe(
      "Some biometric punches could not be processed. Please review the rejected records.",
    );
  });

  it("uses review batch message for conflicts or unmatched records", () => {
    expect(getBiometricBatchMessage({ rejected: [], conflicts: [{}], unmatched: [] })).toBe(
      "Some biometric punches need review.",
    );
    expect(getBiometricBatchMessage({ rejected: [], conflicts: [], unmatched: [{}] })).toBe(
      "Some biometric punches need review.",
    );
  });

  it("uses success batch message for accepted-only batches", () => {
    expect(getBiometricBatchMessage({ rejected: [], conflicts: [], unmatched: [] })).toBe(
      "Biometric punch batch received successfully.",
    );
  });

  it("uses original device event ID from raw payload during reprocess", () => {
    expect(
      getOriginalDeviceEventId({
        id: "bio_log_1",
        raw_payload_json: JSON.stringify({ device_event_id: "log_001" }),
      }),
    ).toBe("log_001");
  });

  it("falls back to log ID during reprocess", () => {
    expect(getOriginalDeviceEventId({ id: "bio_log_1", raw_payload_json: "{}" })).toBe(
      "bio_log_1",
    );
  });

  it("does not use dedupe key as device event ID during reprocess", () => {
    expect(
      getOriginalDeviceEventId({
        id: "bio_log_1",
        raw_payload_json: "{}",
      }),
    ).not.toContain("company_1:device_1");
  });

  it("uses locked payroll mapping message when attendance cannot be applied", () => {
    expect(
      getBiometricReprocessMessage(
        { conflict_created: true, conflict_type: "payroll_locked" },
        true,
      ),
    ).toBe(
      "Biometric user mapped, but the punch belongs to a locked payroll period and needs review.",
    );
  });

  it("uses duplicate reprocess message without implying attendance was applied", () => {
    expect(getBiometricReprocessMessage({ deduped: true })).toBe(
      "Duplicate biometric punch ignored.",
    );
  });
});

describe("biometric hardening wiring", () => {
  const root = process.cwd();
  const read = (path: string) => readFileSync(resolve(root, path), "utf8");

  it("registers the plural biometric punches endpoint for device ingestion", () => {
    expect(read("src/routes/biometric.routes.ts")).toContain('biometricRoutes.post("/punches"');
  });

  it("registers manual staged punch rejection endpoint", () => {
    expect(read("src/routes/biometric.routes.ts")).toContain('biometricRoutes.post("/logs/:id/reject"');
  });

  it("uses staged statuses for unmatched ambiguous invalid duplicate and rejected punches", () => {
    const service = read("src/modules/biometric/biometric.service.ts");
    for (const status of ["unmatched_employee", "ambiguous_employee", "invalid_timestamp", "duplicate", "rejected", "manually_resolved"]) {
      expect(service).toContain(status);
    }
  });

  it("stores accepted device punches as biometric_device attendance source", () => {
    const service = read("src/modules/biometric/biometric.service.ts");
    expect(service).toContain('attendance_method: "biometric_device"');
    expect(service).toContain('source: "biometric_device"');
  });

  it("does not return or log plaintext device token hashes in biometric responses", () => {
    const service = read("src/modules/biometric/biometric.service.ts");
    expect(service).toContain("token_shown_once");
    expect(service).not.toContain("api_token_hash:");
    expect(service).not.toContain("device_token_hash:");
  });

  it("biometric schema verifier covers hardening migration", () => {
    expect(read("scripts/verify-biometric-schema.mjs")).toContain("0035_biometric_device_hardening.sql");
  });
});

describe("biometric service behavior", () => {
  it("active biometric device can submit a punch and creates log, event, summary, sync change, and audit", async () => {
    const result = await processBiometricPunch(env, deviceContext(), punch());

    expect(result).toHaveProperty("attendance_event_id");
    expect(biometricRepository.createLog).toHaveBeenCalledWith(env, expect.objectContaining({
      biometric_user_id: "1023",
      sync_status: "pending",
      source_event_id: "txn_001",
    }));
    expect(attendanceRepository.createAttendanceEvent).toHaveBeenCalledWith(env, expect.objectContaining({
      attendance_method: "biometric_device",
      source: "biometric_device",
      device_id: "bio_device_1",
      source_device_id: "bio_device_1",
      source_event_id: "txn_001",
      local_id: "txn_001",
    }));
    const attendanceInput = vi.mocked(attendanceRepository.createAttendanceEvent).mock.calls[0][1] as any;
    expect(JSON.parse(attendanceInput.metadata_json)).toMatchObject({
      biometric_log_id: expect.any(String),
      biometric_user_id: "1023",
      verification_method: "fingerprint",
      source: "biometric_device",
      raw_punch_code: "0",
    });
    expect(rebuildDailySummary).toHaveBeenCalledWith(env, "company_1", "emp_1", "2026-06-01");
    expect(createSyncChange).toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(env, expect.objectContaining({
      action: "attendance_event_created_from_device_punch",
    }));
  });

  it("suspended and revoked biometric devices cannot submit punches", async () => {
    vi.mocked(biometricRepository.findDeviceById).mockResolvedValueOnce(biometricDevice({ status: "suspended" }) as any);
    await expect(processBiometricPunch(env, deviceContext(), punch())).rejects.toMatchObject({ code: "DEVICE_INACTIVE" });

    vi.mocked(biometricRepository.findDeviceById).mockResolvedValueOnce(biometricDevice({ status: "revoked" }) as any);
    await expect(processBiometricPunch(env, deviceContext(), punch())).rejects.toMatchObject({ code: "DEVICE_INACTIVE" });

    expect(biometricRepository.createLog).not.toHaveBeenCalled();
  });

  it("invalid and missing device tokens are rejected", async () => {
    vi.mocked(devicesRepository.findDeviceByTokenHash).mockResolvedValue(null as any);

    await expect(authenticateDevice(env, "bad-token", "req_bad")).rejects.toMatchObject({ code: "DEVICE_AUTH_FAILED" });
    await expect(authenticateDevice(env, null, "req_missing")).rejects.toMatchObject({ code: "DEVICE_TOKEN_REQUIRED" });
  });

  it("token rotation invalidates old token and returns the new token only once", async () => {
    const oldToken = "old-token";
    let currentHash = await hashToken(oldToken, env.DEVICE_TOKEN_SECRET);
    vi.mocked(devicesRepository.findDeviceByTokenHash).mockImplementation(async (_env, tokenHash) =>
      tokenHash === currentHash
        ? { id: "bio_device_1", company_id: "company_1", outlet_id: "outlet_1", device_name: "Bio", device_type: "biometric", status: "active" }
        : null as any,
    );
    vi.mocked(devicesRepository.updateDeviceToken).mockImplementation(async (_env, _companyId, _id, tokenHash) => {
      currentHash = tokenHash;
      return { success: true } as any;
    });

    const rotated = await rotateDeviceToken(env, actor, "bio_device_1", { reason: "Rotate compromised token" });

    expect(rotated.device_token).toBeTruthy();
    expect(rotated.token_shown_once).toBe(true);
    expect(devicesRepository.updateDeviceToken).toHaveBeenCalledWith(env, "company_1", "bio_device_1", expect.not.stringContaining(rotated.device_token));
    await expect(authenticateDevice(env, oldToken, "req_old")).rejects.toMatchObject({ code: "DEVICE_AUTH_FAILED" });
    await expect(authenticateDevice(env, rotated.device_token, "req_new")).resolves.toMatchObject({ deviceId: "bio_device_1" });
  });

  it("registration stores token hashes only and returns raw token once", async () => {
    const result = await registerDevice(env, actor, {
      outlet_id: "outlet_1",
      device_name: "Front Door",
      device_serial: "SN999",
      device_type: "biometric",
      sync_mode: "push_api",
    });

    expect(result.device_token).toBeTruthy();
    expect(result.token_shown_once).toBe(true);
    expect(biometricRepository.createDevice).toHaveBeenCalledWith(
      env,
      expect.any(String),
      "company_1",
      expect.any(Object),
      expect.not.stringContaining(result.device_token),
      "user_admin",
    );
    expect(devicesRepository.createDevice).toHaveBeenCalledWith(env, expect.objectContaining({
      deviceType: "biometric",
      tokenHash: expect.not.stringContaining(result.device_token),
    }));
  });

  it("unmatched biometric user creates unmatched_employee staged log", async () => {
    vi.mocked(biometricRepository.findMappingsByBiometricUserId).mockResolvedValue([]);

    const result = await processBiometricPunch(env, deviceContext(), punch());

    expect(result).toMatchObject({ unmatched: true });
    expect(biometricRepository.updateLogStatus).toHaveBeenCalledWith(env, "company_1", expect.any(String), "unmatched_employee", null);
    expect(attendanceRepository.createAttendanceEvent).not.toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(env, expect.objectContaining({ action: "biometric_unmatched_user" }));
  });

  it("ambiguous employee match creates ambiguous_employee staged log", async () => {
    vi.mocked(biometricRepository.findMappingsByBiometricUserId).mockResolvedValue([
      biometricMapping({ employee_id: "emp_1" }),
      biometricMapping({ id: "bio_map_2", employee_id: "emp_2" }),
    ] as any);

    const result = await processBiometricPunch(env, deviceContext(), punch());

    expect(result).toMatchObject({ ambiguous: true });
    expect(biometricRepository.updateLogStatus).toHaveBeenCalledWith(env, "company_1", expect.any(String), "ambiguous_employee", null);
    expect(attendanceRepository.createAttendanceEvent).not.toHaveBeenCalled();
  });

  it("future timestamp creates invalid_timestamp staged log", async () => {
    const result = await processBiometricPunch(env, deviceContext(), punch({ event_time: "2099-01-01T08:00:00.000Z" }));

    expect(result).toMatchObject({ invalid_timestamp: true });
    expect(biometricRepository.updateLogStatus).toHaveBeenCalledWith(env, "company_1", expect.any(String), "invalid_timestamp", "emp_1");
    expect(attendanceRepository.createAttendanceEvent).not.toHaveBeenCalled();
  });

  it("duplicate by dedupe key returns safe success and does not create duplicate attendance event", async () => {
    vi.mocked(biometricRepository.findLogByDedupeKey).mockResolvedValue({
      id: "bio_log_existing",
      outlet_id: "outlet_1",
      employee_id: "emp_1",
    } as any);

    const result = await processBiometricPunch(env, deviceContext(), punch());

    expect(result).toMatchObject({ deduped: true, already_accepted: true });
    expect(biometricRepository.createLog).not.toHaveBeenCalled();
    expect(attendanceRepository.createAttendanceEvent).not.toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(env, expect.objectContaining({ action: "biometric_log_deduped" }));
  });

  it("duplicate by same event type and time is audited and not applied twice", async () => {
    vi.mocked(attendanceRepository.listEventsForDate).mockResolvedValue([{ event_type: "clock_in", event_time: "2026-06-01T08:01:00.000Z" }] as any);

    const result = await processBiometricPunch(env, deviceContext(), punch());

    expect(result).toMatchObject({ deduped: true });
    expect(biometricRepository.updateLogStatus).toHaveBeenCalledWith(env, "company_1", expect.any(String), "duplicate", "emp_1");
    expect(attendanceRepository.createAttendanceEvent).not.toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(env, expect.objectContaining({ action: "biometric_duplicate_punch_received" }));
  });

  it("manual map/link of unmatched punch preserves resolution metadata and creates attendance event", async () => {
    vi.mocked(biometricRepository.findLogById).mockResolvedValue({
      id: "bio_log_1",
      company_id: "company_1",
      device_id: "bio_device_1",
      outlet_id: "outlet_1",
      biometric_user_id: "1023",
      employee_id: null,
      event_time: "2026-06-01T08:01:00.000Z",
      event_type: "clock_in",
      verification_method: "fingerprint",
      raw_payload_json: JSON.stringify({ device_event_id: "txn_001", source: "push_api" }),
      dedupe_key: "dedupe",
      sync_status: "unmatched_employee",
    } as any);
    vi.mocked(biometricRepository.findMapping).mockResolvedValue(biometricMapping() as any);

    const result = await mapUnmatchedLog(env, actor, "bio_log_1", { employee_id: "emp_1", reason: "Matched employee" });

    expect(result).toHaveProperty("attendance_event_id");
    expect(biometricRepository.resolveLog).toHaveBeenCalledWith(env, "company_1", "bio_log_1", expect.objectContaining({
      status: "manually_resolved",
      employeeId: "emp_1",
      actorId: "user_admin",
      reason: "Matched employee",
    }));
    expect(attendanceRepository.createAttendanceEvent).toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(env, expect.objectContaining({ action: "biometric_punch_manually_linked" }));
  });

  it("reject staged punch requires reason validation and never applies attendance", async () => {
    expect(() => validateBiometricReasonInput({ reason: "" })).toThrow("A reason is required for this action.");
    vi.mocked(biometricRepository.findLogById).mockResolvedValue({
      id: "bio_log_1",
      company_id: "company_1",
      device_id: "bio_device_1",
      outlet_id: "outlet_1",
      biometric_user_id: "1023",
      employee_id: null,
      event_time: "2026-06-01T08:01:00.000Z",
      event_type: "clock_in",
      sync_status: "unmatched_employee",
    } as any);

    const result = await rejectBiometricLog(env, actor, "bio_log_1", { reason: "Device user is unknown" });

    expect(result).toEqual({ rejected: true });
    expect(biometricRepository.resolveLog).toHaveBeenCalledWith(env, "company_1", "bio_log_1", expect.objectContaining({
      status: "rejected",
      reason: "Device user is unknown",
    }));
    expect(attendanceRepository.createAttendanceEvent).not.toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(env, expect.objectContaining({ action: "biometric_punch_rejected" }));
  });

  it("reprocessing a rejected punch is blocked", async () => {
    vi.mocked(biometricRepository.findLogById).mockResolvedValue({
      id: "bio_log_1",
      company_id: "company_1",
      device_id: "bio_device_1",
      outlet_id: "outlet_1",
      biometric_user_id: "1023",
      employee_id: null,
      event_time: "2026-06-01T08:01:00.000Z",
      event_type: "clock_in",
      sync_status: "rejected",
    } as any);

    await expect(reprocessBiometricLog(env, actor, "bio_log_1", { reason: "Try again" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(attendanceRepository.createAttendanceEvent).not.toHaveBeenCalled();
  });

  it("bridge batch accepts only approved local bridge devices", async () => {
    vi.mocked(biometricRepository.findDeviceById).mockResolvedValue(biometricDevice({ device_type: "bridge", sync_mode: "local_bridge" }) as any);

    const result = await processBatch(env, deviceContext({ deviceType: "bridge" }), {
      batch_id: "batch_1",
      logs: [punch()],
    }, "bridge");

    expect(result.accepted).toHaveLength(1);

    vi.mocked(biometricRepository.findDeviceById).mockResolvedValueOnce(biometricDevice({ device_type: "biometric", sync_mode: "push_api" }) as any);
    await expect(processBatch(env, deviceContext({ deviceType: "biometric" }), {
      batch_id: "batch_2",
      logs: [punch()],
    }, "bridge")).rejects.toMatchObject({ code: "DEVICE_NOT_ALLOWED" });
  });

  it("push API accepts only approved biometric push devices", async () => {
    await expect(processBiometricPunch(env, deviceContext({ deviceType: "biometric" }), punch())).resolves.toHaveProperty("attendance_event_id");

    vi.mocked(biometricRepository.findDeviceById).mockResolvedValueOnce(biometricDevice({ device_type: "kiosk", sync_mode: "push_api" }) as any);
    await expect(processBiometricPunch(env, deviceContext({ deviceType: "kiosk" }), punch())).rejects.toMatchObject({ code: "DEVICE_NOT_ALLOWED" });

    vi.mocked(biometricRepository.findDeviceById).mockResolvedValueOnce(biometricDevice({ device_type: "mobile", sync_mode: "push_api" }) as any);
    await expect(processBatch(env, deviceContext({ deviceType: "mobile" }), { batch_id: "batch_3", logs: [punch()] }, "push_api"))
      .rejects.toMatchObject({ code: "DEVICE_NOT_ALLOWED" });
  });

  it("suspend and revoke actions are audited", async () => {
    await setDeviceStatus(env, actor, "bio_device_1", "suspended", { reason: "Maintenance" });
    await setDeviceStatus(env, actor, "bio_device_1", "revoked", { reason: "Compromised" });

    expect(biometricRepository.updateDeviceStatus).toHaveBeenCalledWith(env, "company_1", "bio_device_1", "suspended", "user_admin", "Maintenance");
    expect(biometricRepository.updateDeviceStatus).toHaveBeenCalledWith(env, "company_1", "bio_device_1", "revoked", "user_admin", "Compromised");
    expect(createAuditLog).toHaveBeenCalledWith(env, expect.objectContaining({ action: "biometric_device_suspended" }));
    expect(createAuditLog).toHaveBeenCalledWith(env, expect.objectContaining({ action: "biometric_device_revoked" }));
  });
});
