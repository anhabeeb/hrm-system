import { useState } from "react";
import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DocumentUploadPayload } from "./documents.types";

const dangerousTypes = new Set(["text/html", "image/svg+xml", "application/x-msdownload", "application/x-msdos-program"]);

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
  reader.onerror = () => reject(new Error("Document file could not be read."));
  reader.readAsDataURL(file);
});

export const DocumentUploadDialog = ({ open, loading, error, onOpenChange, onSubmit }: { open: boolean; loading?: boolean; error?: string | null; onOpenChange: (open: boolean) => void; onSubmit: (payload: DocumentUploadPayload) => void }) => {
  const [payload, setPayload] = useState({ employee_id: "", document_type: "", expiry_date: "", is_sensitive: true });
  const [file, setFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const submit = async () => {
    setClientError(null);
    if (!file) { setClientError("Please attach a document file before uploading."); return; }
    if (dangerousTypes.has(file.type)) { setClientError("This document type is not allowed."); return; }
    const content_base64 = await fileToBase64(file);
    onSubmit({ employee_id: payload.employee_id, document_type: payload.document_type, file_name: file.name, mime_type: file.type || "application/octet-stream", content_base64, expiry_date: payload.expiry_date || undefined, is_sensitive: payload.is_sensitive });
    setFile(null);
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Upload document</DialogTitle><DialogDescription>File content is converted to base64 only during submit and cleared afterward.</DialogDescription></DialogHeader><div className="space-y-3"><Label className="space-y-1 text-sm">Employee ID<Input value={payload.employee_id} onChange={(e) => setPayload((p) => ({ ...p, employee_id: e.target.value }))} /></Label><Label className="space-y-1 text-sm">Document type<Input value={payload.document_type} onChange={(e) => setPayload((p) => ({ ...p, document_type: e.target.value }))} /></Label><Label className="space-y-1 text-sm">Expiry date<Input type="date" value={payload.expiry_date} onChange={(e) => setPayload((p) => ({ ...p, expiry_date: e.target.value }))} /></Label><Label className="space-y-1 text-sm">File<Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Label><div className="flex items-center gap-2"><Checkbox checked={payload.is_sensitive} onCheckedChange={(checked) => setPayload((p) => ({ ...p, is_sensitive: Boolean(checked) }))} /><span className="text-sm">Sensitive document</span></div><FormError message={clientError ?? error ?? undefined} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} onClick={submit}>Upload document</LoadingButton></DialogFooter></DialogContent></Dialog>;
};
