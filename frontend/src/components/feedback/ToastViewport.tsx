import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ToastRecord, ToastType } from "./useToast";

const styles: Record<ToastType, string> = {
  success: "border-green-200 bg-white text-green-950 shadow-green-950/10",
  error: "border-red-200 bg-white text-red-950 shadow-red-950/10",
  warning: "border-amber-200 bg-white text-amber-950 shadow-amber-950/10",
  info: "border-blue-200 bg-white text-blue-950 shadow-blue-950/10",
  loading: "border-slate-200 bg-white text-slate-950 shadow-slate-950/10",
};

const iconStyles: Record<ToastType, string> = {
  success: "text-green-600",
  error: "text-red-600",
  warning: "text-amber-600",
  info: "text-blue-600",
  loading: "text-slate-600",
};

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: TriangleAlert,
  info: Info,
  loading: Loader2,
};

export const ToastViewport = ({
  toasts,
  onDismiss,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
}) => (
  <div
    aria-live="polite"
    aria-relevant="additions text"
    className="pointer-events-none fixed bottom-4 right-4 z-40 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-3 sm:bottom-auto sm:right-6 sm:top-6"
  >
    {toasts.map((toast) => {
      const Icon = icons[toast.type];
      return (
        <div
          key={toast.id}
          role={toast.type === "error" || toast.type === "warning" ? "alert" : "status"}
          className={cn("pointer-events-none rounded-xl border p-4 text-sm shadow-lg", styles[toast.type])}
        >
          <div className="flex gap-3">
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconStyles[toast.type], toast.type === "loading" && "animate-spin")} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-5">{toast.title}</p>
              {toast.message ? <p className="mt-1 text-sm leading-5 text-slate-600">{toast.message}</p> : null}
              {toast.action ? <div className="pointer-events-auto mt-3">{toast.action}</div> : null}
            </div>
            <Button
              aria-label="Dismiss notification"
              className="pointer-events-auto -mr-2 -mt-2 h-7 w-7 shrink-0 text-slate-500 hover:text-slate-900"
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => onDismiss(toast.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    })}
  </div>
);
