import { Menu, Search, UserCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SidebarNavItem } from "@/components/layout/SidebarNavItem";
import { appConfig } from "@/app/config";
import { useAuth } from "@/features/auth/auth.store";
import { getVisibleNavigation } from "@/lib/navigation";

export const Topbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const groups = getVisibleNavigation(user);
  const roleLabel = user?.roles?.[0]?.replace(/_/g, " ") ?? "User";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-3">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 overflow-y-auto p-0">
            <SheetHeader className="border-b p-4">
              <SheetTitle>{appConfig.appName}</SheetTitle>
            </SheetHeader>
            <div className="space-y-5 p-3">
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <SidebarNavItem key={item.path} item={item} collapsed={false} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>
        <Breadcrumbs />
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm text-muted-foreground md:flex">
          <Search className="h-4 w-4" />
          Search placeholder
        </div>
        <Badge variant="outline">{appConfig.environmentLabel}</Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open user menu">
              <UserCircle className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <span className="block">{user?.full_name ?? "User"}</span>
              {user?.email ? <span className="block text-xs font-normal text-muted-foreground">{user.email}</span> : null}
              <span className="block text-xs font-normal capitalize text-muted-foreground">{roleLabel}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link to="/profile">My Profile</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/profile/security">Change Password</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/profile/security">2FA / Security</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                void logout().finally(() => navigate("/login", { replace: true, state: { message: "You have been logged out." } }));
              }}
            >
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
