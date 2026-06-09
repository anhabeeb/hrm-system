import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export type ToastType = "success" | "error" | "warning" | "info" | "loading";

export interface ToastInput {
  id?: string;
  title: string;
  message?: string;
  type?: ToastType;
  durationMs?: number;
  persistent?: boolean;
  action?: ReactNode;
}

export interface ToastRecord extends Required<Pick<ToastInput, "id" | "title" | "type">> {
  message?: string;
  durationMs: number;
  persistent: boolean;
  action?: ReactNode;
  createdAt: number;
}

export interface ToastContextValue {
  toasts: ToastRecord[];
  showToast: (toast: ToastInput) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
  success: (title: string, message?: string, options?: Partial<ToastInput>) => string;
  error: (title: string, message?: string, options?: Partial<ToastInput>) => string;
  warning: (title: string, message?: string, options?: Partial<ToastInput>) => string;
  info: (title: string, message?: string, options?: Partial<ToastInput>) => string;
}

export const toastDurations: Record<ToastType, number> = {
  success: 3000,
  info: 4000,
  warning: 5000,
  error: 6000,
  loading: 0,
};

export const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider.");
  }
  return context;
};

export const useOptionalToast = () => useContext(ToastContext);
