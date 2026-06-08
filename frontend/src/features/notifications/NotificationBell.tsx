import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/features/auth/auth.store";
import { notificationsApi } from "./notifications.api";

const timeLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const NotificationBell = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const canView = auth.hasAnyPermission(["notifications.view", "notifications.manage_own"]);
  const countQuery = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: notificationsApi.unreadCount,
    enabled: canView,
    staleTime: 60_000,
  });
  const listQuery = useQuery({
    queryKey: ["notifications", "recent-unread"],
    queryFn: () => notificationsApi.list({ unread_only: true, page_size: 5 }),
    enabled: canView,
    staleTime: 60_000,
  });
  const markReadMutation = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  if (!canView) return null;
  const unreadCount = countQuery.data?.data.unread_count ?? 0;
  const notifications = listQuery.data?.data ?? [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open notifications" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 ? (
            <Badge className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full px-1 text-[10px]">
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">{unreadCount} unread</p>
          </div>
          <Button variant="ghost" size="sm" asChild><Link to="/notifications">View all</Link></Button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No unread notifications. Tiny confetti, professionally withheld.</div>
          ) : notifications.map((notification) => (
            <div key={notification.id} className="border-b p-3 last:border-b-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{notification.title}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{notification.message}</p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="capitalize">{notification.category.replace(/_/g, " ")}</span>
                    <span>{timeLabel(notification.created_at)}</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Mark read" onClick={() => markReadMutation.mutate(notification.id)}>
                  <Check className="h-4 w-4" />
                </Button>
              </div>
              {notification.action_url ? (
                <Button variant="link" size="sm" className="mt-1 h-auto px-0 text-xs" asChild>
                  <Link to={notification.action_url}>{notification.action_label ?? "Open"}<ExternalLink className="ml-1 h-3 w-3" /></Link>
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
