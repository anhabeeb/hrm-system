import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { MoneyAmount } from "@/components/data/MoneyAmount";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDateTime } from "@/lib/safe-display";
import { InstallmentsTable } from "./InstallmentsTable";
import type { SalaryLoan, SalaryLoanInstallment } from "./salary-loans.types";

export const SalaryLoanDetailDrawer = ({
  loan,
  installments,
  installmentsLoading,
  open,
  onOpenChange,
}: {
  loan: SalaryLoan | null;
  installments: SalaryLoanInstallment[];
  installmentsLoading?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <DetailDrawer open={open} onOpenChange={onOpenChange} title={loan?.employee_name ?? "Salary loan"} subtitle={loan?.employee_code ?? loan?.employee_id}>
    {loan ? (
      <>
        <DetailSection
          title="Loan"
          rows={[
            { label: "Outlet", value: loan.outlet_name ?? loan.outlet_id ?? "Unassigned" },
            { label: "Loan amount", value: <MoneyAmount amount={loan.loan_amount} /> },
            { label: "Outstanding", value: <MoneyAmount amount={loan.outstanding_amount} /> },
            { label: "Installment", value: <MoneyAmount amount={loan.installment_amount} /> },
            { label: "Start month", value: loan.start_month },
            { label: "Status", value: <StatusBadge status={loan.status ?? "pending"} /> },
            { label: "Created", value: formatDateTime(loan.created_at) },
          ]}
        />
        <InstallmentsTable rows={installments} loading={installmentsLoading} />
      </>
    ) : null}
  </DetailDrawer>
);
