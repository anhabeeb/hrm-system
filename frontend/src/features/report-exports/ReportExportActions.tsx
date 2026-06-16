import { useState } from "react";
import { Download, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { reportExportsApi } from "./report-exports.api";

interface Props {
  reportKey: string;
  filters: Record<string, unknown>;
  sensitive?: boolean;
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

export const ReportExportActions = ({ reportKey, filters, sensitive }: Props) => {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCreate = auth.hasPermission("report_exports.create") && auth.hasPermission("report_exports.download");
  const sensitiveAllowed = !sensitive || auth.hasPermission("report_exports.sensitive");

  const exportReport = async (format: "xlsx" | "pdf") => {
    setBusy(true);
    setError(null);
    try {
      const created = await reportExportsApi.createJob(reportKey, filters, format);
      const job = created.data.export_job;
      await reportExportsApi.generate(job.id);
      const blob = await reportExportsApi.download(job.id);
      saveBlob(blob, job.file_name ?? `${reportKey.replace(/[:/]/g, "-")}.${format}`);
    } catch (nextError) {
      setError(friendlyHrmError(nextError, `${format === "xlsx" ? "Excel" : "PDF"} export could not be generated.`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error ? <InlineAlert title={error} variant="error" /> : null}
      {sensitive && !sensitiveAllowed ? <InlineAlert title="Sensitive columns will be redacted unless your role includes report_exports.sensitive." /> : null}
      <Button disabled={!canCreate || busy} variant="outline" onClick={() => void exportReport("xlsx")} title={canCreate ? "Download a scoped Excel export." : "You do not have permission to export this report."}>
        <Download className="h-4 w-4" />
        Download Excel
      </Button>
      <Button disabled={!canCreate || busy} variant="outline" onClick={() => void exportReport("pdf")} title={canCreate ? "Download a scoped PDF report." : "You do not have permission to export this report."}>
        <FileText className="h-4 w-4" />
        Download PDF
      </Button>
    </div>
  );
};

