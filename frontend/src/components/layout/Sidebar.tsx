import { Factory } from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router-dom";

import { SidebarCollapseButton } from "@/components/layout/SidebarCollapseButton";
import { SidebarNavGroup } from "@/components/layout/SidebarNavGroup";
import { SidebarSearch } from "@/components/layout/SidebarSearch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { appConfig } from "@/app/config";
import { useAuth } from "@/features/auth/auth.store";
import { getActiveNavigationItem, getVisibleNavigation, searchNavigation } from "@/config/navigation";
import { useNavigationBadges } from "@/hooks/useNavigationBadges";
import { cn } from "@/lib/utils";

export const Sidebar = ({ collapsed, onCollapsedChange }: { collapsed: boolean; onCollapsedChange: (value: boolean) => void }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const badges = useNavigationBadges();
  const groups = getVisibleNavigation(user);
  const filteredGroups = searchNavigation(groups, query);
  const activePath = getActiveNavigationItem(groups, location.pathname)?.path ?? null;

  return (
    <aside className={cn("sticky top-0 hidden h-screen shrink-0 self-start border-r bg-card transition-[width] duration-200 lg:flex lg:flex-col", collapsed ? "w-16" : "w-64")}>
      <div className={cn("flex h-14 items-center gap-3 border-b px-3", collapsed && "justify-center px-2")}>
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Factory className="h-5 w-5" />
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{appConfig.appName}</p>
            <p className="text-xs text-muted-foreground">Enterprise HRM</p>
          </div>
        ) : null}
      </div>
      <ScrollArea className="flex-1 px-2 py-3">
        <SidebarSearch value={query} onChange={setQuery} collapsed={collapsed} />
        {isLoading ? (
          <div className="space-y-2 px-2 text-xs text-muted-foreground">Loading navigation...</div>
        ) : (
          <div className="space-y-5">
            {filteredGroups.map((group) => (
              <SidebarNavGroup key={group.label} group={group} collapsed={collapsed} badges={badges} activePath={activePath} />
            ))}
            {!collapsed && filteredGroups.length === 0 ? <p className="px-3 text-xs text-muted-foreground">No visible navigation matches your search.</p> : null}
          </div>
        )}
      </ScrollArea>
      <div className="border-t p-2">
        <SidebarCollapseButton collapsed={collapsed} onToggle={() => onCollapsedChange(!collapsed)} />
      </div>
    </aside>
  );
};
