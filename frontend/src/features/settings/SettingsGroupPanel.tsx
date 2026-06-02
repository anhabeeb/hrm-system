import { useQuery } from "@tanstack/react-query";

import { DataTable } from "@/components/data/DataTable";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { settingsApi } from "./settings.api";
import type { SettingsGroup } from "./settings.types";

export const SettingsGroupPanel = ({ group, title }: { group: SettingsGroup; title: string }) => {
  const query = useQuery({ queryKey: ["settings", group], queryFn: () => settingsApi.group(group) });
  if (query.isError) return <InlineAlert title={`${title} could not be loaded.`} variant="error" />;
  return (
    <div className="space-y-3">
      <DataTable
        compact
        loading={query.isLoading}
        rows={query.data?.data.settings ?? []}
        getRowId={(row) => row.id}
        emptyTitle={`No ${title.toLowerCase()} found.`}
        columns={[
          { key: "setting_key", header: "Setting" },
          { key: "value", header: "Current Value", cell: (row) => JSON.stringify(row.value) },
          { key: "updated_at", header: "Updated" },
        ]}
      />
      <p className="text-xs text-muted-foreground">Editable structured forms for this section will be expanded in the relevant module prompts. Unknown fields are not sent from this foundation screen.</p>
    </div>
  );
};
