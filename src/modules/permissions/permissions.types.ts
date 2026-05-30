import type { AuthActor } from "../../types/api.types";

export interface RoleRecord {
  id: string;
  role_key: string;
  role_name: string;
}

export interface PermissionOverrideRecord {
  permission_key: string;
  is_allowed: number;
}

export interface EmployeeOutletRecord {
  id: string;
  primary_outlet_id: string | null;
}

export type PermissionContext = AuthActor;
