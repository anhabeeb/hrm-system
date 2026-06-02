import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export const PermissionDenied = () => (
  <div className="flex min-h-[55vh] items-center justify-center">
    <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-700">
        <ShieldAlert className="h-5 w-5" />
      </div>
      <h1 className="mt-4 text-lg font-semibold">You do not have access to this page.</h1>
      <p className="mt-2 text-sm text-muted-foreground">Please contact your administrator if you believe this is a mistake.</p>
      <Button asChild className="mt-5">
        <Link to="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  </div>
);

export const FullPagePermissionDenied = PermissionDenied;
