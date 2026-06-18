import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/features/auth/auth.store";

import { useSetupGuideStatus } from "./useSetupGuide";

const SKIP_REDIRECT_KEY = "hrm.setupGuide.redirectSkipped";

export const SetupGuideGate = () => {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const canManageSetup = auth.isSuperAdmin || auth.hasAnyPermission(["setup_guide.manage", "settings.manage"]);
  const query = useSetupGuideStatus(Boolean(auth.isAuthenticated && canManageSetup));

  useEffect(() => {
    const progress = query.data?.data;
    if (!progress || progress.setup_wizard_completed || !canManageSetup) return;
    if (location.pathname === "/setup-wizard" || location.pathname.startsWith("/self/")) return;
    if (window.sessionStorage.getItem(SKIP_REDIRECT_KEY) === "1") return;
    if (progress.setup_wizard_skipped_at) return;

    window.sessionStorage.setItem(SKIP_REDIRECT_KEY, "1");
    navigate("/setup-wizard", { replace: true });
  }, [canManageSetup, location.pathname, navigate, query.data?.data]);

  return null;
};
