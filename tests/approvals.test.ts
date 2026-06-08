import { describe, expect, it } from "vitest";

import { applyApprovedTargetChange } from "../src/modules/approvals/approval-integration.service";
import {
  validateApprovalAction,
  validateOverrideAction,
  validateStepInput,
  validateThresholdInput,
} from "../src/modules/approvals/approvals.validators";
import { assertApprovalIsActionable, assertNotSelfApproval } from "../src/modules/approvals/approval-action.service";
import { canActorApproveStep } from "../src/modules/approvals/approval-step.service";
import { AppError, ValidationError } from "../src/utils/errors";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const actor = {
  companyId: "company_1",
  actorUserId: "user_1",
  fullName: "Approver",
  email: "approver@example.com",
  roles: ["HR"],
  roleKeys: ["hr_admin"],
  permissions: ["approvals.approve", "leave.approve"],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: false,
  ipAddress: null,
  userAgent: null,
};

describe("approval validators and guards", () => {
  it("lets service settings decide whether approval actions require a reason", () => {
    const service = readFileSync(resolve(process.cwd(), "src/modules/approvals/approvals.service.ts"), "utf8");

    expect(validateApprovalAction({}).reason).toBeNull();
    expect(validateApprovalAction({ reason: "Reviewed and approved" }).reason).toBe("Reviewed and approved");
    expect(service).toContain("assertReasonPolicy");
    expect(service).toContain("require_reason_for_approval");
    expect(service).toContain("require_reason_for_rejection");
  });

  it("validates override decision values", () => {
    expect(() => validateOverrideAction({ decision: "skip", reason: "Owner override" })).toThrow(ValidationError);
    expect(validateOverrideAction({ decision: "approve", reason: "Owner override" }).decision).toBe("approve");
  });

  it("blocks terminal approval actions", () => {
    expect(() => assertApprovalIsActionable("approved")).toThrow(AppError);
  });

  it("blocks self approval", () => {
    expect(() => assertNotSelfApproval("user_1", "user_1")).toThrow(AppError);
  });

  it("checks current step role and permission eligibility", () => {
    expect(canActorApproveStep(actor, { step_order: 1, required_role_key: "hr_admin", required_permission_key: "leave.approve" })).toBe(true);
    expect(canActorApproveStep(actor, { step_order: 1, required_role_key: "accountant", required_permission_key: "payroll.approve" })).toBe(false);
  });

  it("applies threshold role and permission eligibility", () => {
    expect(canActorApproveStep(actor, { step_order: 1 }, {
      required_roles_json: JSON.stringify(["hr_admin"]),
      required_permissions_json: JSON.stringify(["approvals.approve"]),
    })).toBe(true);
    expect(canActorApproveStep(actor, { step_order: 1 }, {
      required_roles_json: JSON.stringify(["owner"]),
      required_permissions_json: JSON.stringify(["approvals.approve"]),
    })).toBe(false);
  });

  it("validates step amount thresholds", () => {
    expect(() => validateStepInput({ step_order: 1, step_name: "Owner Review", amount_min: 100, amount_max: 50 })).toThrow(ValidationError);
  });

  it("validates threshold amount ranges", () => {
    expect(() => validateThresholdInput({
      workflow_key: "advance_payment",
      threshold_name: "Large advance",
      threshold_type: "amount",
      amount_min: 100,
      amount_max: 50,
      reason: "Policy update",
    })).toThrow(ValidationError);
  });

  it("keeps unsafe target integration conservative", async () => {
    await expect(applyApprovedTargetChange({} as Env, actor, {
      id: "approval_1",
      module: "payroll",
      entity_type: "payroll_run",
      entity_id: "pay_1",
    })).resolves.toEqual({
      target_update_applied: false,
      target_update_note: "The approval was recorded. The target module must apply the approved change.",
    });
  });
});


