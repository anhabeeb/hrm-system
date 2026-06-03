import { NavLink } from "react-router-dom";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/types/navigation";

export const SidebarNavItem = ({ item, collapsed }: { item: NavItem; collapsed: boolean }) => {
  const Icon = item.icon;
  const link = (
    <NavLink
      to={item.path}
      className={({ isActive }) =>
        cn(
          "flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-accent hover:text-accent-foreground",
          collapsed && "justify-center px-2",
          isActive && "bg-primary/10 text-primary shadow-soft-border",
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
      {!collapsed && item.badge ? <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-xs">{item.badge}</span> : null}
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
