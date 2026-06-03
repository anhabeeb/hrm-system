import type { CurrentUser } from "@/types/auth";

export interface LoginInput {
  email: string;
  password: string;
  totp_code?: string;
  backup_code?: string;
}

export interface LoginResult {
  user?: CurrentUser;
  two_factor_required?: boolean;
  method?: "totp" | string;
  token?: string;
}

export interface MeResult {
  user: CurrentUser;
  roles: string[];
  permissions: string[];
  features?: string[];
  outlet_ids: string[];
}
