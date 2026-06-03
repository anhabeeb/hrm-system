import { describe, expect, it } from "vitest";

import { createBiometricDedupeKey } from "../src/modules/biometric/biometric-dedupe.service";
import {
  getBiometricBatchMessage,
  getBiometricReprocessMessage,
} from "../src/modules/biometric/biometric.controller";
import {
  getOriginalDeviceEventId,
  sanitizeBiometricDeviceForResponse,
} from "../src/modules/biometric/biometric.service";
import {
  validateBiometricBatchInput,
  validateBiometricDeviceUpdateInput,
  validateBiometricPunchInput,
  validateBiometricReasonInput,
} from "../src/modules/biometric/biometric.validators";
import { AppError, ValidationError } from "../src/utils/errors";

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

describe("biometric integration placeholders", () => {
  it.todo("valid punch creates biometric log");
  it.todo("valid punch creates attendance_event");
  it.todo("valid punch rebuilds daily summary");
  it.todo("valid punch creates sync_change");
  it.todo("unmatched biometric user creates unmatched log or conflict");
  it.todo("wrong outlet punch creates conflict");
  it.todo("inactive employee punch creates conflict");
  it.todo("locked payroll punch does not create attendance event");
  it.todo("duplicate punch is deduped");
  it.todo("batch processes accepted records");
  it.todo("batch returns unmatched records");
  it.todo("batch returns conflicts");
  it.todo("one bad record does not fail entire batch");
  it.todo("admin can create biometric mapping");
  it.todo("duplicate biometric_user_id per device is blocked");
  it.todo("mapping requires outlet access");
  it.todo("disabling mapping requires reason");
  it.todo("unmatched log map creates mapping and reprocesses");
  it.todo("log list is paginated and outlet-filtered");
  it.todo("log detail does not expose templates or images");
  it.todo("reprocess does not duplicate attendance events");
  it.todo("biometric device registration stores token hash only");
  it.todo("raw token returned only once");
  it.todo("enable and disable require reason");
  it.todo("disabled biometric device cannot push logs");
  it.todo("biometric device status does not expose api_token_hash");
  it.todo("biometric device status does not expose device_token_hash");
  it.todo("biometric device detail does not expose api_token_hash");
  it.todo("kiosk device cannot call biometric punch");
  it.todo("tablet device cannot call biometric punch unless approved as local_bridge or biometric");
  it.todo("active biometric device can push logs");
  it.todo("bridge batch accepts approved local_bridge device only");
  it.todo("kiosk device cannot call POST /api/v1/biometric/batch");
  it.todo("tablet or non-biometric device cannot call POST /api/v1/biometric/batch");
  it.todo("kiosk device cannot call POST /api/v1/biometric/bridge/batch");
  it.todo("local_bridge device can call POST /api/v1/biometric/bridge/batch if approved and active");
  it.todo("disabled biometric device cannot call POST /api/v1/biometric/batch");
  it.todo("batch audit is not created when device is not allowed");
  it.todo("batch logs are not processed when device is not allowed");
  it.todo("DEVICE_NOT_ALLOWED returns the friendly biometric device message");
  it.todo("DEVICE_DISABLED returns the friendly disabled device message");
  it.todo("5-30 minute drift creates warning but accepts valid punch");
  it.todo("30+ minute drift creates conflict");
  it.todo("device time warning creates audit log");
  it.todo("device time warning does not expose technical details");
  it.todo("unmatched map with locked payroll returns locked payroll message");
  it.todo("unmatched map with valid punch returns success message");
  it.todo("reprocess with conflict returns review message");
  it.todo("reprocess duplicate returns duplicate message");
  it.todo("reprocess uses original device_event_id from raw payload");
  it.todo("reprocess falls back to log.id");
  it.todo("reprocess does not use dedupe_key as device_event_id");
  it.todo("reprocess remains idempotent");
  it.todo("bridge conflict payload source is local_bridge or biometric_bridge");
  it.todo("push API conflict payload source remains push_api or biometric");
  it.todo("batch item rejects biometric image/template");
  it.todo("bridge batch rejects biometric image/template");
  it.todo("raw payload stored in logs does not include forbidden biometric fields");
  it.todo("biometric device cannot access payroll, documents, settings, users, or reports");
  it.todo("raw biometric templates and images are never stored");
  it.todo("user-friendly biometric messages are returned");
});
