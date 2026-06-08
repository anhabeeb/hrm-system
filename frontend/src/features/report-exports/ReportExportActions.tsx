import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { reportExportsApi } from "./report-exports.api";

interface Props {
  reportKey: string;
  filters: Record<string, unknown>;
  sensitive?: boolean;
  printPath?: string;
}

const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const ReportExportActions = ({ reportKey, filters, sensitive, printPath }: Props) => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCreate = auth.hasPermission("report_exports.create") && auth.hasPermission("report_exports.download");
  const canPrint = auth.hasPermission("report_exports.print");
  const sensitiveAllowed = !sensitive || auth.hasPermission("report_exports.sensitive");

  const exportCsv = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await reportExportsApi.createJob(reportKey, filters, "csv");
      const job = created.data.export_job;
      await reportExportsApi.generate(job.id);
      const blob = await reportExportsApi.download(job.id);
      saveBlob(blob, job.file_name ?? `${reportKey.replace(/[:/]/g, "-")}.csv`);
    } catch (nextError) {
      setError(friendlyHrmError(nextError, "CSV export could not be generated."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error ? <InlineAlert title={error} variant="error" /> : null}
      {sensitive && !sensitiveAllowed ? <InlineAlert title="Sensitive columns will be redacted unless your role includes report_exports.sensitive." /> : null}
      <Button disabled={!canCreate || busy} variant="outline" onClick={() => void exportCsv()} title={canCreate ? "Download a scoped CSV export." : "You do not have permission to export this report."}>
        <Download className="h-4 w-4" />
        CSV
      </Button>
      <Button disabled={!canPrint} variant="outline" onClick={() => navigate(printPath ?? `/reports/print/${encodeURIComponent(reportKey)}?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== "").map(([key, value]) => [key, String(value)])).toString()}`)} title={canPrint ? "Open a print-friendly report view." : "You do not have permission to print this report."}>
        <Printer className="h-4 w-4" />
        Print
      </Button>
    </div>
  );
};

