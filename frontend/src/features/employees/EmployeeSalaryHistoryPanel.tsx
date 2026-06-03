import { useQuery } from "@tanstack/react-query";

import { DataTable } from "@/components/data/DataTable";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { displayDate, displayMoney } from "./employee-format";
import { employeesApi } from "./employees.api";

export const EmployeeSalaryHistoryPanel = ({ employeeId, canViewSalary }: { employeeId: string; canViewSalary: boolean }) => {
  const query = useQuery({
    queryKey: ["employee-salary-history", employeeId],
    queryFn: () => employeesApi.salaryHistory(employeeId),
    enabled: canViewSalary,
  });

  if (!canViewSalary) return null;

  if (query.isError) {
    return <InlineAlert title="Salary summary could not be loaded." variant="warning">Salary access may require additional permission.</InlineAlert>;
  }

  return (
    <DataTable
      compact
      loading={query.isLoading}
      columns={[
        { key: "effective_from", header: "Effective From", cell: (row) => displayDate(row.effective_from) },
        { key: "monthly_salary_amount", header: "Monthly Salary", cell: (row) => displayMoney(row.monthly_salary_amount, row.currency ?? "MVR") },
      ]}
      rows={query.data?.data.history ?? []}
      getRowId={(row) => row.id}
      emptyTitle="No salary history found."
    />
  );
};
