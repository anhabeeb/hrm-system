import { Factory } from "lucide-react";

import { appConfig } from "@/app/config";

export const FirstTimeSetupPlaceholder = () => (
  <main className="flex min-h-screen items-center justify-center bg-background px-6">
    <section className="w-full max-w-xl rounded-lg border bg-card p-8 shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Factory className="h-6 w-6" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold">Initial setup is required.</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {appConfig.appName} is ready for first-time setup. Please continue to the setup screen.
      </p>
      <p className="mt-4 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        For now, keep the bootstrap token out of the browser UI. The backend setup endpoint remains available for controlled initialization.
      </p>
    </section>
  </main>
);
