import { AppProviders } from "@/app/providers";
import { AppRouter } from "@/app/router";
import { BootstrapStatusGate } from "@/features/bootstrap/BootstrapStatusGate";

export const App = () => (
  <AppProviders>
    <BootstrapStatusGate>
      <AppRouter />
    </BootstrapStatusGate>
  </AppProviders>
);
