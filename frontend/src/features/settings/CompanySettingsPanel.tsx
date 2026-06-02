import { useQuery } from "@tanstack/react-query";

import { DataTable } from "@/components/data/DataTable";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { settingsApi } from "./settings.api";

export const CompanySettingsPanel = () => {
  const query = useQuery({ queryKey: ["settings", "company"], queryFn: () => settingsApi.group("company") });
  if (query.isError) return <InlineAlert title="Company settings could not be loaded." variant="error" />;
  return (
    <DataTable
      compact
      loading={query.isLoading}
      rows={query.data?.data.settings ?? []}
      getRowId={(row) => row.id}
      emptyTitle="No company settings found."
      columns={[
        { key: "setting_key", header: "Setting" },
        { key: "value", header: "Value", cell: (row) => JSON.stringify(row.value) },
        { key: "updated_at", header: "Updated" },
      ]}
    />
  );
};
