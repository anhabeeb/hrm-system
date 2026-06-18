import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/auth.store";
import { payrollApi } from "./payroll.api";
import type { PayrollSubFeatureVisibility } from "./payroll.types";

const DEFAULT_PAYROLL_SUBFEATURES: PayrollSubFeatureVisibility = {
  salary_processing_enabled: true,
  payslips_enabled: true,
  advances_enabled: true,
  salary_loans_enabled: true,
  overtime_enabled: true,
  benefits_enabled: true,
  manual_deductions_enabled: true,
  attendance_deductions_enabled: true,
  long_leave_deductions_enabled: true,
  approvals_enabled: true,
};

const DISABLED_PAYROLL_SUBFEATURES: PayrollSubFeatureVisibility = {
  salary_processing_enabled: false,
  payslips_enabled: false,
  advances_enabled: false,
  salary_loans_enabled: false,
  overtime_enabled: false,
  benefits_enabled: false,
  manual_deductions_enabled: false,
  attendance_deductions_enabled: false,
  long_leave_deductions_enabled: false,
  approvals_enabled: false,
};

export const usePayrollSubFeatures = () => {
  const auth = useAuth();
  const payrollEnabled = auth.hasFeature("payroll");

  const query = useQuery({
    queryKey: ["payroll", "subfeatures"],
    queryFn: () => payrollApi.subFeatures(),
    enabled: payrollEnabled,
    staleTime: 60_000,
    retry: false,
  });

  const subfeatures = payrollEnabled
    ? (query.data?.data.subfeatures ?? DEFAULT_PAYROLL_SUBFEATURES)
    : DISABLED_PAYROLL_SUBFEATURES;

  return {
    payrollEnabled,
    isLoading: query.isLoading,
    isError: query.isError,
    subfeatures,
    salaryProcessingEnabled: subfeatures.salary_processing_enabled,
    payslipsEnabled: subfeatures.payslips_enabled,
    advancesEnabled: subfeatures.advances_enabled,
    salaryLoansEnabled: subfeatures.salary_loans_enabled,
    overtimeEnabled: subfeatures.overtime_enabled,
    benefitsEnabled: subfeatures.benefits_enabled,
    manualDeductionsEnabled: subfeatures.manual_deductions_enabled,
    attendanceDeductionsEnabled: subfeatures.attendance_deductions_enabled,
    longLeaveDeductionsEnabled: subfeatures.long_leave_deductions_enabled,
    approvalsEnabled: subfeatures.approvals_enabled,
  };
};
