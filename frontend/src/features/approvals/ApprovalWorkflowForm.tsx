import { useEffect, useState } from "react";
import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ApprovalWorkflow } from "./approvals.types";

export const ApprovalWorkflowForm = ({ workflow, open, loading, error, onOpenChange, onSubmit }: { workflow?: ApprovalWorkflow | null; open: boolean; loading?: boolean; error?: string | null; onOpenChange: (open: boolean) => void; onSubmit: (payload: Partial<ApprovalWorkflow> & { reason?: string }) => void }) => {
  const [payload, setPayload] = useState({ workflow_key: "", workflow_name: "", module: "", approval_mode: "manual", reason: "" });
  useEffect(() => { if (open) setPayload({ workflow_key: workflow?.workflow_key ?? "", workflow_name: workflow?.workflow_name ?? "", module: workflow?.module ?? "", approval_mode: workflow?.approval_mode ?? "manual", reason: "" }); }, [workflow, open]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{workflow ? "Edit workflow" : "Create workflow"}</DialogTitle></DialogHeader><div className="space-y-3"><Label className="space-y-1 text-sm">Workflow key<Input value={payload.workflow_key} onChange={(e) => setPayload((p) => ({ ...p, workflow_key: e.target.value }))} /></Label><Label className="space-y-1 text-sm">Workflow name<Input value={payload.workflow_name} onChange={(e) => setPayload((p) => ({ ...p, workflow_name: e.target.value }))} /></Label><Label className="space-y-1 text-sm">Module<Input value={payload.module} onChange={(e) => setPayload((p) => ({ ...p, module: e.target.value }))} /></Label><Label className="space-y-1 text-sm">Approval mode<Input value={payload.approval_mode} onChange={(e) => setPayload((p) => ({ ...p, approval_mode: e.target.value }))} /></Label><Label className="space-y-1 text-sm">Reason<Textarea value={payload.reason} onChange={(e) => setPayload((p) => ({ ...p, reason: e.target.value }))} /></Label><FormError message={error ?? undefined} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} onClick={() => onSubmit(payload)}>{workflow ? "Update workflow" : "Create workflow"}</LoadingButton></DialogFooter></DialogContent></Dialog>;
};
