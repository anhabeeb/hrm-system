export type PermissionKey = string;
export type FeatureKey = string;

export interface CurrentUser {
  id: string;
  company_id?: string;
  employee_id?: string | null;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  status?: string;
  two_factor_enabled?: boolean;
  roles?: string[];
  permissions?: PermissionKey[];
  features?: FeatureKey[];
  outlet_ids?: string[];
  is_super_admin?: boolean;
  is_admin?: boolean;
}

export interface AuthStateSnapshot {
  user: CurrentUser | null;
  permissions: PermissionKey[];
  features: FeatureKey[];
  roles: string[];
  outletIds: string[];
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasHydrated: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  requires2FA: boolean;
}
