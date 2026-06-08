import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../src/services/audit.service", () => ({
  createAuditLog: vi.fn(async () => ({ created: true })),
}));

vi.mock("../src/services/realtime.service", () => ({
  broadcastEvent: vi.fn(async () => undefined),
}));

vi.mock("../src/modules/devices/devices.repository", () => ({
  countDevices: vi.fn(async () => 0),
  listDevices: vi.fn(async () => []),
  findDeviceById: vi.fn(),
  findDeviceByTokenHash: vi.fn(),
  findActiveOutlet: vi.fn(),
  createDevice: vi.fn(async () => ({ success: true })),
  createDeviceSyncState: vi.fn(async () => ({ success: true })),
  updateDevice: vi.fn(async () => ({ success: true })),
  updateDeviceStatus: vi.fn(async () => ({ success: true })),
  updateDeviceToken: vi.fn(async () => ({ success: true })),
  touchDevice: vi.fn(async () => ({ success: true })),
  listHealthLogs: vi.fn(async () => []),
  healthSummary: vi.fn(async () => []),
}));

import * as repository from "../src/modules/devices/devices.repository";
import {
  disableDevice,
  enableDevice,
  getDevice,
  listDevices,
  registerDevice,
  rotateToken,
} from "../src/modules/devices/devices.service";
import {
  validateDeviceListFilters,
  validateDeviceReasonInput,
  validateDeviceRegisterInput,
  validateDeviceUpdateInput,
  validateHeartbeatInput,
} from "../src/modules/devices/devices.validators";
import { createAuditLog } from "../src/services/audit.service";
import { authenticateDevice } from "../src/services/device-auth.service";
import type { AuthActor } from "../src/types/api.types";
import { hashToken } from "../src/utils/crypto";

const env = { DEVICE_TOKEN_SECRET: "device-test-secret" } as Env;

const actor: AuthActor = {
  companyId: "company_1",
  actorUserId: "user_admin",
  fullName: "Admin",
  email: "admin@example.test",
  roles: ["Admin"],
  roleKeys: ["admin"],
  permissions: ["devices.manage", "devices.view", "devices.revoke"],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: true,
  ipAddress: null,
  userAgent: null,
};

