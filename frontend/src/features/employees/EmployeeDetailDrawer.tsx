import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { Button } from "@/components/ui/button";
import { EmployeeStatusBadge } from "./EmployeeStatusBadge";
import { displayDate, employeeName } from "./employee-format";
import type { Employee } from "./employees.types";
import { EmployeeDocumentsPanel } from "./EmployeeDocumentsPanel";
import { EmployeeNotesPanel } from "./EmployeeNotesPanel";
import { EmployeeSalaryHistoryPanel } from "./EmployeeSalaryHistoryPanel";
import { EmployeeJobHistoryPanel } from "./EmployeeJobHistoryPanel";
import { EmployeeLifecyclePanel } from "./EmployeeLifecyclePanel";
import { OffboardingPanel } from "@/features/offboarding/OffboardingPanel";
import { EmployeeContractsPanel } from "@/features/contracts/EmployeeContractsPanel";

const expiryStatus = (date?: string | null) => {
  if (!date) return "Not available";
  const expiry = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);

  if (days < 0) return `${displayDate(date)} (expired)`;
  if (days <= 60) return `${displayDate(date)} (expires within 60 days)`;
  return displayDate(date);
};

const hasEmergencyContact = (employee: Employee) =>
  Boolean(employee.emergency_contact_name || employee.emergency_contact_phone || employee.emergency_contact_relation);

interface EmployeeDetailDrawerProps {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (employee: Employee) => void;
  canEdit: boolean;
  canManageJobChange: boolean;
  canViewSalary: boolean;
  canEditSalary: boolean;
  canViewDocuments: boolean;
  canViewSensitiveDocuments: boolean;
  canUploadDocuments: boolean;
  canEditDocuments: boolean;
  canViewNotes: boolean;
  canManageStatus: boolean;
  canManageOffboarding: boolean;
  canManageContracts: boolean;
}

export const EmployeeDetailDrawer = ({
  employee,
  open,
  onOpenChange,
  onEdit,
  canEdit,
  canManageJobChange,
  canViewSalary,
  canEditSalary,
  canViewDocuments,
  canViewSensitiveDocuments,
  canUploadDocuments,
  canEditDocuments,
  canViewNotes,
  canManageStatus,
  canManageOffboarding,
  canManageContracts,
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
          { label: "Employee ID", value: employee.employee_code },
          { label: "Full name", value: employee.full_name },
          { label: "Employee type", value: employee.employee_type },
          { label: "Status", value: <EmployeeStatusBadge status={employee.employment_status} /> },
        ]}
      />
      <DetailSection
        title="Employee Identity"
        rows={[
          { label: "Employee ID", value: employee.employee_code },
          { label: "Employee type", value: employee.employee_type },
          ...(employee.employee_type === "local"
            ? [{ label: "National ID number", value: employee.id_card_number ?? "Not available" }]
            : [
                { label: "Nationality", value: employee.nationality ?? "Not available" },
                { label: "Passport number", value: employee.passport_number ?? "Not available" },
                { label: "Passport expiry date", value: expiryStatus(employee.passport_expiry_date) },
                { label: "Work permit number", value: employee.work_permit_number ?? "Not available" },
                { label: "Work permit expiry date", value: expiryStatus(employee.work_permit_expiry_date) },
              ]),
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
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Contracts</h3>
        <EmployeeContractsPanel employee={employee} canManage={canManageContracts} />
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Lifecycle / Status History</h3>
        <EmployeeLifecyclePanel employee={employee} canManageStatus={canManageStatus} />
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Offboarding / Final Settlement Preparation</h3>
        <OffboardingPanel employee={employee} canManage={canManageOffboarding} />
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Employment / Job History</h3>
        <EmployeeJobHistoryPanel
          employee={employee}
          canManageJobChange={canManageJobChange}
          canViewSalary={canViewSalary}
          canEditSalary={canEditSalary}
        />
      </section>
      <DetailSection
        title="Contact Information"
        rows={[
          { label: "Phone", value: employee.phone ?? "Not available" },
          { label: "Email", value: employee.email ?? "Not available" },
        ]}
      />
      <DetailSection
        title="Emergency Contact"
        rows={hasEmergencyContact(employee)
          ? [
              { label: "Name", value: employee.emergency_contact_name ?? "Not recorded" },
              { label: "Phone", value: employee.emergency_contact_phone ?? "Not recorded" },
              { label: "Relationship", value: employee.emergency_contact_relation ?? "Not recorded" },
            ]
          : [{ label: "Emergency contact", value: "No emergency contact recorded." }]}
      />
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Salary & Compensation</h3>
        <EmployeeSalaryHistoryPanel employeeId={employee.id} canViewSalary={canViewSalary} canEditSalary={canEditSalary} />
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Documents & Compliance</h3>
        <EmployeeDocumentsPanel
          employeeId={employee.id}
          canViewDocuments={canViewDocuments}
          canViewSensitiveDocuments={canViewSensitiveDocuments}
          canUploadDocuments={canUploadDocuments}
          canEditDocuments={canEditDocuments}
        />
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Notes</h3>
        <EmployeeNotesPanel employeeId={employee.id} canViewNotes={canViewNotes} />
      </section>
    </DetailDrawer>
  );
};
