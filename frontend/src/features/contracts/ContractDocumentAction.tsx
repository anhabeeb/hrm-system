import { useMutation } from "@tanstack/react-query";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth.store";
import { documentsApi } from "@/features/documents/documents.api";
import type { EmployeeContract } from "./contracts.types";

const safeFileName = (document: NonNullable<EmployeeContract["document"]>) =>
  document.file_name?.trim() || "employee-contract-document";

export const ContractDocumentAction = ({ contract, compact = false }: { contract: EmployeeContract; compact?: boolean }) => {
  const auth = useAuth();
  const document = contract.document;
  const documentTrackingEnabled = auth.hasFeature("documents");
  const canDownload = documentTrackingEnabled && (auth.isSuperAdmin || auth.hasPermission("documents.download"));
  const mutation = useMutation({
    mutationFn: async () => {
      if (!document?.id) throw new Error("Contract document is not linked.");
      return documentsApi.download(document.id);
    },
    onSuccess: (blob) => {
      if (!document) return;
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = safeFileName(document);
      link.click();
      window.URL.revokeObjectURL(url);
    },
  });

  if (!document?.id) return <span className="text-muted-foreground">Missing</span>;

  if (!documentTrackingEnabled) {
    return (
      <Button
        type="button"
        variant={compact ? "ghost" : "outline"}
        size={compact ? "sm" : "default"}
        disabled
        title="Document Tracking is disabled. Contract metadata remains available, but linked document download requires Document Tracking."
      >
        <Download className="h-4 w-4" />
        View Document
      </Button>
    );
  }

  if (!canDownload) {
    return (
      <Button
        type="button"
        variant={compact ? "ghost" : "outline"}
        size={compact ? "sm" : "default"}
        disabled
        title="Document download is available from Employee Documents."
      >
        <Download className="h-4 w-4" />
        View Document
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={compact ? "ghost" : "outline"}
      size={compact ? "sm" : "default"}
      disabled={mutation.isPending}
      onClick={(event) => {
        event.stopPropagation();
        mutation.mutate();
      }}
    >
      <Download className="h-4 w-4" />
      {compact ? "Download" : "Download Document"}
    </Button>
  );
};
