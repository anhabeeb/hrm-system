import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Department } from "@/features/departments/departments.types";
import type { BusinessFunction } from "./operation-ownership.types";

export interface FunctionAssignmentFormState {
  business_function_id: string;
  department_id: string;
  assignment_type: string;
  is_primary: string;
  is_active: string;
}

export const emptyFunctionAssignmentForm = (): FunctionAssignmentFormState => ({
  business_function_id: "",
  department_id: "",
  assignment_type: "PRIMARY",
  is_primary: "true",
  is_active: "true",
});

export const FunctionAssignmentDialog = ({
  open,
  loading,
  editing,
  form,
  businessFunctions,
  departments,
  onOpenChange,
  onChange,
  onSubmit,
}: {
  open: boolean;
  loading?: boolean;
  editing?: boolean;
  form: FunctionAssignmentFormState;
  businessFunctions: BusinessFunction[];
  departments: Department[];
  onOpenChange: (open: boolean) => void;
  onChange: (next: FunctionAssignmentFormState) => void;
  onSubmit: () => void;
}) => {
  const set = <K extends keyof FunctionAssignmentFormState>(key: K, value: FunctionAssignmentFormState[K]) => onChange({ ...form, [key]: value });
  const activeDepartments = departments.filter((department) => department.is_active === 1 || department.status === "active");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Function Assignment" : "Assign Business Function"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
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
          <div className="grid gap-1.5">
            <Label>Department selector</Label>
            <Select value={form.department_id || "none"} onValueChange={(value) => set("department_id", value === "none" ? "" : value)}>
              <SelectTrigger><SelectValue placeholder="Select active department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select active department</SelectItem>
                {activeDepartments.map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Assignment type</Label>
              <Select value={form.assignment_type || "PRIMARY"} onValueChange={(value) => set("assignment_type", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRIMARY">Primary</SelectItem>
                  <SelectItem value="SECONDARY">Secondary</SelectItem>
                  <SelectItem value="SUPPORT">Support</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Primary</Label>
              <Select value={form.is_primary} onValueChange={(value) => set("is_primary", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Active</Label>
              <Select value={form.is_active} onValueChange={(value) => set("is_active", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="true">Active</SelectItem><SelectItem value="false">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!form.business_function_id || !form.department_id || loading} onClick={onSubmit}>{editing ? "Save Assignment" : "Assign Function"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
