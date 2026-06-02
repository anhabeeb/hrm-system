import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export const FormActions = ({
  submitLabel = "Save",
  cancelLabel = "Cancel",
  onCancel,
  submitting,
  children,
}: {
  submitLabel?: string;
  cancelLabel?: string;
  onCancel?: () => void;
  submitting?: boolean;
  children?: ReactNode;
}) => (
  <div className="flex items-center justify-end gap-2 border-t pt-4">
    {children}
    {onCancel ? (
      <Button type="button" variant="outline" onClick={onCancel}>
        {cancelLabel}
      </Button>
    ) : null}
    <Button type="submit" disabled={submitting}>
      {submitting ? "Saving..." : submitLabel}
    </Button>
  </div>
);
