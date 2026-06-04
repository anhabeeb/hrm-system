import { useState } from "react";
import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { EmployeeCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { documentTypeOptions, drivingLicenseCategoryOptions } from "./document-format";
import type { DocumentUploadPayload } from "./documents.types";

const dangerousTypes = new Set(["text/html", "image/svg+xml", "application/x-msdownload", "application/x-msdos-program"]);

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
  reader.onerror = () => reject(new Error("Document file could not be read."));
  reader.readAsDataURL(file);
});

type UploadState = {
  employee_id: string;
  document_type: string;
  document_number: string;
  issue_date: string;
  start_date: string;
  expiry_date: string;
  driving_license_category: string;
  driving_license_category_other: string;
  notes: string;
  is_sensitive: boolean;
  reason: string;
};

interface DocumentUploadDialogProps {
  open: boolean;
  loading?: boolean;
  error?: string | null;
  employeeId?: string;
  mode?: "upload" | "replace";
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: DocumentUploadPayload & { reason?: string }) => void;
}

export const DocumentUploadDialog = ({ open, loading, error, employeeId, mode = "upload", onOpenChange, onSubmit }: DocumentUploadDialogProps) => {
  const [payload, setPayload] = useState<UploadState>({
    employee_id: employeeId ?? "",
    document_type: "",
    document_number: "",
    issue_date: "",
    start_date: "",
    expiry_date: "",
    driving_license_category: "",
    driving_license_category_other: "",
    notes: "",
    is_sensitive: true,
    reason: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const isDrivingLicense = payload.document_type === "driving_license";

  const submit = async () => {
    setClientError(null);
    if (!employeeId && !payload.employee_id) {
      setClientError("Please select an employee.");
      return;
    }
    if (!payload.document_type) {
      setClientError("Please select a document type.");
      return;
    }
    if (isDrivingLicense && !payload.driving_license_category) {
      setClientError("Driving license category is required.");
      return;
    }
    if (mode === "replace" && payload.reason.trim().length < 3) {
      setClientError("A reason is required for replacement.");
      return;
    }
    if (!file) {
      setClientError("Please attach a document file before uploading.");
      return;
    }
    if (dangerousTypes.has(file.type)) {
      setClientError("This document type is not allowed.");
      return;
    }
    const content_base64 = await fileToBase64(file);
    onSubmit({
      employee_id: employeeId ?? payload.employee_id,
      document_type: payload.document_type,
      document_number: payload.document_number || undefined,
      issue_date: payload.issue_date || undefined,
      start_date: payload.start_date || undefined,
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      content_base64,
      expiry_date: payload.expiry_date || undefined,
      driving_license_category: payload.driving_license_category || undefined,
      driving_license_category_other: payload.driving_license_category_other || undefined,
      notes: payload.notes || undefined,
      is_sensitive: payload.is_sensitive,
      reason: payload.reason || undefined,
    });
    setFile(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "replace" ? "Replace document" : "Upload document"}</DialogTitle>
          <DialogDescription>Track validity dates and document history. Biometric or identity templates must not be uploaded here.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          {!employeeId ? (
            <Label className="space-y-1 text-sm md:col-span-2">
              Employee
              <EmployeeCombobox value={payload.employee_id} onChange={(value) => setPayload((p) => ({ ...p, employee_id: value ?? "" }))} />
            </Label>
          ) : null}
          <Label className="space-y-1 text-sm">
            Document type
            <Select value={payload.document_type} onValueChange={(value) => setPayload((p) => ({ ...p, document_type: value, driving_license_category: value === "driving_license" ? p.driving_license_category : "" }))}>
              <SelectTrigger><SelectValue placeholder="Select document type" /></SelectTrigger>
              <SelectContent>
                {documentTypeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Label>
          <Label className="space-y-1 text-sm">Document number/reference<Input value={payload.document_number} onChange={(e) => setPayload((p) => ({ ...p, document_number: e.target.value }))} /></Label>
          <Label className="space-y-1 text-sm">Issue date<Input type="date" value={payload.issue_date} onChange={(e) => setPayload((p) => ({ ...p, issue_date: e.target.value }))} /></Label>
          <Label className="space-y-1 text-sm">Start date<Input type="date" value={payload.start_date} onChange={(e) => setPayload((p) => ({ ...p, start_date: e.target.value }))} /></Label>
          <Label className="space-y-1 text-sm">Expiry date<Input type="date" value={payload.expiry_date} onChange={(e) => setPayload((p) => ({ ...p, expiry_date: e.target.value }))} /></Label>
          {isDrivingLicense ? (
            <Label className="space-y-1 text-sm">
              Driving license category
              <Select value={payload.driving_license_category} onValueChange={(value) => setPayload((p) => ({ ...p, driving_license_category: value }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {drivingLicenseCategoryOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Label>
          ) : null}
          {payload.driving_license_category === "other" ? (
            <Label className="space-y-1 text-sm">Custom license category<Input value={payload.driving_license_category_other} onChange={(e) => setPayload((p) => ({ ...p, driving_license_category_other: e.target.value }))} /></Label>
          ) : null}
          <Label className="space-y-1 text-sm md:col-span-2">File<Input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Label>
          <Label className="space-y-1 text-sm md:col-span-2">Notes<Textarea value={payload.notes} onChange={(e) => setPayload((p) => ({ ...p, notes: e.target.value }))} /></Label>
          {mode === "replace" ? <Label className="space-y-1 text-sm md:col-span-2">Replacement reason<Textarea value={payload.reason} onChange={(e) => setPayload((p) => ({ ...p, reason: e.target.value }))} /></Label> : null}
          <div className="flex items-center gap-2 md:col-span-2"><Checkbox checked={payload.is_sensitive} onCheckedChange={(checked) => setPayload((p) => ({ ...p, is_sensitive: Boolean(checked) }))} /><span className="text-sm">Sensitive document</span></div>
          <FormError message={clientError ?? error ?? undefined} />
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} onClick={submit}>{mode === "replace" ? "Replace document" : "Upload document"}</LoadingButton></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
