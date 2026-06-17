import { Link } from "react-router-dom";
import { PowerOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth.store";
import { getDefaultLandingPath } from "@/lib/default-landing";

export const MODULE_DISABLED_MESSAGE = "This module is currently disabled.";

export const ModuleDisabledPage = ({ moduleName = "This module" }: { moduleName?: string }) => {
  const { user } = useAuth();
  const specificModule = moduleName !== "This module";

  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 text-slate-600">
          <PowerOff className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">{specificModule ? `${moduleName} is disabled.` : MODULE_DISABLED_MESSAGE}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {specificModule ? `${moduleName} is disabled. Enable it in Settings to use this module.` : `${moduleName} is not available right now. Please contact your administrator if you need access.`}
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link to={getDefaultLandingPath(user)}>Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
};
