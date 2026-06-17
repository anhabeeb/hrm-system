import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/auth.store";
import { attendanceApi } from "./attendance.api";
import type { AttendanceSubFeatureVisibility } from "./attendance.types";

const DEFAULT_ATTENDANCE_SUBFEATURES: AttendanceSubFeatureVisibility = {
  manual_entry_enabled: true,
  kiosk_enabled: true,
  biometric_enabled: false,
  corrections_enabled: true,
  payroll_deductions_enabled: true,
};

export const useAttendanceSubFeatures = () => {
  const auth = useAuth();
  const attendanceEnabled = auth.hasFeature("attendance");

  const query = useQuery({
    queryKey: ["attendance", "subfeatures"],
    queryFn: () => attendanceApi.subFeatures(),
    enabled: attendanceEnabled,
    staleTime: 60_000,
    retry: false,
  });

  const subfeatures = attendanceEnabled
    ? (query.data?.data.subfeatures ?? DEFAULT_ATTENDANCE_SUBFEATURES)
    : {
        manual_entry_enabled: false,
        kiosk_enabled: false,
        biometric_enabled: false,
        corrections_enabled: false,
        payroll_deductions_enabled: false,
      };

  return {
    attendanceEnabled,
    isLoading: query.isLoading,
    isError: query.isError,
    manualEntryEnabled: subfeatures.manual_entry_enabled,
    kioskEnabled: subfeatures.kiosk_enabled,
    biometricEnabled: subfeatures.biometric_enabled,
    correctionsEnabled: subfeatures.corrections_enabled,
    payrollDeductionsEnabled: subfeatures.payroll_deductions_enabled,
  };
};
