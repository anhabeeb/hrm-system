import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDate, formatDateTime } from "@/lib/safe-display";
import type { LongLeaveRecord, SalaryImpactRow } from "./long-leave.types";
import { SalaryImpactTable } from "./SalaryImpactTable";

export const LongLeaveDetailDrawer = ({
  record,
  impactRows,
  impactLoading,
  open,
  onOpenChange,
}: {
  record: LongLeaveRecord | null;
  impactRows: SalaryImpactRow[];
  impactLoading?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <DetailDrawer
    open={open}
    onOpenChange={onOpenChange}
    title={record?.employee_name ?? "Long leave detail"}
    subtitle={record?.employee_code ?? record?.employee_id}
  >
    {record ? (
      <>
        <DetailSection
          title="Record"
          rows={[
            { label: "Status", value: <StatusBadge status={record.status} /> },
            { label: "Outlet", value: record.outlet_name ?? record.outlet_id ?? "Unassigned" },
            { label: "Start date", value: formatDate(record.start_date) },
            { label: "Expected return", value: formatDate(record.expected_return_date) },
            { label: "Actual return", value: formatDate(record.actual_return_date) },
            { label: "Salary impact", value: record.salary_impact_confirmed ? "Confirmed" : "Review required" },
            { label: "Created", value: formatDateTime(record.created_at) },
          ]}
        />
        <SalaryImpactTable rows={impactRows} loading={impactLoading} />
      </>
    ) : null}
  </DetailDrawer>
);
