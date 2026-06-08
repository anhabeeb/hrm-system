import { describe, expect, it } from "vitest";

import { validateAssetCreate, validateAssetUpdate, validateDeductionRequest } from "../src/modules/assets/assets.validators";
import { AppError, ValidationError } from "../src/utils/errors";

describe("asset validators", () => {
  it("requires integer minor units for deduction requests", () => {
    expect(() => validateDeductionRequest({ amount: 10.5, reason: "Lost asset" })).toThrow(ValidationError);
  });

  it("blocks status changes through general patch", () => {
    expect(() => validateAssetUpdate({ status: "lost" })).toThrow(AppError);
  });

  it("validates asset create basics", () => {
    expect(validateAssetCreate({ asset_code: "LAP-001", asset_name: "Laptop", asset_type: "electronics" }).asset_code).toBe("LAP-001");
  });
});


