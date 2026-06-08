import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { Printer } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { Button } from "@/components/ui/button";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { formatReportValue } from "@/features/reports/report-format";
import { reportExportsApi } from "./report-exports.api";

const filtersFromParams = (params: URLSearchParams) =>
  Object.fromEntries([...params.entries()].filter(([, value]) => value !== ""));

export const ReportPrintPage = ({ employeeProfile = false }: { employeeProfile?: boolean }) => {
  const { reportKey, employeeId } = useParams();
  const [searchParams] = useSearchParams();
  const decodedReportKey = decodeURIComponent(reportKey ?? "");
  const query = useQuery({
    queryKey: ["report-print", employeeProfile ? employeeId : decodedReportKey, searchParams.toString()],
    queryFn: () => employeeProfile
      ? reportExportsApi.employeePrintData(employeeId ?? "")
      : reportExportsApi.printData(decodedReportKey, filtersFromParams(searchParams)),
    enabled: employeeProfile ? Boolean(employeeId) : Boolean(decodedReportKey),
  });
  const data = query.data?.data;
  const columns = data?.columns ?? [];

  return (
    <main className="min-h-screen bg-white p-6 text-slate-950 print:p-0">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
        }
      `}</style>
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="no-print flex justify-end">
          <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
        </div>
        {query.isError ? <InlineAlert title={friendlyHrmError(query.error, "Print view could not be loaded.")} variant="error" /> : null}
        <header className="border-b pb-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">HRM System</p>
          <h1 className="text-2xl font-semibold">{data?.report_name ?? "Report print view"}</h1>
          <p className="text-sm text-slate-600">Generated at {formatReportValue(data?.generated_at)} · Redaction: {data?.redaction_level ?? "standard"}</p>
          {data?.warnings?.length ? <p className="mt-2 text-sm text-amber-700">{data.warnings.join(" ")}</p> : null}
        </header>
        <section className="rounded-md border p-3 text-xs">
          <strong>Filters:</strong> {JSON.stringify(data?.filters ?? {})}
        </section>
        <DataTable
          compact
          rows={data?.rows ?? []}
          loading={query.isLoading}
          columns={columns.map((column) => ({
            key: column.key,
            header: column.label,
            cell: (row: Record<string, unknown>) => formatReportValue(row[column.key]),
          }))}
          getRowId={(row) => String(row.id ?? JSON.stringify(row).slice(0, 120))}
          emptyTitle="No rows available for print"
        />
        <footer className="border-t pt-3 text-xs text-slate-500">
          Printed from scoped report data. Hidden or sensitive columns are omitted or redacted according to your permissions.
        </footer>
      </div>
    </main>
  );
};

