import { Checkbox } from "@/components/ui/checkbox";

interface DashboardWidgetVisibilityToggleProps {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export const DashboardWidgetVisibilityToggle = ({
  checked,
  disabled,
  onCheckedChange,
}: DashboardWidgetVisibilityToggleProps) => (
  <Checkbox
    aria-label={checked ? "Hide widget" : "Show widget"}
    checked={checked}
    disabled={disabled}
    onCheckedChange={(value) => onCheckedChange(value === true)}
  />
);
