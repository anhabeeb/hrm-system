import type { CurrentUser } from "@/types/auth";

export interface LoginInput {
  identifier: string;
  email?: string;
  password: string;
  remember_me?: boolean;
  totp_code?: string;
  backup_code?: string;
}

export interface LoginResult {
  user?: CurrentUser;
  two_factor_required?: boolean;
  challenge_id?: string;
  method?: "totp" | string;
  token?: string;
}

export interface MeResult {
  user: CurrentUser;
  roles: string[];
  permissions: string[];
  features?: string[];
  payroll_subfeatures?: Record<string, boolean | undefined>;
  attendance_subfeatures?: Record<string, boolean | undefined>;
  outlet_ids: string[];
}
