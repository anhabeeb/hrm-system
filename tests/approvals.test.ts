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
  it("requires a reason for approval actions", () => {
    expect(() => validateApprovalAction({})).toThrow(ValidationError);
    expect(validateApprovalAction({ reason: "Reviewed and approved" }).reason).toBe("Reviewed and approved");
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
    await expect(applyApprovedTargetChange({} as Env, {
      module: "payroll",
      entity_type: "payroll_run",
      entity_id: "pay_1",
    })).resolves.toEqual({
      target_update_applied: false,
      target_update_note: "The approval was recorded. The target module must apply the approved change.",
    });
  });
});

describe("approval workflow engine placeholders", () => {
  it.todo("disabled approval mode returns a direct-action result");
  it.todo("auto_admin_superadmin allows direct action for Admin or Super Admin");
  it.todo("full_workflow creates approval_request rows");
  it.todo("approval list is paginated and outlet-filtered");
  it.todo("approval detail applies outlet access");
  it.todo("approve advances current step when more steps are required");
  it.todo("approve completes request on final step");
  it.todo("reject completes request without mutating target business records unsafely");
  it.todo("return records a returned status and audit log");
  it.todo("override is Super Admin only and requires reason");
  it.todo("terminal approval requests cannot be approved again");
  it.todo("requesters cannot approve their own approval requests");
  it.todo("wrong step or role receives a friendly waiting-step message");
  it.todo("workflow create/update/enable/disable creates audit logs");
  it.todo("workflow step create/update/delete creates audit logs");
  it.todo("threshold create/update/enable/disable creates history and audit logs");
  it.todo("approval realtime placeholders do not include sensitive payload data");
  it.todo("device-authenticated callers cannot access approvals routes");
  it.todo("approval routes use seeded permission keys only");
  it.todo("workflow enable works with approval_workflows.manage");
  it.todo("step create works with approval_workflows.manage");
  it.todo("step list works with approval_workflows.view");
  it.todo("threshold update works with approval_thresholds.edit");
  it.todo("threshold history works with approval_thresholds.view");
  it.todo("eligible step approver can view no-outlet approval");
  it.todo("eligible step approver can act on no-outlet approval");
  it.todo("unrelated user cannot view no-outlet approval");
  it.todo("requester can view own no-outlet approval");
  it.todo("outlet-specific approval still enforces outlet access");
  it.todo("workflow_key change requires reason");
  it.todo("module change requires reason");
  it.todo("approval_mode change requires reason");
  it.todo("is_enabled change requires reason");
  it.todo("workflow_key rename blocked with open requests");
  it.todo("duplicate step_order blocked on create");
  it.todo("duplicate step_order blocked on update");
  it.todo("unique step_order allowed");
  it.todo("approval request stores threshold metadata when amount matches");
  it.todo("threshold role and permission affect can_approve");
  it.todo("threshold currency matching works");
  it.todo("no threshold match falls back to workflow steps");
  it.todo("approve does not update status if audit fails");
  it.todo("reject does not update status if audit fails");
  it.todo("return does not update status if audit fails");
  it.todo("override does not update status if audit fails");
  it.todo("asset deduction locked payroll is blocked by target module");
  it.todo("payroll approval request does not lock payroll from approval engine");
  it.todo("document payload does not expose file_key");
  it.todo("wrangler worker name is hrm-system");
  it.todo("wrangler D1 database_id is 59ded11f-6298-4b0b-9970-6000fbd0dca1");
  it.todo("wrangler ENVIRONMENT is production");
  it.todo("wrangler DOCUMENTS_BUCKET binding exists");
  it.todo("wrangler BACKUP_BUCKET binding exists");
});
