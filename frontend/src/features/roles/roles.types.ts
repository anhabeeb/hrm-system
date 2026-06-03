export interface Role {
  id: string;
  role_key: string;
  role_name: string;
  description?: string | null;
  is_system_role?: number | boolean;
  is_active?: number | boolean;
  users_count?: number;
  permissions?: Permission[];
}

export interface Permission {
  id?: string;
  permission_key: string;
  module: string;
  action?: string;
  description?: string | null;
}
