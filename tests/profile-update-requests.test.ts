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


