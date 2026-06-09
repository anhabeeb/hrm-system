import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { ToastViewport } from "./ToastViewport";
import { ToastContext, toastDurations } from "./useToast";
import type { ToastInput, ToastRecord, ToastType } from "./useToast";

const createToastId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `toast_${crypto.randomUUID()}`;
  }
  return `toast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
};

const normalizeToast = (toast: ToastInput): ToastRecord => {
  const type: ToastType = toast.type ?? "info";
  return {
    id: toast.id ?? createToastId(),
    title: toast.title,
    message: toast.message,
    type,
    durationMs: toast.durationMs ?? toastDurations[type],
    persistent: toast.persistent ?? type === "loading",
    action: toast.action,
    createdAt: Date.now(),
  };
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((toast: ToastInput) => {
    const next = normalizeToast(toast);
    setToasts((current) => [next, ...current.filter((item) => item.id !== next.id)].slice(0, 5));
    return next.id;
  }, []);

  const typedToast = useCallback(
    (type: ToastType) =>
      (title: string, message?: string, options: Partial<ToastInput> = {}) =>
        showToast({ ...options, title, message, type }),
    [showToast],
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const message = event instanceof CustomEvent && typeof event.detail === "string"
        ? event.detail
        : "Your session expired. Please sign in again.";
      showToast({
        id: "session-expired",
        title: "Session expired",
        message,
        type: "warning",
        durationMs: 6000,
      });
    };
    window.addEventListener("hrm:session-expired", handler);
    return () => window.removeEventListener("hrm:session-expired", handler);
  }, [showToast]);

  useEffect(() => {
    const timers = toasts
      .filter((toast) => !toast.persistent && toast.durationMs > 0)
      .map((toast) =>
        window.setTimeout(() => dismissToast(toast.id), Math.max(0, toast.durationMs - (Date.now() - toast.createdAt))),
      );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [dismissToast, toasts]);

  const value = useMemo(
    () => ({
      toasts,
      showToast,
      dismissToast,
      clearToasts: () => setToasts([]),
      success: typedToast("success"),
      error: typedToast("error"),
      warning: typedToast("warning"),
      info: typedToast("info"),
    }),
    [dismissToast, showToast, toasts, typedToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};
