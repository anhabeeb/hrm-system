import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Department } from "@/features/departments/departments.types";
import type { Permission, Role } from "@/features/roles/roles.types";
import type { AdminUser } from "@/features/users/users.types";
import type { BusinessFunction, OperationCatalogEntry, ResponsibilityFallback, ResponsibilityType, TargetType } from "./operation-ownership.types";

export interface ResponsibilityFormState {
  operation_code: string;
  responsibility_type: ResponsibilityType;
  target_type: TargetType;
  business_function_id: string;
  department_id: string;
  user_id: string;
  min_level: string;
  max_level: string;
  required_permission: string;
  required_role_id: string;
  fallback_behavior: ResponsibilityFallback;
  requires_approval: string;
  is_required: string;
  is_active: string;
  reason: string;
}

const responsibilityTypes: ResponsibilityType[] = ["OWNER", "REQUEST_REVIEW", "DEPARTMENT_REVIEW", "FINAL_APPROVAL", "SECONDARY_APPROVAL", "EXECUTION", "CONFIGURATION", "AUDIT_VIEW", "ESCALATION"];
const targetTypes: TargetType[] = ["BUSINESS_FUNCTION", "DEPARTMENT", "SPECIFIC_USER", "REQUESTER_DEPARTMENT", "SUBJECT_DEPARTMENT", "SUPER_ADMIN"];
const fallbackOptions: ResponsibilityFallback[] = [
  "USE_SUPER_ADMIN",
  "USE_OWNER",
  "USE_FINAL_APPROVAL_DEPARTMENT",
  "HOLD_FOR_MANUAL_ASSIGNMENT",
  "BLOCK_OPERATION",
  "SKIP_OPTIONAL_STEP",
];

export const emptyResponsibilityForm = (): ResponsibilityFormState => ({
  operation_code: "",
  responsibility_type: "OWNER",
  target_type: "BUSINESS_FUNCTION",
  business_function_id: "",
  department_id: "",
  user_id: "",
  min_level: "",
  max_level: "",
  required_permission: "",
  required_role_id: "",
  fallback_behavior: "HOLD_FOR_MANUAL_ASSIGNMENT",
  requires_approval: "false",
  is_required: "true",
  is_active: "true",
  reason: "",
});

export const OperationResponsibilityDialog = ({
  open,
  loading,
  form,
  operations,
  businessFunctions,
  departments,
  users,
  roles,
  permissions,
  onOpenChange,
  onChange,
  onSubmit,
}: {
  open: boolean;
  loading?: boolean;
  form: ResponsibilityFormState;
  operations: OperationCatalogEntry[];
  businessFunctions: BusinessFunction[];
  departments: Department[];
  users: AdminUser[];
  roles: Role[];
  permissions: Permission[];
  onOpenChange: (open: boolean) => void;
  onChange: (next: ResponsibilityFormState) => void;
  onSubmit: () => void;
}) => {
  const set = <K extends keyof ResponsibilityFormState>(key: K, value: ResponsibilityFormState[K]) => onChange({ ...form, [key]: value });
  const setTargetType = (target_type: TargetType) => onChange({
    ...form,
    target_type,
    business_function_id: target_type === "BUSINESS_FUNCTION" ? form.business_function_id : "",
    department_id: target_type === "DEPARTMENT" ? form.department_id : "",
    user_id: target_type === "SPECIFIC_USER" ? form.user_id : "",
  });
  const showBusinessFunction = form.target_type === "BUSINESS_FUNCTION";
  const showDepartment = form.target_type === "DEPARTMENT";
  const showUser = form.target_type === "SPECIFIC_USER";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Operation Responsibility</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Operation selector</Label>
            <Select value={form.operation_code || "none"} onValueChange={(value) => set("operation_code", value === "none" ? "" : value)}>
              <SelectTrigger><SelectValue placeholder="Select operation" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select operation</SelectItem>
                {operations.map((operation) => <SelectItem key={operation.operation_code} value={operation.operation_code}>{operation.operation_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Responsibility type</Label>
            <Select value={form.responsibility_type} onValueChange={(value) => set("responsibility_type", value as ResponsibilityType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{responsibilityTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Target type selector</Label>
            <Select value={form.target_type} onValueChange={(value) => setTargetType(value as TargetType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{targetTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {showBusinessFunction ? (
            <div className="grid gap-1.5">
              <Label>Business function selector</Label>
              <Select value={form.business_function_id || "none"} onValueChange={(value) => set("business_function_id", value === "none" ? "" : value)}>
                <SelectTrigger><SelectValue placeholder="Select business function" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select business function</SelectItem>
                  {businessFunctions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {showDepartment ? (
            <div className="grid gap-1.5">
              <Label>Department selector</Label>
              <Select value={form.department_id || "none"} onValueChange={(value) => set("department_id", value === "none" ? "" : value)}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select department</SelectItem>
                  {departments.map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {showUser ? (
            <div className="grid gap-1.5">
              <Label>Specific user selector</Label>
              <Select value={form.user_id || "none"} onValueChange={(value) => set("user_id", value === "none" ? "" : value)}>
                <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select user</SelectItem>
                  {users.map((user) => <SelectItem key={user.id} value={user.id}>{user.full_name ?? user.username ?? user.email ?? user.id}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label>Min level</Label>
            <Select value={form.min_level || "none"} onValueChange={(value) => set("min_level", value === "none" ? "" : value)}>
              <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent><SelectItem value="none">Any</SelectItem>{[1, 2, 3, 4].map((level) => <SelectItem key={level} value={String(level)}>Level {level}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Max level</Label>
            <Select value={form.max_level || "none"} onValueChange={(value) => set("max_level", value === "none" ? "" : value)}>
              <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent><SelectItem value="none">Any</SelectItem>{[1, 2, 3, 4].map((level) => <SelectItem key={level} value={String(level)}>Level {level}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Required permission</Label>
            <Select value={form.required_permission || "none"} onValueChange={(value) => set("required_permission", value === "none" ? "" : value)}>
              <SelectTrigger><SelectValue placeholder="Optional permission" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No permission filter</SelectItem>
                {permissions.map((permission) => <SelectItem key={permission.permission_key} value={permission.permission_key}>{permission.permission_key}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Required role</Label>
            <Select value={form.required_role_id || "none"} onValueChange={(value) => set("required_role_id", value === "none" ? "" : value)}>
              <SelectTrigger><SelectValue placeholder="Optional role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No role filter</SelectItem>
                {roles.map((role) => <SelectItem key={role.id} value={role.id}>{role.role_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Fallback behavior</Label>
            <Select value={form.fallback_behavior} onValueChange={(value) => set("fallback_behavior", value as ResponsibilityFallback)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{fallbackOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Requires approval</Label>
            <Select value={form.requires_approval} onValueChange={(value) => set("requires_approval", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Required/optional</Label>
            <Select value={form.is_required} onValueChange={(value) => set("is_required", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="true">Required</SelectItem><SelectItem value="false">Optional</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Active</Label>
            <Select value={form.is_active} onValueChange={(value) => set("is_active", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="true">Active</SelectItem><SelectItem value="false">Inactive</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="operation-ownership-reason">Reason/comment</Label>
            <Input id="operation-ownership-reason" value={form.reason} placeholder="Optional change reason" onChange={(event) => set("reason", event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!form.operation_code || loading} onClick={onSubmit}>Save Responsibility</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
