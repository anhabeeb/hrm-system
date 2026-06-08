import { describe, expect, it } from "vitest";

import { DEFAULT_MAX_RECORDS_PER_BATCH } from "../src/modules/sync/sync.constants";
import { getSyncPushMessage } from "../src/modules/sync/sync.controller";
import {
  assertSupportedSyncItem,
  validateConflictResolveInput,
  validateForceResyncInput,
  validateSyncPullQuery,
  validateSyncPushInput,
} from "../src/modules/sync/sync.validators";
import { ValidationError } from "../src/utils/errors";

describe("sync validators", () => {
  it("accepts a valid offline attendance batch", () => {
    const input = validateSyncPushInput({
      batch_id: "batch_001",
      outlet_id: "outlet_1",
      events: [
        {
          local_id: "local_001",
          entity_type: "attendance",
          action_type: "clock_in",
          employee_id: "emp_1",
          event_time: "2026-06-01T08:01:00+05:00",
          attendance_method: "pin",
        },
      ],
    });

    expect(input.events[0]?.created_offline).toBe(true);
    expect(input.events[0]?.attendance_method).toBe("pin");
  });

  it("enforces max records per batch", () => {
    expect(() =>
      validateSyncPushInput(
        {
          batch_id: "batch_001",
          events: Array.from({ length: DEFAULT_MAX_RECORDS_PER_BATCH + 1 }, (_, index) => ({
            local_id: `local_${index}`,
            entity_type: "attendance",
            action_type: "clock_in",
            employee_id: "emp_1",
            event_time: "2026-06-01T08:01:00+05:00",
          })),
        },
        DEFAULT_MAX_RECORDS_PER_BATCH,
      ),
    ).toThrow(ValidationError);
  });

  it("rejects unsupported sync items with a friendly message", () => {
    expect(() => assertSupportedSyncItem("payroll", "lock")).toThrow(
      "This offline record type is not supported yet.",
    );
  });

  it("defaults pull sync token to zero and safe include groups", () => {
    const query = validateSyncPullQuery({});
    expect(query.since).toBe(0);
    expect(query.include).toContain("employees");
    expect(query.include).toContain("attendance");
    expect(query.include).toContain("settings");
  });

  it("requires a reason for conflict resolution", () => {
    expect(() => validateConflictResolveInput({ resolution: "accept" })).toThrow(
      "A reason is required for this action.",
    );
  });

  it("requires a reason for force resync", () => {
    expect(() =>
      validateForceResyncInput({
        device_id: "device_1",
      }),
    ).toThrow("A reason is required for this action.");
  });

  it("uses a clear sync message when records are rejected without conflicts", () => {
    expect(getSyncPushMessage({ rejected: [{}], conflicts: [] })).toBe(
      "Some records could not be synced. Please review the rejected records.",
    );
  });

  it("uses the review-needed message when conflicts are present", () => {
    expect(getSyncPushMessage({ rejected: [], conflicts: [{}] })).toBe(
      "Some records need review before they can be applied.",
    );
  });

  it("uses the success message when all records are accepted or deduped", () => {
    expect(getSyncPushMessage({ rejected: [], conflicts: [] })).toBe(
      "Sync completed successfully.",
    );
  });
});


