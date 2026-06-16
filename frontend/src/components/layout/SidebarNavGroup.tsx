import { SidebarNavItem } from "@/components/layout/SidebarNavItem";
import type { NavigationBadges, NavGroup } from "@/types/navigation";

export const SidebarNavGroup = ({
  group,
  collapsed,
  badges,
  activePath,
  onNavigate,
}: {
  group: NavGroup;
  collapsed: boolean;
  badges?: NavigationBadges;
  activePath?: string | null;
  onNavigate?: () => void;
}) => (
  <div data-nav-group={group.id ?? group.label}>
    {!collapsed ? <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p> : null}
    <div className="space-y-1">
      {group.items.map((item) => (
        <SidebarNavItem
          key={item.path}
          item={item}
          collapsed={collapsed}
          badgeValue={item.badgeKey ? badges?.[item.badgeKey] : item.badge}
          warningValue={item.warningKey ? badges?.[item.warningKey] : undefined}
          active={activePath === item.path}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  </div>
);
