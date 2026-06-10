import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { RequiredLabel } from "@/components/forms/RequiredLabel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Department } from "@/features/departments/departments.types";
import type { Position } from "@/features/positions/positions.types";
import type { ApiError } from "@/lib/api-errors";
import type { Employee, EmployeeStructurePayload } from "./employees.types";

const schema = z.object({
  department_id: z.string().trim().min(1, "Department is required."),
  position_id: z.string().trim().min(1, "Position is required."),
  reason: z.string().trim().max(300, "Reason is too long.").nullable().optional(),
});

type FormValues = z.infer<typeof schema>;

export const EmployeeStructureDialog = ({
  open,
  employee,
  departments,
  positions,
  error,
  loading,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  employee: Employee | null;
  departments: Department[];
  positions: Position[];
  error?: ApiError | null;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: EmployeeStructurePayload) => void;
}) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { department_id: "", position_id: "", reason: null },
  });
  const departmentId = form.watch("department_id");
  const positionId = form.watch("position_id");
  const filteredPositions = positions.filter((position) => position.department_id === departmentId);
  const selectedPosition = positions.find((position) => position.id === positionId);

  useEffect(() => {
    if (!open) return;
    form.reset({
      department_id: employee?.department_id ?? "",
      position_id: employee?.position_id ?? "",
      reason: null,
    });
  }, [employee, form, open]);

  useEffect(() => {
    if (!departmentId || !positionId) return;
    const position = positions.find((nextPosition) => nextPosition.id === positionId);
    if (position && position.department_id !== departmentId) {
      form.setValue("position_id", "");
    }
  }, [departmentId, form, positionId, positions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Employee Structure</DialogTitle>
          <DialogDescription>
            Assign the employee department and position. Level is derived from the selected position/title.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormError message={error?.message} requestId={error?.requestId} />
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{employee?.full_name ?? "Selected employee"}</p>
              <p className="text-muted-foreground">{employee?.employee_code ?? "No employee code"}</p>
            </div>
            <FormField control={form.control} name="department_id" render={({ field }) => (
              <FormItem>
                <FormLabel><RequiredLabel>Department</RequiredLabel></FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger></FormControl>
                  <SelectContent>{departments.map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}</SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="position_id" render={({ field }) => (
              <FormItem>
                <FormLabel><RequiredLabel>Position / title</RequiredLabel></FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={!departmentId}>
                  <FormControl><SelectTrigger><SelectValue placeholder={departmentId ? "Select position" : "Select a department first"} /></SelectTrigger></FormControl>
                  <SelectContent>{filteredPositions.map((position) => <SelectItem key={position.id} value={position.id}>{position.title}</SelectItem>)}</SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid gap-1">
              <FormLabel>Derived level</FormLabel>
              <Input readOnly value={selectedPosition ? `Level ${selectedPosition.level}` : "Level is assigned by the selected position/title."} />
            </div>
            <FormField control={form.control} name="reason" render={({ field }) => (
              <FormItem>
                <FormLabel>Reason</FormLabel>
                <FormControl><Input value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} placeholder="Optional audit reason" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <LoadingButton loading={loading}>Save structure</LoadingButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
