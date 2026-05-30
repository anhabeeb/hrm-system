import { describe, expect, it } from "vitest";

import { countInclusiveDays } from "../src/modules/leave/leave-calendar.service";
import {
  validateBalanceAdjust,
  validateLeaveRequestCreate,
  validateLeaveTypeUpdate,
} from "../src/modules/leave/leave.validators";
import { ValidationError } from "../src/utils/errors";

describe("leave validators and helpers", () => {
  it("counts inclusive leave days", () => {
    expect(countInclusiveDays("2026-06-01", "2026-06-05")).toBe(5);
  });

  it("rejects invalid leave date ranges", () => {
    expect(() =>
      validateLeaveRequestCreate({
        employee_id: "emp_1",
        leave_type_id: "leave_annual",
        start_date: "2026-06-05",
        end_date: "2026-06-01",
      }),
    ).toThrow(ValidationError);
  });

  it("requires reason for leave type updates", () => {
    expect(() => validateLeaveTypeUpdate({ is_enabled: false })).toThrow(ValidationError);
  });

  it("requires reason for balance adjustments", () => {
    expect(() =>
      validateBalanceAdjust({
        leave_type_id: "leave_annual",
        year: 2026,
        adjustment_days: 2,
      }),
    ).toThrow(ValidationError);
  });
});

describe("leave module placeholders", () => {
  it.todo("statutory leave can be disabled by authorized user");
  it.todo("disabled leave type cannot be used for new leave");
  it.todo("historical leave records remain viewable");
  it.todo("create leave request");
  it.todo("leave request above trigger creates long_leave_record");
  it.todo("leave approval above trigger creates long_leave_record if missing");
  it.todo("duplicate long_leave_record is not created for same leave_request");
  it.todo("below-trigger leave does not create long_leave_record");
  it.todo("long_leave disabled does not create long_leave_record");
  it.todo("updating leave above trigger creates long_leave_record");
  it.todo("updating leave above trigger avoids duplicate long_leave_record");
  it.todo("updating leave below trigger does not create long_leave_record");
  it.todo("long_leave disabled does not create long_leave_record on update");
  it.todo("approval required creates approval_request");
  it.todo("leave_requests.approval_request_id is set");
  it.todo("approvals disabled does not create approval_request");
  it.todo("auto_admin_superadmin direct approval does not create approval_request if user can directly approve");
  it.todo("long leave creation creates approval_request when required");
  it.todo("reject overlapping leave");
  it.todo("reject insufficient balance");
  it.todo("approval disabled mode allows direct approval by Admin or Super Admin");
  it.todo("approve leave updates balance");
  it.todo("reject leave does not update balance");
  it.todo("cancel approved leave restores balance");
  it.todo("leave affecting locked payroll is blocked");
  it.todo("outlet manager cannot access another outlet's leave");
  it.todo("balance adjustment creates audit log");
  it.todo("holidays are excluded when setting says exclude");
  it.todo("holidays are excluded when exclude_holidays_from_leave is enabled in holiday_settings");
  it.todo("holidays are ignored when holiday_module_enabled is disabled");
  it.todo("holidays are ignored when holiday_leave_rules_enabled is disabled");
  it.todo("disabled public, company, or other holiday types do not affect leave days");
  it.todo("missing holiday_settings uses safe default");
  it.todo("holidays are ignored when holidays are disabled");
  it.todo("leave list totals are outlet-filtered");
  it.todo("audit logs are created for sensitive leave actions");
});
