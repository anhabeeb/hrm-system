import type { KIOSK_ATTENDANCE_METHODS } from "./kiosk.constants";

export type KioskAttendanceMethod = (typeof KIOSK_ATTENDANCE_METHODS)[number];

export interface KioskEmployeeFilters {
  search?: string;
  page: number;
  page_size: number;
}

export interface KioskClockInput {
  employee_id: string;
  event_time?: string;
  attendance_method?: KioskAttendanceMethod;
  local_id?: string;
}
