import type { ReactNode } from "react";
import { Factory } from "lucide-react";
import { Link } from "react-router-dom";

import { appConfig } from "@/app/config";

export const AuthLayout = ({ title, description, children }: { title: string; description: string; children: ReactNode }) => (
  <main className="grid min-h-screen bg-background lg:grid-cols-[1fr_520px]">
    <section className="hidden border-r bg-slate-50 px-12 py-10 lg:flex lg:flex-col lg:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Factory className="h-5 w-5" />
        </div>
        <div>
          <p className="font-semibold">{appConfig.appName}</p>
          <p className="text-sm text-muted-foreground">Enterprise HRM administration</p>
        </div>
      </div>
      <div className="max-w-xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Professional HR operations</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
          A table-first workspace for attendance, leave, payroll, documents, and approvals.
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          This frontend foundation is ready to connect to the existing `/api/v1` backend while the module screens arrive in future prompts.
        </p>
      </div>
      <p className="text-sm text-muted-foreground">Light theme only • Secure API foundation • Permission-aware navigation</p>
    </section>
    <section className="flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <Link to="/login" className="mb-8 flex items-center gap-3 lg:hidden">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Factory className="h-5 w-5" />
          </div>
          <span className="font-semibold">{appConfig.appName}</span>
        </Link>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          {children}
        </div>
      </div>
    </section>
  </main>
);
