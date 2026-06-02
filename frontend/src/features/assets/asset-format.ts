import type { AssetRecord } from "./assets.types";

export const assetValue = (asset: AssetRecord) => asset.purchase_value_amount ?? asset.value_minor_units ?? 0;
export const assetHolder = (asset: AssetRecord) => asset.assigned_employee_name ?? asset.employee_name ?? asset.holder_name ?? asset.assigned_employee_id ?? "Unassigned";
