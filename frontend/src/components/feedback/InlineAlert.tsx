import type { ReactNode } from "react";
import { useEffect } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { useOptionalToast } from "./useToast";

const variants = {
  info: "border-blue-200 bg-blue-50 text-blue-900",
  success: "border-green-200 bg-green-50 text-green-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
};

const icons = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle,
};

export const InlineAlert = ({
  title,
  children,
  variant = "info",
  requestId,
}: {
  title: string;
  children?: ReactNode;
  variant?: keyof typeof variants;
  requestId?: string;
}) => {
  const Icon = icons[variant];
  const toast = useOptionalToast();

  useEffect(() => {
    if (variant === "success" && toast) {
      toast.success(title, typeof children === "string" ? children : undefined);
    }
  }, [children, title, toast, variant]);

  if (variant === "success") return null;

  return (
    <div className={cn("rounded-lg border p-4 text-sm", variants[variant])}>
      <div className="flex gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">{title}</p>
          {children ? <div className="mt-1 text-sm opacity-90">{children}</div> : null}
          {requestId ? <p className="mt-2 text-xs opacity-70">Request ID: {requestId}</p> : null}
        </div>
      </div>
    </div>
  );
};
