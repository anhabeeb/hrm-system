import { describe, expect, it } from "vitest";

import {
  validateDeviceListFilters,
  validateDeviceReasonInput,
  validateDeviceRegisterInput,
  validateDeviceUpdateInput,
  validateHeartbeatInput,
} from "../src/modules/devices/devices.validators";

describe("device validators", () => {
  it("accepts admin device registration input", () => {
    const input = validateDeviceRegisterInput({
      outlet_id: "outlet_1",
      device_name: "Front Desk Kiosk",
      device_type: "kiosk",
    });

    expect(input.device_type).toBe("kiosk");
  });

  it("does not allow direct device token hash editing", () => {
    expect(() =>
      validateDeviceUpdateInput({
        device_token_hash: "hash_should_not_be_allowed",
      }),
    ).toThrow("Device token changes must be made through the rotate token action.");
  });

  it("does not allow status changes through general device update", () => {
    expect(() =>
      validateDeviceUpdateInput({
        status: "disabled",
      }),
    ).toThrow("Device status changes must be made through the enable or disable action.");
  });

  it("does not allow heartbeat timestamps through general device update", () => {
    expect(() =>
      validateDeviceUpdateInput({
        last_seen_at: "2026-06-01T08:00:00Z",
      }),
    ).toThrow("Device status changes must be made through the enable or disable action.");
  });

  it("requires reason for sensitive device actions", () => {
    expect(() => validateDeviceReasonInput({ reason: "" })).toThrow(
      "A reason is required for this action.",
    );
  });

  it("accepts heartbeat health fields", () => {
    const input = validateHeartbeatInput({
      health_status: "online",
      pending_count: 2,
      failed_count: 0,
      conflict_count: 1,
      battery_level: 88,
    });

    expect(input.health_status).toBe("online");
    expect(input.pending_count).toBe(2);
  });

  it("defaults device list pagination for table views", () => {
    const filters = validateDeviceListFilters({});
    expect(filters.page).toBe(1);
    expect(filters.page_size).toBe(25);
  });
});

describe("device management placeholders", () => {
  it.todo("device registration stores token hash only");
  it.todo("raw token is returned only once");
  it.todo("device list does not expose token hash");
  it.todo("disabled device cannot sync");
  it.todo("rotate token stores new hash and returns raw token once");
  it.todo("heartbeat updates health logs");
  it.todo("heartbeat creates device_heartbeat_received audit log");
  it.todo("device health list applies outlet access");
  it.todo("enable endpoint can change status with reason");
  it.todo("disable endpoint can change status with reason");
  it.todo("device cannot access payroll, documents, settings, users, or reports");
  it.todo("user-friendly sync and disabled-device messages are returned");
});
