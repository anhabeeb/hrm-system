import { Archive, Check, Download, Edit, Eye, KeyRound, MoreHorizontal, ShieldPlus, Trash2, UserCheck, UserX, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type RowActionKey =
  | "view"
  | "edit"
  | "approve"
  | "reject"
  | "delete"
  | "archive"
  | "enable"
  | "disable"
  | "reset-password"
  | "assign-role"
  | "download"
  | "more";

const actionMeta: Record<RowActionKey, { label: string; icon: React.ElementType }> = {
  view: { label: "View", icon: Eye },
  edit: { label: "Edit", icon: Edit },
  approve: { label: "Approve", icon: Check },
  reject: { label: "Reject", icon: X },
  delete: { label: "Delete", icon: Trash2 },
  archive: { label: "Archive", icon: Archive },
  enable: { label: "Enable", icon: UserCheck },
  disable: { label: "Disable", icon: UserX },
  "reset-password": { label: "Reset password", icon: KeyRound },
  "assign-role": { label: "Assign role", icon: ShieldPlus },
  download: { label: "Download", icon: Download },
  more: { label: "More", icon: MoreHorizontal },
};

export interface RowAction {
  key: RowActionKey;
  label?: string;
  onSelect?: () => void;
  disabled?: boolean;
}

export const RowActions = ({ actions }: { actions: RowAction[] }) => (
  <TooltipProvider>
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open row actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Row actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {actions.map((action) => {
          const meta = actionMeta[action.key];
          const Icon = meta.icon;
          return (
            <DropdownMenuItem key={action.key} onClick={action.onSelect} disabled={action.disabled}>
              <Icon className="h-4 w-4" />
              {action.label ?? meta.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  </TooltipProvider>
);
