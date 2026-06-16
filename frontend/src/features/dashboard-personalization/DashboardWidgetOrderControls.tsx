import { ArrowDown, ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";

interface DashboardWidgetOrderControlsProps {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export const DashboardWidgetOrderControls = ({
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: DashboardWidgetOrderControlsProps) => (
  <div className="flex items-center gap-1">
    <Button aria-label="Move widget up" size="icon" type="button" variant="ghost" disabled={!canMoveUp} onClick={onMoveUp}>
      <ArrowUp className="h-4 w-4" />
    </Button>
    <Button aria-label="Move widget down" size="icon" type="button" variant="ghost" disabled={!canMoveDown} onClick={onMoveDown}>
      <ArrowDown className="h-4 w-4" />
    </Button>
  </div>
);
