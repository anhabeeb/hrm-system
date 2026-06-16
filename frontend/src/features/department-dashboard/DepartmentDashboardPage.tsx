import { LinkedEmployeeOnlyGuard } from "@/components/access/LinkedEmployeeOnlyGuard";
import { DepartmentWeeklyTeamView } from "./DepartmentWeeklyTeamView";

export const DepartmentDashboardPage = ({ selfService = false }: { selfService?: boolean }) =>
  selfService ? (
    <LinkedEmployeeOnlyGuard>
      <DepartmentWeeklyTeamView selfService />
    </LinkedEmployeeOnlyGuard>
  ) : <DepartmentWeeklyTeamView />;
