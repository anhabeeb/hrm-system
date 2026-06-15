import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { UserRoundX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth.store";
import { getDefaultLandingPath } from "@/lib/default-landing";

export const LINKED_EMPLOYEE_REQUIRED_MESSAGE =
  "Self-service is only available for accounts linked to an employee profile.";

export const LinkedEmployeeOnlyGuard = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  if (user?.employee_id) return <>{children}</>;

  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-700">
          <UserRoundX className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">Employee profile required</h1>
        <p className="mt-2 text-sm text-muted-foreground">{LINKED_EMPLOYEE_REQUIRED_MESSAGE}</p>
        <Button asChild className="mt-5" variant="outline">
          <Link to={getDefaultLandingPath(user)}>Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
};
