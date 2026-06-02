import { Factory } from "lucide-react";

import { appConfig } from "@/app/config";

import { FirstTimeSetupForm } from "./FirstTimeSetupForm";

export const FirstTimeSetupPage = () => (
  <main className="min-h-screen bg-background px-4 py-8 sm:px-6">
    <section className="mx-auto max-w-5xl rounded-lg border bg-card shadow-sm">
      <div className="border-b p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Factory className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-primary">{appConfig.appName}</p>
            <h1 className="text-2xl font-semibold tracking-tight">First-Time Setup</h1>
          </div>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Create the company profile and first Super Admin account. This setup runs once and does not sign you in automatically.
        </p>
      </div>
      <div className="p-6">
        <FirstTimeSetupForm />
      </div>
    </section>
  </main>
);
