import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface DashboardResetLayoutButtonProps {
  disabled?: boolean;
  onReset: () => void;
}

export const DashboardResetLayoutButton = ({ disabled, onReset }: DashboardResetLayoutButtonProps) => (
  <Button type="button" variant="outline" disabled={disabled} onClick={onReset}>
    <RotateCcw className="h-4 w-4" />
    Reset to default
  </Button>
);
