import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export const RosterCopyWeekDialog = ({
  open,
  loading,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Copy previous week roster</DialogTitle>
        <DialogDescription>
          This creates proposed matrix changes from the previous week. Review conflicts before saving or submitting.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button disabled={loading} onClick={onConfirm}>{loading ? "Copying..." : "Copy previous week"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
