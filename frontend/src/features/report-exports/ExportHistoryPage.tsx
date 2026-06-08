import { useQuery } from "@tanstack/react-query";
import { Download, RefreshCw } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { formatReportValue } from "@/features/reports/report-format";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { reportExportsApi } from "./report-exports.api";

export const ExportHistoryPage = () => {
  const query = useQuery({ queryKey: ["report-exports", "history"], queryFn: () => reportExportsApi.history({ page_size: 50 }) });
  const rows = query.data?.data.data ?? [];
  return (
    <div>
      <PageHeader
        title="Export History"
        description="Review report export jobs, redaction level, status, and safe CSV downloads."
        actions={<Button variant="outline" onClick={() => void query.refetch()}><RefreshCw className="h-4 w-4" /> Refresh</Button>}
      />
      <div className="space-y-4 p-4 md:p-6">
        {query.isError ? <InlineAlert title={friendlyHrmError(query.error, "Export history could not be loaded.")} variant="error" /> : null}
        <DataTable
          compact
          rows={rows}
          loading={query.isLoading}
          getRowId={(row) => row.id}
          columns={[
            { key: "report_key", header: "Report", cell: (row) => row.report_key },
            { key: "format", header: "Format", cell: (row) => row.format.toUpperCase() },
            { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
            { key: "requested_at", header: "Requested", cell: (row) => formatReportValue(row.requested_at) },
            { key: "completed_at", header: "Completed", cell: (row) => formatReportValue(row.completed_at) },
            { key: "row_count", header: "Rows", cell: (row) => row.row_count ?? "-" },
            { key: "sensitive_export", header: "Sensitive", cell: (row) => row.sensitive_export ? "Yes" : "No" },
            { key: "redaction_level", header: "Redaction", cell: (row) => row.redaction_level },
            { key: "actions", header: "Actions", cell: (row) => (
              <Button size="sm" variant="ghost" disabled={row.status !== "completed"} onClick={async () => {
                const blob = await reportExportsApi.download(row.id);
                const url = URL.createObjectURL(blob);
                window.open(url, "_blank", "noopener,noreferrer");
                window.setTimeout(() => URL.revokeObjectURL(url), 2000);
              }}>
                <Download className="h-4 w-4" /> Download
              </Button>
            ) },
          ]}
          emptyTitle="No export jobs found"
          emptyDescription="CSV exports and print previews you create will appear here."
        />
      </div>
    </div>
  );
};

