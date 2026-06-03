import { useQuery } from "@tanstack/react-query";

import { DataTable } from "@/components/data/DataTable";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { displayDate } from "./employee-format";
import { employeesApi } from "./employees.api";

export const EmployeeNotesPanel = ({ employeeId, canViewNotes }: { employeeId: string; canViewNotes: boolean }) => {
  const query = useQuery({
    queryKey: ["employee-notes", employeeId],
    queryFn: () => employeesApi.notes(employeeId),
    enabled: canViewNotes,
  });

  if (!canViewNotes) return null;

  if (query.isError) {
    return <InlineAlert title="Notes could not be loaded." variant="warning">Only authorized HR users can view employee notes.</InlineAlert>;
  }

  return (
    <DataTable
      compact
      loading={query.isLoading}
      columns={[
        { key: "note_type", header: "Type" },
        { key: "note", header: "Note" },
        { key: "created_at", header: "Created", cell: (row) => displayDate(row.created_at) },
      ]}
      rows={query.data?.data.notes ?? []}
      getRowId={(row) => row.id}
      emptyTitle="No notes found."
    />
  );
};
