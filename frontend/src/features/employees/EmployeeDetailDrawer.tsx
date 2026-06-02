import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { Button } from "@/components/ui/button";
import { EmployeeStatusBadge } from "./EmployeeStatusBadge";
import { displayDate, employeeName } from "./employee-format";
import type { Employee } from "./employees.types";
import { EmployeeDocumentsPanel } from "./EmployeeDocumentsPanel";
import { EmployeeNotesPanel } from "./EmployeeNotesPanel";
import { EmployeeSalaryHistoryPanel } from "./EmployeeSalaryHistoryPanel";

interface EmployeeDetailDrawerProps {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (employee: Employee) => void;
  canEdit: boolean;
  canViewSalary: boolean;
  canViewDocuments: boolean;
  canViewSensitiveDocuments: boolean;
  canViewNotes: boolean;
}

export const EmployeeDetailDrawer = ({
  employee,
  open,
  onOpenChange,
  onEdit,
  canEdit,
  canViewSalary,
  canViewDocuments,
  canViewSensitiveDocuments,
  canViewNotes,
}: EmployeeDetailDrawerProps) => {
  if (!employee) return null;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={employeeName(employee)}
      subtitle="Authorized HR/Admin employee profile"
      footer={canEdit ? <Button onClick={() => onEdit?.(employee)}>Edit employee</Button> : undefined}
    >
      <DetailSection
        title="Basic Information"
        rows={[
          { label: "Employee code", value: employee.employee_code },
          { label: "Full name", value: employee.full_name },
          { label: "Employee type", value: employee.employee_type },
          { label: "Nationality", value: employee.nationality ?? "Not available" },
          { label: "Status", value: <EmployeeStatusBadge status={employee.employment_status} /> },
        ]}
      />
      <DetailSection
        title="Work Information"
        rows={[
          { label: "Outlet", value: employee.primary_outlet_name ?? employee.primary_outlet_id ?? "Not assigned" },
          { label: "Department", value: employee.department_name ?? "Not assigned" },
          { label: "Position", value: employee.position_title ?? "Not assigned" },
          { label: "Joined date", value: displayDate(employee.joined_at) },
          { label: "Contract type", value: employee.contract_type ?? "Not available" },
        ]}
      />
      <DetailSection
        title="Contact Information"
        rows={[
          { label: "Phone", value: employee.phone ?? "Not available" },
          { label: "Email", value: employee.email ?? "Not available" },
        ]}
      />
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Salary Summary</h3>
        <EmployeeSalaryHistoryPanel employeeId={employee.id} canViewSalary={canViewSalary} />
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Documents Summary</h3>
        <EmployeeDocumentsPanel employeeId={employee.id} canViewDocuments={canViewDocuments} canViewSensitiveDocuments={canViewSensitiveDocuments} />
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Notes</h3>
        <EmployeeNotesPanel employeeId={employee.id} canViewNotes={canViewNotes} />
      </section>
    </DetailDrawer>
  );
};
