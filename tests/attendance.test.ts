import { describe, expect, it } from "vitest";

import app from "../src/app";
import {
  getAttendanceDateFromEventTime,
  getPayrollMonthFromAttendanceDate,
  normalizeAttendanceDateTime,
} from "../src/modules/attendance/attendance.service";
import {
  validateManualBatchInput,
  validateManualEntryInput,
  validateReviewInput,
} from "../src/modules/attendance/attendance.validators";
import { ValidationError } from "../src/utils/errors";

describe("attendance validators", () => {
  it("manual entry requires a reason", () => {
    expect(() =>
      validateManualEntryInput({
        employee_id: "emp_1",
        outlet_id: "outlet_1",
        attendance_date: "2026-05-29",
      }),
    ).toThrow(ValidationError);
  });

  it("manual batch validates required batch envelope", () => {
    const input = validateManualBatchInput({
      outlet_id: "outlet_1",
      attendance_date: "2026-06-04",
      reason: "Manager submitted daily attendance.",
      entries: [{ employee_id: "emp_1", clock_in_time: "09:00", status: "present" }],
    });

    expect(input.outlet_id).toBe("outlet_1");
    expect(input.entries).toHaveLength(1);
  });

  it("manual batch rejects empty entries", () => {
    expect(() =>
      validateManualBatchInput({
        outlet_id: "outlet_1",
        attendance_date: "2026-06-04",
        reason: "Manager submitted daily attendance.",
        entries: [],
      }),
    ).toThrow(ValidationError);
  });

  it("manual batch maps row note into notes for row-level processing", () => {
    const input = validateManualBatchInput({
      outlet_id: "outlet_1",
      attendance_date: "2026-06-04",
      reason: "Manager submitted daily attendance.",
      entries: [{ employee_id: "emp_1", clock_in_time: "09:00", note: "Arrived after briefing." }],
    });

    expect(input.entries[0]?.notes).toBe("Arrived after briefing.");
  });

  it("manual batch enforces the maximum safe batch size", () => {
    expect(() =>
      validateManualBatchInput({
        outlet_id: "outlet_1",
        attendance_date: "2026-06-04",
        reason: "Manager submitted daily attendance.",
        entries: Array.from({ length: 101 }, (_, index) => ({
          employee_id: `emp_${index}`,
          clock_in_time: "09:00",
        })),
      }),
    ).toThrow(ValidationError);
  });

  it("manual batch supports status-only attendance rows", () => {
    const input = validateManualBatchInput({
      outlet_id: "outlet_1",
      attendance_date: "2026-06-04",
      reason: "Manager submitted daily attendance.",
      entries: [{ employee_id: "emp_1", status: "absent" }],
    });

    expect(input.entries[0]?.status).toBe("absent");
  });

  it("review actions accept notes as a user-friendly reason", () => {
    const input = validateReviewInput({ notes: "Approved after checking roster." });
    expect(input.reason).toBe("Approved after checking roster.");
  });

  it("combines attendance date with time-only clock-in values", () => {
    expect(normalizeAttendanceDateTime("2026-06-01", "08:00")).toBe(
      "2026-06-01T08:00:00+05:00",
    );
  });

  it("combines attendance date with time-only clock-out values", () => {
    expect(normalizeAttendanceDateTime("2026-06-01", "17:30")).toBe(
      "2026-06-01T17:30:00+05:00",
    );
  });

  it("rejects invalid manual attendance time values", () => {
    expect(() => normalizeAttendanceDateTime("2026-06-01", "not-a-time")).toThrow(
      "Please enter a valid attendance time.",
    );
  });

  it("gets attendance date from event time without timezone conversion surprises", () => {
    expect(getAttendanceDateFromEventTime("2026-06-30T23:00:00+05:00")).toBe(
      "2026-06-30",
    );
  });

  it("gets payroll month from attendance date", () => {
    expect(getPayrollMonthFromAttendanceDate("2026-07-01")).toBe("2026-07");
  });
});

describe("attendance routes", () => {
  it("manual batch route exists and requires authentication", async () => {
    const response = await app.request(
      "/api/v1/attendance/manual-batch",
      { method: "POST", body: JSON.stringify({}), headers: { "content-type": "application/json" } },
      { ENVIRONMENT: "local" } as Env,
    );
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(401);
    expect(body.error?.code).not.toBe("API_ROUTE_NOT_FOUND");
  });
});


