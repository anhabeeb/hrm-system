import { describe, expect, it } from "vitest";

import {
  assertAllowedRequestType,
  validateReviewInput,
} from "../src/modules/profile-update-requests/profile-update-requests.validators";
import { ValidationError } from "../src/utils/errors";

describe("profile update request validators", () => {
  it("accepts review notes as the required review reason", () => {
    const input = validateReviewInput({
      review_notes: "Approved after checking documents.",
    });

    expect(input.reason).toBe("Approved after checking documents.");
  });

  it("rejects role, permission, and outlet access request types", () => {
    expect(() => assertAllowedRequestType("role")).toThrow(ValidationError);
    expect(() => assertAllowedRequestType("permission")).toThrow(ValidationError);
    expect(() => assertAllowedRequestType("outlet_access")).toThrow(ValidationError);
  });

  it("allows address update request type for manual HR follow-up handling", () => {
    expect(() => assertAllowedRequestType("address_update")).not.toThrow();
  });
});

describe("profile update request placeholders", () => {
  it.todo("admin can list profile update requests");
  it.todo("approve request applies safe user and employee changes");
  it.todo("reject request does not change employee or user data");
  it.todo("returned request status works");
  it.todo("user cannot approve own request unless Super Admin");
  it.todo("address_update approval records manual follow-up when no address field exists");
  it.todo("audit logs are created for review decisions");
});
