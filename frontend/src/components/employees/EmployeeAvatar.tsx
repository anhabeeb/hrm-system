import { UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

const initialsFor = (name?: string | null, code?: string | null) => {
  const source = (name ?? code ?? "").trim();
  if (!source) return "";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[words.length - 1][0] ?? ""}`.toUpperCase();
};

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
} as const;

export interface EmployeeAvatarProps {
  name?: string | null;
  employeeCode?: string | null;
  photoUrl?: string | null;
  size?: keyof typeof sizeClasses;
  className?: string;
}

export const EmployeeAvatar = ({
  name,
  employeeCode,
  photoUrl,
  size = "md",
  className,
}: EmployeeAvatarProps) => {
  const initials = initialsFor(name, employeeCode);

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border bg-slate-100 font-semibold text-slate-600",
        sizeClasses[size],
        className,
      )}
      aria-label={name ? `${name} profile picture` : "Employee profile picture"}
      title={name ?? employeeCode ?? "Employee"}
    >
      {photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : initials || <UserRound className="h-4 w-4" />}
    </div>
  );
};

