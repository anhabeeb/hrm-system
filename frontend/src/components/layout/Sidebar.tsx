import { ChevronLeft, ChevronRight, Factory } from "lucide-react";

import { SidebarNavItem } from "@/components/layout/SidebarNavItem";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { appConfig } from "@/app/config";
import { useAuth } from "@/features/auth/auth.store";
import { getVisibleNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export const Sidebar = ({ collapsed, onCollapsedChange }: { collapsed: boolean; onCollapsedChange: (value: boolean) => void }) => {
  const { user, isLoading } = useAuth();
  const groups = getVisibleNavigation(user);

  return (
    <aside className={cn("hidden h-screen shrink-0 border-r bg-card transition-[width] duration-200 lg:flex lg:flex-col", collapsed ? "w-16" : "w-64")}>
      <div className="flex h-14 items-center gap-3 border-b px-3">
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
        {isLoading ? (
          <div className="space-y-2 px-2 text-xs text-muted-foreground">Loading navigation...</div>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <div key={group.label}>
                {!collapsed ? <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p> : null}
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <SidebarNavItem key={item.path} item={item} collapsed={collapsed} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
      <div className="border-t p-2">
        <Button variant="ghost" size={collapsed ? "icon" : "sm"} className={cn("w-full", !collapsed && "justify-start")} onClick={() => onCollapsedChange(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!collapsed ? "Collapse" : null}
        </Button>
      </div>
    </aside>
  );
};
