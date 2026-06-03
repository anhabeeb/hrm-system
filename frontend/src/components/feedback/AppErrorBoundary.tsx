import { Component, type ErrorInfo, type ReactNode } from "react";

import { ApiError, toDiagnosticText } from "@/lib/api-errors";

import { AppErrorAlert } from "./AppErrorAlert";

interface State {
  error: ApiError | null;
}

const createUiError = (error: Error) =>
  new ApiError("A screen failed to render safely. Please reload the page and try again.", {
    code: "UI_RENDER_ERROR",
    title: "Something went wrong in the app",
    status: 0,
    requestId: `ui_${Date.now().toString(36)}`,
    retryable: true,
    technicalMessage: error.message,
    suggestedAction: "Reload the page. If this continues, copy diagnostics and share them with support.",
  });

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error: createUiError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Frontend render error", {
      error: error.message,
      componentStack: info.componentStack,
      diagnostics: this.state.error ? toDiagnosticText(this.state.error, "HRM UI Error") : undefined,
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto flex min-h-screen max-w-2xl items-center px-6">
          <AppErrorAlert error={this.state.error} onRetry={() => window.location.reload()} />
        </div>
      );
    }

    return this.props.children;
  }
}
