import { Menu } from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router-dom";

import { SidebarNavGroup } from "@/components/layout/SidebarNavGroup";
import { SidebarSearch } from "@/components/layout/SidebarSearch";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { appConfig } from "@/app/config";
import { getActiveNavigationItem, searchNavigation } from "@/config/navigation";
import type { NavigationBadges, NavGroup } from "@/types/navigation";

export const MobileSidebar = ({ groups, badges }: { groups: NavGroup[]; badges?: NavigationBadges }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const location = useLocation();
  const filteredGroups = searchNavigation(groups, query);
  const activePath = getActiveNavigationItem(groups, location.pathname)?.path ?? null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 overflow-y-auto p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{appConfig.appName}</SheetTitle>
        </SheetHeader>
        <div className="p-3">
          <SidebarSearch value={query} onChange={setQuery} />
          <div className="space-y-5">
            {filteredGroups.map((group) => (
              <SidebarNavGroup
                key={group.label}
                group={group}
                collapsed={false}
                badges={badges}
                activePath={activePath}
                onNavigate={() => setOpen(false)}
              />
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
