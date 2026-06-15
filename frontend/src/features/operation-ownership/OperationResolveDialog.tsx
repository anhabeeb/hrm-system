import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const OperationResolveDialog = ({
  open,
  result,
  onOpenChange,
}: {
  open: boolean;
  result: unknown;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Operation Resolution Preview</DialogTitle>
      </DialogHeader>
      <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(result ?? {}, null, 2)}</pre>
    </DialogContent>
  </Dialog>
);