const deviceRow = (overrides: Record<string, unknown> = {}) => ({
  id: "device_1",
  company_id: "company_1",
  outlet_id: "outlet_1",
  device_name: "Front Desk Kiosk",
  device_type: "kiosk",
  device_token_hash: "stored_hash",
  status: "active",
  last_seen_at: null,
  last_sync_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const resetDeviceMocks = () => {
  vi.mocked(repository.findActiveOutlet).mockResolvedValue({ id: "outlet_1", status: "active" } as any);
  vi.mocked(repository.findDeviceById).mockResolvedValue(deviceRow() as any);
  vi.mocked(repository.countDevices).mockResolvedValue(1);
  vi.mocked(repository.listDevices).mockResolvedValue([
    {
      id: "device_1",
      company_id: "company_1",
      outlet_id: "outlet_1",
      device_name: "Front Desk Kiosk",
      device_type: "kiosk",
      status: "active",
      last_seen_at: null,
      last_sync_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      outlet_name: "Main Outlet",
    },
  ] as any);
  vi.mocked(repository.findDeviceByTokenHash).mockResolvedValue(deviceRow() as any);
};

beforeEach(() => {
  vi.clearAllMocks();
  resetDeviceMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("device validators", () => {
  it("accepts admin device registration input", () => {
    const input = validateDeviceRegisterInput({
      outlet_id: "outlet_1",
      device_name: "Front Desk Kiosk",
      device_type: "kiosk",
    });

    expect(input.device_type).toBe("kiosk");
  });

  it("accepts hardened biometric and bridge device types", () => {
    expect(validateDeviceRegisterInput({
      outlet_id: "outlet_1",
      device_name: "Biometric Bridge",
      device_type: "bridge",
    }).device_type).toBe("bridge");
    expect(validateDeviceRegisterInput({
      outlet_id: "outlet_1",
      device_name: "Main biometric",
      device_type: "biometric",
    }).device_type).toBe("biometric");
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

describe("device authentication hardening wiring", () => {
  const root = process.cwd();
  const read = (path: string) => readFileSync(resolve(root, path), "utf8");

  it("uses explicit token required and auth failed errors", () => {
    const service = read("src/services/device-auth.service.ts");
    expect(service).toContain("DEVICE_TOKEN_REQUIRED");
    expect(service).toContain("DEVICE_AUTH_FAILED");
  });

  it("blocks inactive device requests with Phase 8C device code", () => {
    expect(read("src/services/device-auth.service.ts")).toContain("DEVICE_INACTIVE");
  });

  it("keeps shared device token hash out of list queries", () => {
    const repository = read("src/modules/devices/devices.repository.ts");
    expect(repository).toContain('Omit<DeviceRecord, "device_token_hash">');
  });
});

describe("device management behavior", () => {
  it("device registration stores token hash only and returns raw token once", async () => {
    const result = await registerDevice(env, actor, {
      outlet_id: "outlet_1",
      device_name: "Front Desk Kiosk",
      device_type: "kiosk",
      reason: "Initial device registration",
    });

    expect(result.device_token).toBeTruthy();
    expect(result.token_shown_once).toBe(true);
    expect(repository.createDevice).toHaveBeenCalledWith(env, expect.objectContaining({
      tokenHash: expect.any(String),
    }));
    const input = vi.mocked(repository.createDevice).mock.calls[0][1] as any;
    expect(input.tokenHash).not.toBe(result.device_token);
    expect(input).not.toHaveProperty("device_token");
    expect(createAuditLog).toHaveBeenCalledWith(env, expect.objectContaining({
      action: "device_registered",
    }));
  });

  it("device list/detail do not expose token hash", async () => {
    const list = await listDevices(env, actor, validateDeviceListFilters({}));
    const detail = await getDevice(env, actor, "device_1");

    expect(JSON.stringify(list)).not.toContain("stored_hash");
    expect(detail).not.toHaveProperty("device_token_hash");
    expect(JSON.stringify(detail)).not.toContain("stored_hash");
  });

  it("disabled device cannot authenticate or sync", async () => {
    vi.mocked(repository.findDeviceByTokenHash).mockResolvedValue(deviceRow({ status: "disabled" }) as any);

    await expect(authenticateDevice(env, "valid-looking-token", "req_device")).rejects.toMatchObject({
      code: "DEVICE_INACTIVE",
    });
    expect(repository.touchDevice).not.toHaveBeenCalled();
  });

  it("rotate token stores new hash, returns raw token once, and invalidates old token", async () => {
    const oldToken = "old-device-token";
    let currentHash = await hashToken(oldToken, env.DEVICE_TOKEN_SECRET);
    vi.mocked(repository.findDeviceByTokenHash).mockImplementation(async (_env, hash) =>
      hash === currentHash ? deviceRow() as any : null,
    );
    vi.mocked(repository.updateDeviceToken).mockImplementation(async (_env, _companyId, _deviceId, nextHash) => {
      currentHash = nextHash;
      return { success: true } as any;
    });

    const result = await rotateToken(env, actor, "device_1", { reason: "Scheduled rotation" });

    expect(result.device_token).toBeTruthy();
    expect(result.token_shown_once).toBe(true);
    expect(repository.updateDeviceToken).toHaveBeenCalledWith(env, "company_1", "device_1", expect.not.stringContaining(result.device_token));
    await expect(authenticateDevice(env, oldToken, "req_old")).rejects.toMatchObject({ code: "DEVICE_AUTH_FAILED" });
    await expect(authenticateDevice(env, result.device_token, "req_new")).resolves.toMatchObject({ deviceId: "device_1" });
    expect(createAuditLog).toHaveBeenCalledWith(env, expect.objectContaining({
      action: "device_token_rotated",
    }));
  });

  it("enable and disable endpoint services change status with reason and audit", async () => {
    await enableDevice(env, actor, "device_1", { reason: "Back online" });
    await disableDevice(env, actor, "device_1", { reason: "Maintenance" });

    expect(repository.updateDeviceStatus).toHaveBeenCalledWith(env, "company_1", "device_1", "active");
    expect(repository.updateDeviceStatus).toHaveBeenCalledWith(env, "company_1", "device_1", "disabled");
    expect(createAuditLog).toHaveBeenCalledWith(env, expect.objectContaining({
      action: "device_enabled",
      reason: "Back online",
    }));
    expect(createAuditLog).toHaveBeenCalledWith(env, expect.objectContaining({
      action: "device_disabled",
      reason: "Maintenance",
    }));
  });

  it("heartbeat route is device-authenticated and records health through the device health service", () => {
    const routes = readFileSync(resolve(process.cwd(), "src/routes/devices.routes.ts"), "utf8");
    const controller = readFileSync(resolve(process.cwd(), "src/modules/devices/devices.controller.ts"), "utf8");

    expect(routes).toContain('devicesRoutes.post("/:id/heartbeat", deviceAuthMiddleware');
    expect(controller).toContain("recordDeviceHeartbeat");
    expect(controller).toContain("Device heartbeat received.");
  });

  it("device health list applies outlet access through service lookup", async () => {
    await getDevice(env, actor, "device_1");

    expect(repository.findDeviceById).toHaveBeenCalledWith(env, "company_1", "device_1");
  });

  it("device auth middleware is not registered on payroll documents settings users or reports APIs", () => {
    const root = process.cwd();
    const routeFiles = [
      "src/routes/payroll.routes.ts",
      "src/routes/documents.routes.ts",
      "src/routes/settings.routes.ts",
      "src/routes/users.routes.ts",
      "src/routes/reports.routes.ts",
    ];

    for (const file of routeFiles) {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source).not.toContain("deviceAuthMiddleware");
    }
  });

  it("user-friendly sync and disabled-device messages are returned", () => {
    const auth = readFileSync(resolve(process.cwd(), "src/services/device-auth.service.ts"), "utf8");

    expect(auth).toContain("Device token is required.");
    expect(auth).toContain("Device authentication failed.");
    expect(auth).toContain("This device is inactive. Please contact your system administrator.");
  });
});
