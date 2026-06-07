import { useState } from "react";
import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const copy = {
  approve: ["Approve approval request", "Approval request approved.", "Approve"],
  reject: ["Reject approval request", "Approval request rejected.", "Reject"],
  return: ["Return for more information", "Approval request returned for more information.", "Return"],
  cancel: ["Cancel approval request", "Approval request cancelled.", "Cancel request"],
  retry: ["Retry approval request", "Approval request retry started.", "Retry"],
  override: ["Override approval request", "Approval request overridden successfully.", "Override"],
} as const;

export const ApprovalActionDialog = ({ action, open, loading, error, reasonRequired, onOpenChange, onSubmit }: { action: "approve" | "reject" | "return" | "cancel" | "retry" | "override"; open: boolean; loading?: boolean; error?: string | null; reasonRequired?: boolean; onOpenChange: (open: boolean) => void; onSubmit: (payload: { reason: string; decision?: "approve" | "reject" }) => void }) => {
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const selected = copy[action];
  const reasonPolicyText = reasonRequired ? "A reason is required for this action." : "A reason is optional for this action based on current approval settings.";
  const submitDisabled = reasonRequired === true && reason.trim().length < 3;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{selected[0]}</DialogTitle><DialogDescription>{reasonPolicyText}</DialogDescription></DialogHeader><div className="space-y-3">{action === "override" ? <Select value={decision} onValueChange={(value) => setDecision(value as "approve" | "reject")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="approve">Approve</SelectItem><SelectItem value="reject">Reject</SelectItem></SelectContent></Select> : null}<Textarea value={reason} placeholder={reasonRequired ? "Reason" : "Reason (optional)"} onChange={(e) => setReason(e.target.value)} /><FormError message={error ?? undefined} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} disabled={submitDisabled} onClick={() => onSubmit({ reason, decision: action === "override" ? decision : undefined })}>{selected[2]}</LoadingButton></DialogFooter></DialogContent></Dialog>;
};
