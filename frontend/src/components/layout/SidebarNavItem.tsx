import { NavLink, useLocation } from "react-router-dom";

import { SidebarBadge } from "@/components/layout/SidebarBadge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { isNavigationItemActive } from "@/config/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/types/navigation";

export const SidebarNavItem = ({
  item,
  collapsed,
  badgeValue,
  warningValue,
  active: activeOverride,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  badgeValue?: number | string | null;
  warningValue?: number | string | null;
  active?: boolean;
  onNavigate?: () => void;
}) => {
  const Icon = item.icon;
  const location = useLocation();
  const active = activeOverride ?? isNavigationItemActive(item, location.pathname);
  const link = (
    <NavLink
      to={item.path}
      onClick={onNavigate}
      className={cn(
        "relative flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-accent hover:text-accent-foreground",
        collapsed && "mx-auto h-10 w-10 justify-center gap-0 px-0",
        active && "bg-primary/10 text-primary shadow-soft-border",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", collapsed && "mx-auto")} />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
      <SidebarBadge value={badgeValue ?? item.badge} collapsed={collapsed} warning={Boolean(warningValue)} />
    </NavLink>
  );

  if (!collapsed) return link;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
