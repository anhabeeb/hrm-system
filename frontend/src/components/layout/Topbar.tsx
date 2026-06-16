import { UserCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MobileSidebar } from "@/components/layout/MobileSidebar";
import { useAuth } from "@/features/auth/auth.store";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { getVisibleNavigation } from "@/config/navigation";
import { useNavigationBadges } from "@/hooks/useNavigationBadges";
import { appConfig } from "@/app/config";

export const Topbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const groups = getVisibleNavigation(user);
  const badges = useNavigationBadges();
  const roleLabel = user?.roles?.[0]?.replace(/_/g, " ") ?? "User";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-3">
        <MobileSidebar groups={groups} badges={badges} />
        <Breadcrumbs />
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline">{appConfig.environmentLabel}</Badge>
        <NotificationBell />
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
