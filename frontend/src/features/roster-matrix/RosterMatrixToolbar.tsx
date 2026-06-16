import { Button } from "@/components/ui/button";
import type { RosterWeeklyMatrixResponse } from "./rosterWeeklyMatrix.types";

export const RosterMatrixToolbar = ({
  permissions,
  selectedCount,
  onValidate,
  onSaveDraft,
  onSubmit,
  onCopyWeek,
  onBulkAssign,
}: {
  permissions?: RosterWeeklyMatrixResponse["permissions"];
  selectedCount: number;
  onValidate: () => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  onCopyWeek: () => void;
  onBulkAssign: () => void;
}) => (
  <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3">
    <Button size="sm" variant="outline" disabled={selectedCount === 0} onClick={onValidate}>Validate conflicts</Button>
    <Button size="sm" variant="outline" disabled={!permissions?.can_edit || selectedCount === 0} onClick={onSaveDraft}>Save draft</Button>
    <Button size="sm" disabled={!permissions?.can_submit || selectedCount === 0} onClick={onSubmit}>Submit changes</Button>
    <Button size="sm" variant="outline" disabled={!permissions?.can_edit} onClick={onCopyWeek}>Copy previous week</Button>
    {permissions?.can_bulk_assign ? <Button size="sm" variant="outline" onClick={onBulkAssign}>Bulk assign</Button> : null}
    <span className="ml-auto text-xs text-muted-foreground">{selectedCount} pending local change{selectedCount === 1 ? "" : "s"}</span>
  </div>
);
