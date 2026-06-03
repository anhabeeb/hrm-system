import { AppProviders } from "@/app/providers";
import { AppRouter } from "@/app/router";
import { AppErrorBoundary } from "@/components/feedback/AppErrorBoundary";
import { BootstrapStatusGate } from "@/features/bootstrap/BootstrapStatusGate";

export const App = () => (
  <AppErrorBoundary>
    <AppProviders>
      <BootstrapStatusGate>
        <AppRouter />
      </BootstrapStatusGate>
    </AppProviders>
  </AppErrorBoundary>
);
