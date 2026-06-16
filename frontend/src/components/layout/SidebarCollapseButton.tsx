import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const SidebarCollapseButton = ({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) => (
  <Button
    variant="ghost"
    size={collapsed ? "icon" : "sm"}
    className={cn(collapsed ? "mx-auto flex h-10 w-10 justify-center px-0" : "w-full justify-start")}
    onClick={onToggle}
    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
  >
    {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
    {!collapsed ? "Collapse" : null}
  </Button>
);
