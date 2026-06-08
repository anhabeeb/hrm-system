import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthActor } from "../src/types/api.types";

const profileRepoMock = vi.hoisted(() => {
  const state = {
    request: {
      id: "req_email",
      company_id: "company_1",
      user_id: "user_1",
      employee_id: null,
      request_type: "email_update",
      old_value_json: JSON.stringify({ email: "old@example.com" }),
      requested_value_json: JSON.stringify({ email: "New.Email@Example.COM" }),
      reason: "Changing login email",
      status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      review_notes: null,
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
    },
    user: {
      id: "user_1",
      full_name: "Profile User",
      email: "old@example.com",
      phone: null,
      employee_id: null,
    },
    duplicateUser: null as { id: string; email: string | null } | null,
    updatedEmail: null as string | null,
    reviewStatus: null as string | null,
    sessionsRevoked: false,
  };

  return {
    state,
    countRequests: vi.fn(async () => 0),
    listRequests: vi.fn(async () => []),
    findRequestById: vi.fn(async (_env: Env, companyId: string, id: string) =>
      state.request.company_id === companyId && state.request.id === id ? state.request : null,
    ),
    updateReviewStatus: vi.fn(async (_env: Env, _companyId: string, _id: string, status: string) => {
      state.reviewStatus = status;
      state.request.status = status as typeof state.request.status;
    }),
    findUser: vi.fn(async () => state.user),
    findUserByEmail: vi.fn(async () => state.duplicateUser),
    findEmployee: vi.fn(async () => null),
    updateUserFields: vi.fn(async (_env: Env, _companyId: string, _userId: string, values: { email?: string }) => {
      state.updatedEmail = values.email ?? null;
      state.user.email = values.email ?? state.user.email;
    }),
    updateEmployeeFields: vi.fn(),
    createEmployeeDocumentMetadata: vi.fn(),
    revokeUserSessions: vi.fn(async () => {
      state.sessionsRevoked = true;
    }),
  };
});

vi.mock("../src/modules/profile-update-requests/profile-update-requests.repository", () => profileRepoMock);
vi.mock("../src/services/audit.service", () => ({
  createAuditLog: vi.fn(async () => ({ created: true, message: "Audit log recorded." })),
}));
vi.mock("../src/services/realtime.service", () => ({
  broadcastEvent: vi.fn(async () => undefined),
}));

import * as service from "../src/modules/profile-update-requests/profile-update-requests.service";

const context = (overrides: Partial<AuthActor> = {}): AuthActor => ({
  requestId: "req_test",
  companyId: "company_1",
  actorUserId: "reviewer_1",
  fullName: "Reviewer",
  email: "reviewer@example.com",
  roles: ["Super Admin"],
  roleKeys: ["super_admin"],
  permissions: [],
  outletIds: [],
  isSuperAdmin: true,
  isAdmin: true,
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
  ...overrides,
});

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  profileRepoMock.state.request.status = "pending";
  profileRepoMock.state.request.requested_value_json = JSON.stringify({ email: "New.Email@Example.COM" });
  profileRepoMock.state.user.email = "old@example.com";
  profileRepoMock.state.duplicateUser = null;
  profileRepoMock.state.updatedEmail = null;
  profileRepoMock.state.reviewStatus = null;
  profileRepoMock.state.sessionsRevoked = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("profile update email approval", () => {
  it("approves email_update by normalizing email, updating the user, and revoking sessions", async () => {
    const result = await service.approveRequest({} as Env, context(), "req_email", {
      reason: "Approved",
      review_notes: "Approved",
    });

    expect(result.approved).toBe(true);
    expect(profileRepoMock.state.updatedEmail).toBe("new.email@example.com");
    expect(profileRepoMock.state.reviewStatus).toBe("approved");
    expect(profileRepoMock.state.sessionsRevoked).toBe(true);
  });

  it("revalidates duplicate email before approval and does not update the user", async () => {
    profileRepoMock.state.duplicateUser = { id: "other_user", email: "new.email@example.com" };

    await expect(service.approveRequest({} as Env, context(), "req_email", {
      reason: "Approved",
      review_notes: "Approved",
    })).rejects.toMatchObject({
      code: "DUPLICATE_USER_EMAIL",
      message: "A user with this email already exists.",
    });

    expect(profileRepoMock.state.updatedEmail).toBeNull();
    expect(profileRepoMock.state.reviewStatus).toBeNull();
  });

  it("still enforces company scope when Super Admin reviews a request", async () => {
    await expect(service.approveRequest({} as Env, context({ companyId: "company_2" }), "req_email", {
      reason: "Approved",
      review_notes: "Approved",
    })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
