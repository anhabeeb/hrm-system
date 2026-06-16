import type { PersonalizedDashboardWidget } from "./dashboardPreferences.types";
import { movePersonalizedWidget, togglePersonalizedWidget } from "./dashboardPreferences.utils";
import { DashboardWidgetOrderControls } from "./DashboardWidgetOrderControls";
import { DashboardWidgetVisibilityToggle } from "./DashboardWidgetVisibilityToggle";

interface DashboardWidgetListEditorProps {
  widgets: PersonalizedDashboardWidget[];
  onChange: (widgets: PersonalizedDashboardWidget[]) => void;
}

export const DashboardWidgetListEditor = ({ widgets, onChange }: DashboardWidgetListEditorProps) => {
  const ordered = [...widgets].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-2">
      {ordered.map((widget, index) => (
        <div key={widget.id} className="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
          <div className="flex min-w-0 items-start gap-3">
            <DashboardWidgetVisibilityToggle
              checked={widget.visible}
              onCheckedChange={(visible) => onChange(togglePersonalizedWidget(ordered, widget.id, visible))}
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-900">{widget.label}</div>
              <div className="line-clamp-2 text-xs text-muted-foreground">{widget.description}</div>
            </div>
          </div>
          <DashboardWidgetOrderControls
            canMoveUp={index > 0}
            canMoveDown={index < ordered.length - 1}
            onMoveUp={() => onChange(movePersonalizedWidget(ordered, widget.id, "up"))}
            onMoveDown={() => onChange(movePersonalizedWidget(ordered, widget.id, "down"))}
          />
        </div>
      ))}
    </div>
  );
};
