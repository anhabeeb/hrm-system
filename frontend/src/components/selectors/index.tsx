import { LookupCombobox, type LookupComboboxProps } from "./LookupCombobox";
import { lookupApi, type LookupFilters } from "./lookup-api";

type SelectorProps = Omit<LookupComboboxProps, "queryKey" | "queryFn">;

export const EmployeeCombobox = (props: SelectorProps & { outletId?: string; departmentId?: string; positionId?: string }) => (
  <LookupCombobox
    {...props}
    filters={{ ...props.filters, outlet_id: props.outletId, department_id: props.departmentId, position_id: props.positionId } as LookupFilters}
    queryKey={["lookup", "employees", props.outletId, props.departmentId, props.positionId]}
    queryFn={lookupApi.employees}
    placeholder={props.placeholder ?? "Select employee"}
    searchPlaceholder={props.searchPlaceholder ?? "Search employee code or name..."}
    emptyText={props.emptyText ?? "No employees found."}
  />
);

export const OutletCombobox = (props: SelectorProps) => (
  <LookupCombobox
    {...props}
    queryKey={["lookup", "outlets"]}
    queryFn={lookupApi.outlets}
    placeholder={props.placeholder ?? "Select outlet"}
    searchPlaceholder={props.searchPlaceholder ?? "Search outlet code or name..."}
    emptyText={props.emptyText ?? "No outlets found."}
  />
);

export const DepartmentCombobox = (props: SelectorProps) => (
  <LookupCombobox
    {...props}
    queryKey={["lookup", "departments"]}
    queryFn={lookupApi.departments}
    placeholder={props.placeholder ?? "Select department"}
    searchPlaceholder={props.searchPlaceholder ?? "Search department code or name..."}
    emptyText={props.emptyText ?? "No departments found."}
  />
);

export const PositionCombobox = (props: SelectorProps & { departmentId?: string | null }) => (
  <LookupCombobox
    {...props}
    filters={{ ...props.filters, department_id: props.departmentId ?? undefined } as LookupFilters}
    queryKey={["lookup", "positions", props.departmentId]}
    queryFn={lookupApi.positions}
    placeholder={props.placeholder ?? "Select position"}
    searchPlaceholder={props.searchPlaceholder ?? "Search position code or title..."}
    emptyText={props.emptyText ?? "No positions found."}
  />
);

export const LeaveTypeCombobox = (props: SelectorProps) => (
  <LookupCombobox
    {...props}
    queryKey={["lookup", "leave-types"]}
    queryFn={lookupApi.leaveTypes}
    placeholder={props.placeholder ?? "Select leave type"}
    searchPlaceholder={props.searchPlaceholder ?? "Search leave type..."}
    emptyText={props.emptyText ?? "No leave types found."}
  />
);

export const PayrollPeriodCombobox = (props: SelectorProps) => (
  <LookupCombobox
    {...props}
    queryKey={["lookup", "payroll-periods"]}
    queryFn={lookupApi.payrollPeriods}
    placeholder={props.placeholder ?? "Select payroll period"}
    searchPlaceholder={props.searchPlaceholder ?? "Search month, year, or status..."}
    emptyText={props.emptyText ?? "No payroll runs found. Create payroll run for this period first."}
  />
);

export type { LookupOption } from "./lookup-api";
