import type { RosterMatrixShift } from "./rosterWeeklyMatrix.types";

export const RosterShiftSelect = ({
  value,
  shifts,
  onChange,
}: {
  value?: string | null;
  shifts: RosterMatrixShift[];
  onChange: (value: string | null) => void;
}) => (
  <select
    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
    value={value ?? ""}
    onChange={(event) => onChange(event.target.value || null)}
  >
    <option value="">Select shift</option>
    {shifts.map((shift) => (
      <option key={shift.id} value={shift.id}>
        {shift.name} ({shift.start_time} - {shift.end_time})
      </option>
    ))}
  </select>
);
