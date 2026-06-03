import { useEffect, useState } from "react";
import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DocumentRecord, DocumentUpdatePayload } from "./documents.types";

export const DocumentUpdateDialog = ({ document, open, loading, error, onOpenChange, onSubmit }: { document: DocumentRecord | null; open: boolean; loading?: boolean; error?: string | null; onOpenChange: (open: boolean) => void; onSubmit: (payload: DocumentUpdatePayload) => void }) => {
  const [payload, setPayload] = useState({ document_type: "", file_name: "", expiry_date: "", status: "", is_sensitive: false, reason: "" });
  useEffect(() => { if (open && document) setPayload({ document_type: document.document_type ?? "", file_name: document.file_name ?? "", expiry_date: document.expiry_date ?? "", status: document.status ?? "", is_sensitive: Boolean(document.is_sensitive), reason: "" }); }, [document, open]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Update document metadata</DialogTitle></DialogHeader><div className="space-y-3"><Label className="space-y-1 text-sm">Document type<Input value={payload.document_type} onChange={(e) => setPayload((p) => ({ ...p, document_type: e.target.value }))} /></Label><Label className="space-y-1 text-sm">File name<Input value={payload.file_name} onChange={(e) => setPayload((p) => ({ ...p, file_name: e.target.value }))} /></Label><Label className="space-y-1 text-sm">Expiry date<Input type="date" value={payload.expiry_date} onChange={(e) => setPayload((p) => ({ ...p, expiry_date: e.target.value }))} /></Label><Label className="space-y-1 text-sm">Status<Input value={payload.status} onChange={(e) => setPayload((p) => ({ ...p, status: e.target.value }))} /></Label><div className="flex items-center gap-2"><Checkbox checked={payload.is_sensitive} onCheckedChange={(checked) => setPayload((p) => ({ ...p, is_sensitive: Boolean(checked) }))} /><span className="text-sm">Sensitive document</span></div><Label className="space-y-1 text-sm">Reason<Textarea value={payload.reason} onChange={(e) => setPayload((p) => ({ ...p, reason: e.target.value }))} /></Label><FormError message={error ?? undefined} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} onClick={() => onSubmit({ ...payload, expiry_date: payload.expiry_date || null })}>Update document</LoadingButton></DialogFooter></DialogContent></Dialog>;
};
