import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface BusinessFunctionFormState {
  code: string;
  name: string;
  description: string;
  is_sensitive: string;
  is_active: string;
}

export const emptyBusinessFunctionForm = (): BusinessFunctionFormState => ({
  code: "",
  name: "",
  description: "",
  is_sensitive: "false",
  is_active: "true",
});

export const BusinessFunctionDialog = ({
  open,
  loading,
  editing,
  form,
  canManageSensitive,
  onOpenChange,
  onChange,
  onSubmit,
}: {
  open: boolean;
  loading?: boolean;
  editing?: boolean;
  form: BusinessFunctionFormState;
  canManageSensitive?: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (next: BusinessFunctionFormState) => void;
  onSubmit: () => void;
}) => {
  const set = <K extends keyof BusinessFunctionFormState>(key: K, value: BusinessFunctionFormState[K]) => onChange({ ...form, [key]: value });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Business Function" : "Create Business Function"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="business-function-code">Code</Label>
            <Input id="business-function-code" value={form.code} disabled={editing} placeholder="PAYROLL_FUNCTION" onChange={(event) => set("code", event.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="business-function-name">Name</Label>
            <Input id="business-function-name" value={form.name} placeholder="Payroll Function" onChange={(event) => set("name", event.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="business-function-description">Description</Label>
            <Input id="business-function-description" value={form.description} placeholder="Optional description" onChange={(event) => set("description", event.target.value)} />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Sensitive</Label>
              <Select value={form.is_sensitive} disabled={!canManageSensitive} onValueChange={(value) => set("is_sensitive", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="false">No</SelectItem><SelectItem value="true">Yes</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Active status</Label>
              <Select value={form.is_active} onValueChange={(value) => set("is_active", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="true">Active</SelectItem><SelectItem value="false">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!form.code || !form.name || loading} onClick={onSubmit}>{editing ? "Save Function" : "Create Function"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
