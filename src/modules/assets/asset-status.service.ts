import { AppError, ConflictError } from "../../utils/errors";

export const assertAssetPatchAllowsOutletChange = (asset: any, nextOutletId?: string | null) => {
  if (nextOutletId !== undefined && asset.status === "issued") {
    throw new ConflictError("Please return this asset before changing its outlet.");
  }
};

export const assertAssetCanAssign = (asset: any, activeAssignment: any | null) => {
  if (!["available", "returned"].includes(asset.status) || activeAssignment) {
    throw new AppError("This asset is already assigned. Please return it before assigning again.", "ASSET_ALREADY_ASSIGNED", 409);
  }
};

export const assertAssetHasAssignment = (assignment: any | null) => {
  if (!assignment) {
    throw new AppError("This asset is not currently assigned.", "ASSET_NOT_ASSIGNED", 409);
  }
};
