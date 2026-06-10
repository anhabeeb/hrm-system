export interface AccessLevelRecord {
  id: string;
  company_id: string | null;
  level: number;
  name: string;
  description: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface LevelRoleTemplateRecord {
  id: string;
  company_id: string;
  level: number;
  department_id: string | null;
  department_name?: string | null;
  position_id: string | null;
  position_title?: string | null;
  role_id: string;
  role_name?: string | null;
  role_key?: string | null;
  is_default: number;
  is_required: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
}

export interface LevelRoleTemplateInput {
  level: number;
  department_id?: string | null;
  position_id?: string | null;
  role_id: string;
  is_default?: boolean;
  is_required?: boolean;
}

export interface LevelRoleTemplateFilters {
  level?: number;
  department_id?: string;
  position_id?: string;
  role_id?: string;
  page: number;
  page_size: number;
}

export interface EmployeeStructureRecord {
  employee_id: string;
  employee_code: string;
  full_name: string;
  primary_outlet_id: string | null;
  department_id: string | null;
  department_name: string | null;
  position_id: string | null;
  position_title: string | null;
  level: number | null;
  structure_updated_at: string | null;
  structure_updated_by: string | null;
  linked_user_id: string | null;
}

export interface EmployeeStructureInput {
  department_id: string;
  position_id: string;
  reason?: string | null;
  effective_from?: string | null;
}

export interface EmployeeStructureHistoryRecord {
  id: string;
  company_id: string;
  employee_id: string;
  previous_department_id: string | null;
  previous_department_name?: string | null;
  previous_position_id: string | null;
  previous_position_title?: string | null;
  previous_level: number | null;
  new_department_id: string;
  new_department_name?: string | null;
  new_position_id: string;
  new_position_title?: string | null;
  new_level: number;
  reason: string | null;
  effective_from: string;
  effective_to: string | null;
  changed_by: string;
  changed_by_name?: string | null;
  created_at: string;
}

export interface ApplyTemplateResult {
  employee_id: string;
  user_id: string | null;
  roles_added: Array<{ role_id: string; role_name: string | null }>;
  roles_skipped: Array<{ role_id: string; role_name: string | null; reason: string }>;
}
